const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const project = () => ({
  id: 'utility-fixture', address: '100 Fixture Lane, Albuquerque, NM',
  site_visit_status: 'Completed', engineering_status: 'Not required',
  utility_review_status: 'Confirmed', sewer_confirmation_status: 'Confirmed',
  setbacks_site_plan_status: 'Confirmed', supplier_status: 'Compared',
});
const utilities = () => Object.fromEntries(['water', 'electric', 'sewer'].map(id => [id, {
  status: 'confirmed', notes: `Recorded ${id} confirmation for this fixture site.`,
}]));
const review = (job, patch = {}) => ({
  project_id: job.id, version: randomUUID(), address_snapshot: job.address,
  status: 'reviewed', jurisdiction: 'albuquerque', parcel_id: 'fixture-parcel',
  width_ft: '', depth_ft: '', notes: 'Fixture desktop review; field review remains separate.',
  checks: { parcel: true, zoning: true, access: true, easements: true, utilities: true },
  utility_reviews: utilities(), updated_at: '2026-09-30T18:00:00.000Z', ...patch,
});

describe('estimate utility readiness', () => {
  const readiness = (job, history) => require('../src/services/estimateEngine').getReadinessLabel(job, { gis_reviews: history });

  test.each(['missing', 'legacy review', 'unknown water', 'needs-work electric', 'in-review sewer', 'invalid confirmation', 'stale address', 'sticky stale', 'other project'])('%s cannot become ready from old combined confirmations', condition => {
    const job = project(), item = review(job);
    let history = [item];
    if (condition === 'missing') history = [];
    if (condition === 'legacy review') delete item.utility_reviews;
    if (condition === 'unknown water') item.utility_reviews.water.status = 'unknown';
    if (condition === 'needs-work electric') item.utility_reviews.electric.status = 'needs_work';
    if (condition === 'in-review sewer') item.utility_reviews.sewer.status = 'in_review';
    if (condition === 'invalid confirmation') item.utility_reviews.water.notes = '';
    if (condition === 'stale address') item.address_snapshot = 'Another fixture site';
    if (condition === 'sticky stale') item.invalidated_at = '2026-09-30T19:00:00.000Z';
    if (condition === 'other project') item.project_id = 'another-project';
    expect(readiness(job, history)).toBe('Needs utility review');
  });

  test('only the latest revision controls utility readiness and forged project summaries cannot override it', () => {
    const job = { ...project(), utility_review_summary: { status: 'recorded', items: ['water', 'electric', 'sewer'].map(id => ({ id, status: 'confirmed' })) }, utility_reviews: utilities() };
    const earlier = review(job), later = review(job);
    later.utility_reviews.electric.status = 'needs_work';
    expect(readiness(job, [earlier, later])).toBe('Needs utility review');
    expect(readiness(job, [later, earlier])).toBe('Ready to send');
    expect(readiness(job, [])).toBe('Needs utility review');
  });

  test.each([
    [{}, 'Ready to send'],
    [{ utility_review_status: 'Needs confirmation', sewer_confirmation_status: 'Needs sewer confirmation study' }, 'Ready to send'],
    [{ site_visit_status: 'Scheduled' }, 'Missing site data'],
    [{ engineering_status: 'Needs engineering' }, 'Needs engineering'],
    [{ setbacks_site_plan_status: 'In review' }, 'Needs site plan'],
    [{ supplier_status: 'Needs supplier comparison' }, 'Needs supplier comparison'],
  ])('current utility confirmations preserve other readiness gates: %j', (patch, expected) => {
    const job = { ...project(), ...patch };
    expect(readiness(job, [review(job)])).toBe(expected);
  });
});

describe('utility readiness in the shared JSON store', () => {
  let directory, oldPath, store;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-utility-readiness-'));
    oldPath = process.env.COMMAND_CENTER_STORE_PATH;
    process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'state.json');
    fs.writeFileSync(process.env.COMMAND_CENTER_STORE_PATH, JSON.stringify({ projects: [project()] }));
    jest.resetModules();
    store = require('../src/services/commandCenterStore');
  });
  afterEach(() => {
    if (oldPath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
    else process.env.COMMAND_CENTER_STORE_PATH = oldPath;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('a saved GIS revision and address invalidation update readiness in the same publication', async () => {
    expect((await store.loadCommandCenter()).projects[0].readiness_label).toBe('Needs utility review');
    const confirmed = review(project());
    const saved = await store.saveCommandCenter({}, { requireExisting: true, gisReviews: () => [confirmed] });
    expect(saved.projects[0].readiness_label).toBe('Ready to send');
    expect(JSON.parse(fs.readFileSync(store.storePath)).projects[0].readiness_label).toBe('Ready to send');

    const changeAddress = address => store.saveCommandCenter(current => ({ projects: current.projects.map(job => ({ ...job, address })) }));
    const changed = await changeAddress('200 Different Fixture Lane');
    expect(changed.projects[0].readiness_label).toBe('Needs utility review');
    expect(changed.gis_reviews.at(-1).invalidated_at).toEqual(expect.any(String));
    const restored = await changeAddress(project().address);
    expect(restored.projects[0].readiness_label).toBe('Needs utility review');
    expect((await store.loadCommandCenter()).projects[0].readiness_label).toBe('Needs utility review');
    expect(restored.gis_reviews[0]).toEqual(confirmed);
  });

  test('loading a legacy ready label derives unknown utilities without altering its file', async () => {
    const raw = JSON.stringify({ projects: [{ ...project(), readiness_label: 'Ready to send', utility_reviews: utilities() }] });
    fs.writeFileSync(store.storePath, raw);
    const loaded = await store.loadCommandCenter();
    expect(loaded.projects[0].readiness_label).toBe('Needs utility review');
    expect(loaded.projects[0].utility_review_status).toBe('Confirmed');
    expect(fs.readFileSync(store.storePath, 'utf8')).toBe(raw);
  });
});
