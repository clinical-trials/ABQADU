const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
const auth = createAuthFixture();
const NOW = new Date('2026-09-30T18:00:00.000Z');
const job = { id: 'cycle-fixture', client: 'Fixture homeowner', address: 'Fixture property' };
const base = '/api/executive/preconstruction-cycle';
const milestones = (patch = {}) => ({ signed_at: '2026-09-28T12:00:00.000Z', deposit_received_at: '2026-09-29T06:00:00.000Z', evidence: 'Staff reviewed the signed agreement and full receipt reference.', ...patch });
const body = (patch = {}) => ({ request_id: randomUUID(), expected_version: 0, milestones: milestones(), ...patch });
const record = (id, signed_at, deposit_received_at, patch = {}) => ({
  id: randomUUID(), project_id: id, project_name: `Fixture ${id}`, version: 1, expected_version: 0,
  saved_at: NOW.toISOString(), saved_by: 'fixture-staff', request_id: randomUUID(), request_fingerprint: 'a'.repeat(64),
  milestones: milestones({ signed_at, deposit_received_at }), ...patch,
});
let directory, previousPath, store, app;
const moduleUnderTest = () => require('../src/services/preconstructionCycle');
const cycleService = options => moduleUnderTest().createPreconstructionCycleService({ now: () => NOW, ...options });
const staff = (method, input, endpoint = base) => {
  const action = request(app)[method](endpoint).set('Authorization', `Bearer ${auth.token()}`);
  return input === undefined ? action : action.send(input);
};
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-preconstruction-cycle-'));
  previousPath = process.env.COMMAND_CENTER_STORE_PATH;
  process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'state.json');
  fs.writeFileSync(process.env.COMMAND_CENTER_STORE_PATH, JSON.stringify({ projects: [job, { id: 'other', client: 'Other fixture' }] }));
  jest.resetModules();
  store = require('../src/services/commandCenterStore');
  app = require('../src/index').createApp({ env: { ...auth.env, CLERK_ALLOWED_USER_IDS: 'user_allowed,user_other' } });
});
afterEach(() => {
  if (previousPath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
  else process.env.COMMAND_CENTER_STORE_PATH = previousPath;
  fs.rmSync(directory, { recursive: true, force: true });
});

test('private cycle GET reports unknown milestones without inventing activity or seeding a missing store', async () => {
  const bytes = fs.readFileSync(store.storePath, 'utf8');
  const reply = await staff('get');
  expect(reply.status).toBe(200);
  expect(reply.headers['cache-control']).toContain('no-store');
  expect(reply.body.projects[0]).toMatchObject({ id: job.id, name: job.client, version: 0,
    milestones: { signed_at: null, deposit_received_at: null, evidence: '' }, hours: null, status: 'not_started', target_status: null });
  expect(reply.body.current_week).toMatchObject({ count: 0, median_hours: null, fastest_hours: null, within_target_count: 0, within_target_pct: null });
  expect(reply.body.improvement_hours).toBeNull();
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(bytes);
  fs.unlinkSync(store.storePath);
  expect((await staff('get')).status).toBe(503);
  expect((await staff('put', body(), `${base}/projects/${job.id}`)).status).toBe(503);
  expect(fs.existsSync(store.storePath)).toBe(false);
});

test('cycle routes reject anonymous, unapproved, expired and foreign-origin access', async () => {
  for (const [method, endpoint] of [['get', base], ['put', `${base}/projects/${job.id}`]]) {
    expect((await request(app)[method](endpoint).send(body())).status).toBe(401);
    expect((await request(app)[method](endpoint).set('Authorization', `Bearer ${auth.token({ sub: 'outsider' })}`).send(body())).status).toBe(403);
    expect((await request(app)[method](endpoint).set('Authorization', `Bearer ${auth.token({ exp: 1 })}`).send(body())).status).toBe(401);
    expect((await request(app)[method](endpoint).set('Authorization', `Bearer ${auth.token()}`).set('Origin', 'https://foreign.example').send(body())).status).toBe(403);
  }
  expect(JSON.parse(fs.readFileSync(store.storePath, 'utf8')).preconstruction_cycles).toBeUndefined();
});

test('manual milestones publish with the verified actor and full history but no ledger mutation', async () => {
  const input = body();
  const reply = await staff('put', input, `${base}/projects/${job.id}`);
  expect(reply.status).toBe(200);
  expect(reply.headers['cache-control']).toContain('no-store');
  expect(reply.body.projects[0]).toMatchObject({ version: 1, milestones: input.milestones, hours: 18, status: 'complete', target_status: 'on_target' });
  const saved = JSON.parse(fs.readFileSync(store.storePath, 'utf8'));
  expect(saved.preconstruction_cycles).toHaveLength(1);
  expect(saved.preconstruction_cycles[0]).toMatchObject({ project_id: job.id, project_name: job.client, version: 1, saved_by: 'user_allowed', request_id: input.request_id, milestones: input.milestones });
  expect(saved.preconstruction_cycles[0].request_fingerprint).toMatch(/^[a-f\d]{64}$/);
  expect(saved.activity_events).toHaveLength(1);
  expect(saved.activity_events[0]).toMatchObject({ actor_id: 'user_allowed', project_id: job.id, type: 'preconstruction.cycle_recorded' });
  expect(saved.activity_events[0].summary).toMatch(/manual|reported|staff-recorded/i);
  expect(saved.projects[0].invoice_drafts).toBeUndefined();
  expect(require('../src/db').pool.query).not.toHaveBeenCalled();
});

test('milestones validate exact dates, ordering, evidence, actor and request shape before any save', async () => {
  const bytes = fs.readFileSync(store.storePath, 'utf8');
  const service = cycleService();
  const invalid = [
    { signed_at: '2026-02-30T12:00:00Z' }, { signed_at: '2026-09-28' }, { signed_at: '2026-09-28T12:00:00' },
    { signed_at: '2026-09-28T25:00:00Z' }, { signed_at: 0 }, { signed_at: null },
    { signed_at: '0001-01-01T00:00:00+14:00', deposit_received_at: null },
    { signed_at: '2026-10-01T00:00:00Z', deposit_received_at: null },
    { deposit_received_at: '2026-09-30T18:00:00.001Z' }, { deposit_received_at: '2026-09-28T11:59:59Z' },
    { evidence: '' }, { evidence: ' '.repeat(10) }, { evidence: 'x'.repeat(501) }, { evidence: 1 }, { evidence: 'bad\u0000text' },
    { amount_cents: 1000000 },
  ];
  for (const patch of invalid) await expect(service.saveProject(job.id, body({ milestones: milestones(patch) }), 'staff')).rejects.toMatchObject({ status: 400 });
  for (const patch of [{ request_id: 'bad' }, { expected_version: null }, { expected_version: '0' }, { expected_version: -1 }, { expected_version: 0.5 }, { milestones: {} }, { milestones: [] }, { saved_by: 'forged' }]) {
    await expect(service.saveProject(job.id, body(patch), 'staff')).rejects.toMatchObject({ status: 400 });
  }
  await expect(service.saveProject(job.id, body(), '')).rejects.toMatchObject({ status: 403 });
  await expect(service.saveProject('missing', body(), 'staff')).rejects.toMatchObject({ status: 404 });
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(bytes);
});

test('offset timestamps canonicalize and an exact boundary instant is accepted', async () => {
  const service = cycleService();
  const report = await service.saveProject(job.id, body({ milestones: milestones({ signed_at: '2026-09-30T06:00:00-06:00', deposit_received_at: '2026-09-30T12:00:00-06:00', evidence: '  Reviewed references.  ' }) }), 'staff');
  expect(report.projects[0]).toMatchObject({ hours: 6, target_status: 'stretch', milestones: { signed_at: '2026-09-30T12:00:00.000Z', deposit_received_at: NOW.toISOString(), evidence: 'Reviewed references.' } });
});

test('concurrent identical retries publish once and conflicting changes cannot overwrite the winner', async () => {
  const service = cycleService(), input = body();
  const first = await Promise.all([service.saveProject(job.id, input, 'staff'), service.saveProject(job.id, input, 'staff')]);
  expect(first.map(result => result.projects[0].version)).toEqual([1, 1]);
  const revisions = await Promise.allSettled([
    service.saveProject(job.id, body({ expected_version: 1, milestones: milestones({ evidence: 'First corrected reference.' }) }), 'staff'),
    service.saveProject(job.id, body({ expected_version: 1, milestones: milestones({ evidence: 'Second corrected reference.' }) }), 'staff'),
  ]);
  expect(revisions.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(revisions.find(result => result.status === 'rejected').reason.status).toBe(409);
  const bytes = fs.readFileSync(store.storePath, 'utf8');
  const current = revisions.find(result => result.status === 'fulfilled').value;
  expect((await service.saveProject(job.id, input, 'staff')).projects).toEqual(current.projects);
  await expect(service.saveProject(job.id, { ...input, milestones: milestones({ evidence: 'Changed retry' }) }, 'staff')).rejects.toMatchObject({ status: 409 });
  await expect(service.saveProject(job.id, input, 'other-staff')).rejects.toMatchObject({ status: 409 });
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(bytes);
  const saved = JSON.parse(bytes);
  expect(saved.preconstruction_cycles).toHaveLength(2);
  expect(saved.activity_events).toHaveLength(2);
});

test('retry receipts survive module reload and clearing milestones preserves prior completed evidence', async () => {
  const input = body();
  const first = await cycleService().saveProject(job.id, input, 'staff');
  const cleared = await cycleService().saveProject(job.id, body({ expected_version: 1, milestones: { signed_at: null, deposit_received_at: null, evidence: 'Corrected an entry assigned to this job by mistake.' } }), 'staff');
  expect(cleared.projects[0]).toMatchObject({ version: 2, status: 'not_started', hours: null });
  expect(cleared.current_week.count).toBe(0);
  expect(cleared.current_week.median_hours).toBeNull();
  jest.resetModules();
  const bytes = fs.readFileSync(store.storePath, 'utf8');
  expect((await cycleService().saveProject(job.id, input, 'staff')).projects).toEqual(cleared.projects);
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(bytes);
  expect(JSON.parse(bytes).preconstruction_cycles[0].milestones).toEqual(first.projects[0].milestones);
});

test('generic PUT, stale direct patches and reset cannot replace the cycle history', async () => {
  await cycleService().saveProject(job.id, body(), 'staff');
  const original = JSON.parse(fs.readFileSync(store.storePath, 'utf8')).preconstruction_cycles;
  expect((await staff('put', { preconstruction_cycles: [] }, '/api/command-center')).status).toBe(400);
  await store.saveCommandCenter({ preconstruction_cycles: [{ forged: true }] });
  expect(JSON.parse(fs.readFileSync(store.storePath, 'utf8')).preconstruction_cycles).toEqual(original);
  await store.resetCommandCenter();
  const state = JSON.parse(fs.readFileSync(store.storePath, 'utf8'));
  expect(state.preconstruction_cycles).toEqual(original);
  const report = moduleUnderTest().summarizePreconstructionCycle(state, NOW);
  expect(report.current_week.count).toBe(1);
  expect(report.projects.some(project => project.id === job.id)).toBe(false);
});

test('a job removed between preflight and publication cannot acquire a milestone', async () => {
  const service = cycleService({ saveState: async (updater, options) => {
    await store.saveCommandCenter(current => ({ projects: current.projects.filter(project => project.id !== job.id) }));
    return store.saveCommandCenter(updater, options);
  } });
  await expect(service.saveProject(job.id, body(), 'staff')).rejects.toMatchObject({ status: 404 });
  expect(JSON.parse(fs.readFileSync(store.storePath, 'utf8')).preconstruction_cycles).toEqual([]);
});

test('failed atomic writes and stalled or corrupt reads leave operational evidence unknown and unchanged', async () => {
  const bytes = fs.readFileSync(store.storePath, 'utf8');
  const rename = jest.spyOn(require('node:fs/promises'), 'rename').mockRejectedValueOnce(new Error('Private disk detail'));
  try { await expect(cycleService().saveProject(job.id, body(), 'staff')).rejects.toMatchObject({ status: 503 }); }
  finally { rename.mockRestore(); }
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(bytes);
  const slow = cycleService({ readState: () => new Promise(() => {}), readTimeoutMs: 10 });
  await expect(slow.getReport()).rejects.toMatchObject({ status: 503 });
  fs.writeFileSync(store.storePath, '{broken fixture');
  const reply = await staff('get');
  expect(reply.status).toBe(503);
  expect(reply.body.error).not.toMatch(/JSON|Private disk|fixture/);
});

test('weekly medians group completions by Denver receipt date and retain deleted-job results', () => {
  const data = { projects: [job], preconstruction_cycles: [
    record(job.id, '2026-09-28T15:00:00Z', '2026-09-29T06:00:00Z'),
    record('removed-current', '2026-09-28T14:00:00Z', '2026-09-29T10:00:00Z'),
    record('previous-one', '2026-09-22T00:00:00Z', '2026-09-22T18:00:00Z'),
    record('previous-two', '2026-09-22T00:00:00Z', '2026-09-22T22:00:00Z'),
    record('previous-three', '2026-09-22T00:00:00Z', '2026-09-23T06:00:00Z'),
    record('older', '2026-07-01T00:00:00Z', '2026-07-01T10:00:00Z'),
  ] };
  const report = moduleUnderTest().summarizePreconstructionCycle(data, NOW);
  expect(report.target).toEqual({ deposit_cents: 1000000, goal_hours: 20, stretch_hours: 15 });
  expect(report.weeks).toHaveLength(8);
  expect(report.current_week).toEqual({ start: '2026-09-28', end: '2026-10-05', count: 2, median_hours: 17.5, fastest_hours: 15, within_target_count: 2, within_target_pct: 100 });
  expect(report.previous_week).toEqual({ start: '2026-09-21', end: '2026-09-28', count: 3, median_hours: 22, fastest_hours: 18, within_target_count: 1, within_target_pct: 33.3 });
  expect(report.improvement_hours).toBe(4.5);
  expect(report.weeks[7]).toMatchObject({ start: '2026-08-10', end: '2026-08-17', count: 0, median_hours: null });
  expect(report.projects).toHaveLength(1);
  expect(report.narration).toMatch(/week.to.date/i);
  expect(report.narration).toMatch(/manual|staff.recorded/i);
  expect(report.narration.trim().split(/\s+/).length).toBeLessThan(65);
});

test('project names with multiple controls are sanitized before a valid audit snapshot is published', async () => {
  fs.writeFileSync(store.storePath, JSON.stringify({ projects: [{ ...job, client: '  Fixture\u0000 owner\u0001 name  ' }] }));
  const report = await cycleService().saveProject(job.id, body(), 'staff');
  expect(report.projects[0].name).toBe('Fixture owner name');
  expect(JSON.parse(fs.readFileSync(store.storePath, 'utf8')).preconstruction_cycles[0].project_name).toBe('Fixture owner name');
  expect((await cycleService().getReport()).projects[0].name).toBe('Fixture owner name');
});

test.each([
  ['2026-03-09T05:59:59Z', '2026-03-02'],
  ['2026-03-09T06:00:00Z', '2026-03-09'],
  ['2026-11-02T06:59:59Z', '2026-10-26'],
  ['2026-11-02T07:00:00Z', '2026-11-02'],
])('receipt %s belongs to Denver week %s across DST boundaries', (received, start) => {
  const now = new Date('2026-11-03T12:00:00Z');
  const report = moduleUnderTest().summarizePreconstructionCycle({ projects: [], preconstruction_cycles: [record('archived', new Date(Date.parse(received) - 3600000).toISOString(), received)] }, now);
  // Re-run close to the receipt so either March or November falls in the bounded window.
  const nearReceipt = moduleUnderTest().summarizePreconstructionCycle({ projects: [], preconstruction_cycles: [record('archived', new Date(Date.parse(received) - 3600000).toISOString(), received, { saved_at: received })] }, new Date(Date.parse(received) + 3600000));
  expect(nearReceipt.weeks.find(week => week.start === start)).toMatchObject({ count: 1, median_hours: 1 });
  expect(report.time_zone).toBe('America/Denver');
});

test('elapsed hours use actual instants through DST, with unrounded classifications and active cycles excluded', () => {
  const projects = ['spring', 'fall', 'over', 'stretch', 'active', 'blank'].map(id => ({ id, client: id }));
  const state = { projects, preconstruction_cycles: [
    record('spring', '2026-03-08T01:30:00-07:00', '2026-03-08T03:30:00-06:00'),
    record('fall', '2026-11-01T00:30:00-06:00', '2026-11-01T02:30:00-07:00'),
    record('over', '2026-11-01T00:00:00Z', '2026-11-01T20:00:00.001Z'),
    record('stretch', '2026-11-01T00:00:00Z', '2026-11-01T15:00:00.001Z'),
    record('active', '2026-11-03T00:00:00Z', null),
  ] };
  const report = moduleUnderTest().summarizePreconstructionCycle(state, new Date('2026-11-03T18:00:00Z'));
  expect(report.projects.find(project => project.id === 'spring')).toMatchObject({ hours: 1, target_status: 'stretch' });
  expect(report.projects.find(project => project.id === 'fall')).toMatchObject({ hours: 3, target_status: 'stretch' });
  expect(report.projects.find(project => project.id === 'over')).toMatchObject({ hours: 20, target_status: 'over_target' });
  expect(report.projects.find(project => project.id === 'stretch')).toMatchObject({ hours: 15, target_status: 'on_target' });
  expect(report.projects.find(project => project.id === 'active')).toMatchObject({ hours: 18, status: 'awaiting_deposit', target_status: null });
  expect(report.current_week.count).toBe(0);
  expect(report.current_week.median_hours).toBeNull();
});

test('malformed histories, duplicate versions and client-supplied project claims cannot become measured success', () => {
  const summarize = moduleUnderTest().summarizePreconstructionCycle;
  const valid = record(job.id, '2026-09-28T12:00:00Z', '2026-09-29T06:00:00Z');
  for (const state of [null, {}, { projects: null }, { projects: [job, job] }, { projects: [job], preconstruction_cycles: {} },
    { projects: [job], preconstruction_cycles: [null] }, { projects: [job], preconstruction_cycles: [valid, { ...valid, id: randomUUID(), request_id: randomUUID() }] },
    { projects: [job], preconstruction_cycles: [{ ...valid, milestones: milestones({ evidence: '' }) }] },
    { projects: [job], preconstruction_cycles: [{ ...valid, milestones: milestones({ deposit_received_at: '2026-10-01T00:00:00Z' }) }] },
    { projects: [job], preconstruction_cycles: [{ ...valid, saved_by: '' }] }]) expect(() => summarize(state, NOW)).toThrow();
  const report = summarize({ projects: [{ ...job, signed_at: '2026-09-28T12:00:00Z', deposit_received_at: '2026-09-29T06:00:00Z', status: 'paid', invoice_drafts: [{ amount: 10000, status: 'Paid' }] }], activity_events: [{ type: 'preconstruction.draft_saved', occurred_at: '2026-09-28T12:00:00Z' }] }, NOW);
  expect(report.projects[0]).toMatchObject({ version: 0, status: 'not_started', hours: null });
  expect(report.current_week.count).toBe(0);
});
