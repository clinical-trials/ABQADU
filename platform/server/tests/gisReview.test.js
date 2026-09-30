const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
const auth = createAuthFixture();
const project = { id: 'gis-fixture', client: 'Fixture owner', address: '100 Fixture Lane, Albuquerque, NM', internal_notes: 'private fixture memo' };
const endpoint = `/api/project-helper/projects/${project.id}/gis-review`;
const empty = () => ({ status: 'queued', jurisdiction: 'unknown', parcel_id: '', width_ft: '', depth_ft: '', notes: '', checks: { parcel: false, zoning: false, access: false, easements: false, utilities: false } });
const input = (patch = {}) => ({ request_id: randomUUID(), expected_version: null, expected_address: project.address, review: empty(), ...patch });
let directory, previousPath, store, service, app;
const staff = (method, body, url = endpoint) => {
  const action = request(app)[method](url).set('Authorization', `Bearer ${auth.token()}`);
  return body === undefined ? action : action.send(body);
};
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-gis-review-'));
  previousPath = process.env.COMMAND_CENTER_STORE_PATH;
  process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'state.json');
  fs.writeFileSync(process.env.COMMAND_CENTER_STORE_PATH, JSON.stringify({ projects: [project, { id: 'other', client: 'Other fixture', address: '200 Fixture Lane' }] }));
  jest.resetModules();
  store = require('../src/services/commandCenterStore');
  service = require('../src/services/gisReview');
  app = require('../src/index').createApp({ env: { ...auth.env, CLERK_ALLOWED_USER_IDS: 'user_allowed,user_other' } });
});
afterEach(() => {
  if (previousPath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
  else process.env.COMMAND_CENTER_STORE_PATH = previousPath;
  fs.rmSync(directory, { recursive: true, force: true });
});

test('private read returns only saved project identity and does not initialize or mutate a workspace', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  expect((await request(app).get(endpoint)).status).toBe(401);
  expect((await request(app).put(endpoint).send(input())).status).toBe(401);
  const response = await staff('get');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ project: { id: project.id, client: project.client, address: project.address }, review: null, stale: false });
  expect(response.headers['cache-control']).toContain('no-store');
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  fs.unlinkSync(store.storePath);
  expect((await staff('get')).status).toBe(503);
  expect((await staff('put', input())).status).toBe(503);
  expect(fs.existsSync(store.storePath)).toBe(false);
});

test('a queued review snapshots the saved address, authenticated actor and unknown measurements', async () => {
  const payload = input({ expected_address: `  ${project.address.toUpperCase().replaceAll(' ', '  ')} `, saved_by: 'forged' });
  const response = await staff('put', payload);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ replayed: false, stale: false, review: { project_id: project.id, address_snapshot: project.address, ...empty() } });
  expect(Object.keys(response.body.review).sort()).toEqual(['project_id', 'version', 'address_snapshot', 'status', 'jurisdiction', 'parcel_id', 'width_ft', 'depth_ft', 'notes', 'checks', 'updated_at'].sort());
  const saved = JSON.parse(fs.readFileSync(store.storePath, 'utf8'));
  expect(saved.gis_reviews).toHaveLength(1);
  expect(saved.gis_reviews[0]).toMatchObject({ saved_by: 'user_allowed', request_id: payload.request_id });
  expect(saved.activity_events).toHaveLength(1);
  expect(saved.activity_events[0]).toMatchObject({ type: 'gis.review_queued', actor_id: 'user_allowed', project_id: project.id });
  expect(saved.activity_events[0].summary).not.toMatch(/approved|sent|delivered|fit/i);
  expect(require('../src/db').pool.query).not.toHaveBeenCalled();
});

test('review validation bounds strings and feet, and reviewed requires parcel confirmation plus useful notes', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  for (const patch of [
    { width_ft: '0' }, { width_ft: '-1' }, { width_ft: '1e3' }, { width_ft: '10000.01' }, { depth_ft: 12 }, { depth_ft: '1.001' },
    { notes: 'x'.repeat(4001) }, { parcel_id: 'x'.repeat(101) }, { notes: 'bad\u0000text' },
    { status: 'approved' }, { jurisdiction: 'approved' }, { checked: true }, { checks: { parcel: 'true' } },
    { status: 'reviewed', notes: 'Parcel checked but no checkbox.' }, { status: 'reviewed', notes: 'ok', checks: { ...empty().checks, parcel: true } },
  ]) expect((await staff('put', input({ review: { ...empty(), ...patch } }))).status).toBe(400);
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  const response = await staff('put', input({ review: { ...empty(), status: 'reviewed', width_ft: '24.5', notes: 'Matched the parcel; dimensions still need a survey.', checks: { ...empty().checks, parcel: true } } }));
  expect(response.status).toBe(200);
  expect(response.body.review).toMatchObject({ status: 'reviewed', width_ft: '24.50', depth_ft: '', checks: { parcel: true, utilities: false } });
});

test('invalid jobs, stale or blank addresses, malformed tokens and foreign origins cannot save', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  expect((await staff('put', input(), '/api/project-helper/projects/missing/gis-review')).status).toBe(404);
  for (const patch of [{ request_id: 'invalid' }, { expected_version: 'invalid' }, { expected_address: '' }, { expected_address: 123 }, { review: [] }]) {
    expect((await staff('put', input(patch))).status).toBe(400);
  }
  expect((await staff('put', input({ expected_address: 'Old fixture address' }))).status).toBe(409);
  expect((await request(app).put(endpoint).set('Authorization', `Bearer ${auth.token()}`).set('Origin', 'https://foreign.example').send(input())).status).toBe(403);
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  await store.saveCommandCenter(current => ({ projects: current.projects.map(row => row.id === project.id ? { ...row, address: '' } : row) }));
  expect((await staff('put', input())).status).toBe(400);
  expect(JSON.parse(fs.readFileSync(store.storePath, 'utf8')).gis_reviews || []).toHaveLength(0);
});

test('concurrent retries append once; CAS conflicts and older exact retries preserve the current review', async () => {
  const original = input();
  const first = await Promise.all([staff('put', original), staff('put', original)]);
  expect(first.map(row => row.status)).toEqual([200, 200]);
  expect(first.map(row => row.body.replayed).sort()).toEqual([false, true]);
  const version = first[0].body.review.version;
  const second = await Promise.all([
    staff('put', input({ expected_version: version, review: { ...empty(), status: 'in_review', notes: 'First edit.' } })),
    staff('put', input({ expected_version: version, review: { ...empty(), status: 'in_review', notes: 'Second edit.' } })),
  ]);
  expect(second.map(row => row.status).sort()).toEqual([200, 409]);
  const current = (await staff('get')).body;
  const before = fs.readFileSync(store.storePath, 'utf8');
  expect((await staff('put', original)).body).toEqual({ ...current, replayed: true });
  expect((await staff('put', { ...original, review: { ...empty(), notes: 'Changed intent.' } })).status).toBe(409);
  expect((await request(app).put(endpoint).set('Authorization', `Bearer ${auth.token({ sub: 'user_other' })}`).send(original)).status).toBe(409);
  expect((await staff('put', { ...original, expected_address: '200 Fixture Lane' }, '/api/project-helper/projects/other/gis-review')).status).toBe(409);
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  expect(JSON.parse(before).gis_reviews).toHaveLength(2);
  expect(JSON.parse(before).activity_events).toHaveLength(2);
});

test('address edits invalidate once, remain stale after A-to-B-to-A and require an empty queued restart', async () => {
  const original = input({ review: { ...empty(), status: 'reviewed', notes: 'Matched parcel on the reviewed address.', parcel_id: 'fixture-001', width_ft: '30', checks: { ...empty().checks, parcel: true } } });
  const initial = (await staff('put', original)).body.review;
  const changeAddress = address => store.saveCommandCenter(current => ({ projects: current.projects.map(row => row.id === project.id ? { ...row, address } : row) }));
  await changeAddress('Different fixture address');
  const changed = (await staff('get')).body;
  expect(changed.stale).toBe(true);
  expect(changed.review.address_snapshot).toBe(project.address);
  expect(changed.review.version).not.toBe(initial.version);
  await changeAddress(project.address);
  const back = (await staff('get')).body;
  expect(back.stale).toBe(true);
  expect((await staff('put', original)).body).toEqual({ ...back, replayed: true });
  for (const review of [{ ...empty(), status: 'in_review' }, { ...original.review, status: 'reviewed' }, { ...empty(), notes: 'Kept old notes' }]) {
    expect((await staff('put', input({ expected_version: back.review.version, review }))).status).toBe(409);
  }
  const restarted = await staff('put', input({ expected_version: back.review.version }));
  expect(restarted.status).toBe(200);
  expect(restarted.body).toMatchObject({ stale: false, review: { status: 'queued', notes: '', width_ft: '', parcel_id: '', checks: empty().checks } });
  const saved = JSON.parse(fs.readFileSync(store.storePath, 'utf8'));
  expect(saved.gis_reviews[0].notes).toBe(original.review.notes);
  expect(saved.activity_events.filter(row => row.type === 'gis.review_invalidated')).toHaveLength(1);
});

test('address casing alone keeps a review current, while racing address changes cannot review the old address', async () => {
  const first = (await staff('put', input())).body.review;
  await store.saveCommandCenter(current => ({ projects: current.projects.map(row => row.id === project.id ? { ...row, address: ` ${project.address.toUpperCase()} ` } : row) }));
  expect((await staff('get')).body).toMatchObject({ stale: false, review: { version: first.version } });
  const addressChange = store.saveCommandCenter(current => ({ projects: current.projects.map(row => row.id === project.id ? { ...row, address: 'A newly saved site' } : row) }));
  const reviewSave = staff('put', input({ expected_version: first.version, review: { ...empty(), status: 'in_review' } }));
  const [, response] = await Promise.all([addressChange, reviewSave]);
  expect(response.status).toBe(409);
  expect((await staff('get')).body.stale).toBe(true);
});

test('an address saved after the read preflight is rechecked inside atomic review publication', async () => {
  const first = (await staff('put', input())).body.review;
  const racing = service.createGisReviewService({
    saveState: async (updater, options) => {
      await store.saveCommandCenter(current => ({ projects: current.projects.map(row => row.id === project.id ? { ...row, address: 'Changed during review save' } : row) }));
      return store.saveCommandCenter(updater, options);
    },
  });
  await expect(racing.saveReview(project.id, input({ expected_version: first.version, review: { ...empty(), status: 'in_review' } }), 'user_allowed')).rejects.toMatchObject({ status: 409 });
  const saved = JSON.parse(fs.readFileSync(store.storePath, 'utf8'));
  expect(saved.gis_reviews).toHaveLength(2);
  expect(saved.gis_reviews.at(-1).invalidated_at).toEqual(expect.any(String));
  expect(saved.activity_events.some(row => row.type === 'gis.review_updated')).toBe(false);
});

test('generic PUT, stale full state and reset cannot erase the immutable GIS history', async () => {
  await staff('put', input());
  const original = JSON.parse(fs.readFileSync(store.storePath, 'utf8')).gis_reviews;
  expect((await staff('put', { gis_reviews: [] }, '/api/command-center')).status).toBe(400);
  await store.saveCommandCenter({ gis_reviews: [{ version: 'forged' }] });
  expect(JSON.parse(fs.readFileSync(store.storePath, 'utf8')).gis_reviews).toEqual(original);
  await store.resetCommandCenter();
  const rows = JSON.parse(fs.readFileSync(store.storePath, 'utf8')).gis_reviews;
  expect(rows.slice(0, original.length)).toEqual(original);
  expect(rows.at(-1).invalidated_at).toEqual(expect.any(String));
});

test('request retries survive module reload and failed atomic writes leave no false review event', async () => {
  const payload = input();
  const before = fs.readFileSync(store.storePath, 'utf8');
  const rename = jest.spyOn(require('node:fs/promises'), 'rename').mockRejectedValueOnce(new Error('private disk path'));
  try {
    const failure = await staff('put', payload);
    expect(failure.status).toBe(503);
    expect(JSON.stringify(failure.body)).not.toMatch(/private disk/);
    expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  } finally { rename.mockRestore(); }
  const first = await staff('put', payload);
  jest.resetModules();
  app = require('../src/index').createApp({ env: auth.env });
  expect((await staff('put', payload)).body).toEqual({ ...first.body, replayed: true });
  const state = JSON.parse(fs.readFileSync(store.storePath, 'utf8'));
  expect(state.gis_reviews).toHaveLength(1);
  expect(state.activity_events).toHaveLength(1);
});

test('a stalled read has a sanitized deadline and never starts a save', async () => {
  const saveState = jest.fn();
  const blocked = service.createGisReviewService({ readState: () => new Promise(() => {}), saveState, readTimeoutMs: 10 });
  await expect(blocked.getReview(project.id)).rejects.toMatchObject({ status: 503, message: 'Saved GIS review data is temporarily unavailable.' });
  expect(saveState).not.toHaveBeenCalled();
});
