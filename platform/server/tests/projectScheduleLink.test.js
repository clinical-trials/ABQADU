const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
const auth = createAuthFixture();
const url = '/api/project-helper/projects/job-fixture/schedule-link';
const body = (schedule_project_id = 7, expected_version = null) => ({ schedule_project_id, expected_version, request_id: randomUUID() });
const queryParts = (sql, values) => typeof sql === 'string' ? { text: sql, values } : sql;
let directory, previousPath, store, app, query;
const authorized = (method, endpoint = url, input) => {
  const req = request(app)[method](endpoint).set('Authorization', `Bearer ${auth.token()}`);
  return input === undefined ? req : req.send(input);
};

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-schedule-link-'));
  previousPath = process.env.COMMAND_CENTER_STORE_PATH;
  process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'state.json');
  fs.writeFileSync(process.env.COMMAND_CENTER_STORE_PATH, JSON.stringify({ projects: [{ id: 'job-fixture', client: 'Test job' }] }));
  jest.resetModules();
  query = require('../src/db').pool.query;
  query.mockImplementation(async (statement, parameters) => {
    const { text, values: [id] } = queryParts(statement, parameters);
    if (!/^SELECT\b/.test(text)) throw new Error('Schedule linking must not write SQL.');
    return { rows: [7, 8].includes(id) ? [{ id, name: `Schedule ${id}` }] : [] };
  });
  store = require('../src/services/commandCenterStore');
  app = require('../src/index').createApp({ env: auth.env });
});
afterEach(() => {
  if (previousPath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
  else process.env.COMMAND_CENTER_STORE_PATH = previousPath;
  fs.rmSync(directory, { recursive: true, force: true });
});

test('the real API auth boundary protects link reads and writes before SQL or JSON access', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  for (const method of ['get', 'put']) {
    expect((await request(app)[method](url).send(body())).status).toBe(401);
    expect((await request(app)[method](url).set('Authorization', `Bearer ${auth.token()}`).set('Origin', 'https://foreign.example').send(body())).status).toBe(403);
  }
  expect(query).not.toHaveBeenCalled();
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
});

test('linking reads only the chosen SQL target and persists an actor-stamped association and one audit event', async () => {
  expect((await authorized('get')).body).toEqual({ link: null });
  expect(query).not.toHaveBeenCalled();
  const input = { ...body(), linked_by: 'forged', project_id: 'other-job' };
  const linked = await authorized('put', url, input);
  expect(linked.status).toBe(200);
  expect(linked.body).toMatchObject({ replayed: false, link: { project_id: 'job-fixture', schedule_project_id: 7, linked_by: 'user_allowed', schedule_name: 'Schedule 7', status: 'available' } });
  expect(linked.body.link.version).toMatch(/^[a-f\d-]{36}$/);
  expect(linked.headers['cache-control']).toContain('no-store');
  const saved = await store.loadCommandCenter();
  expect(saved.schedule_links).toHaveLength(1);
  expect(saved.schedule_links[0]).toMatchObject({ project_id: 'job-fixture', schedule_project_id: 7, version: linked.body.link.version, linked_by: 'user_allowed', linked_at: expect.any(String) });
  expect(saved.schedule_links[0]).not.toHaveProperty('status');
  expect(saved.activity_events).toHaveLength(1);
  expect(saved.activity_events[0]).toMatchObject({ project_id: 'job-fixture', type: 'project.schedule_linked', actor_id: 'user_allowed', request_id: input.request_id });
  expect(saved.activity_events[0].summary).not.toMatch(/sent|delivered|paid|created schedule/i);
  expect((await authorized('get')).body.link).toEqual(linked.body.link);
  expect(query.mock.calls.every(args => {
    const { text, values, query_timeout } = queryParts(...args);
    return /^SELECT\b/.test(text) && values[0] === 7 && query_timeout === 5000;
  })).toBe(true);
});

test('concurrent expected-version changes permit one winner and refuse the stale writer', async () => {
  const results = await Promise.all([authorized('put', url, body(7)), authorized('put', url, body(8))]);
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  const saved = await store.loadCommandCenter();
  expect(saved.schedule_links).toHaveLength(1);
  expect(saved.activity_events).toHaveLength(1);
});

test('request retries are durable and cannot duplicate audit, forge another intent, or restore an old link', async () => {
  const firstInput = body();
  const responses = await Promise.all([authorized('put', url, firstInput), authorized('put', url, firstInput)]);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  expect(responses.map(response => response.body.replayed).sort()).toEqual([false, true]);
  expect(responses[0].body.link).toEqual(responses[1].body.link);
  const before = fs.readFileSync(store.storePath, 'utf8');
  // Recreate the application modules: retry identity comes from durable audit,
  // not a process-local cache or the original route closure.
  jest.resetModules();
  query = require('../src/db').pool.query;
  query.mockImplementation(async (...args) => { const [id] = queryParts(...args).values; return { rows: [{ id, name: `Schedule ${id}` }] }; });
  store = require('../src/services/commandCenterStore');
  app = require('../src/index').createApp({ env: auth.env });
  expect((await authorized('put', url, { ...firstInput, request_id: firstInput.request_id.toUpperCase() })).status).toBe(200);
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  expect((await authorized('put', url, { ...firstInput, schedule_project_id: 8 })).status).toBe(409);
  const changed = await authorized('put', url, body(8, responses[0].body.link.version));
  expect(changed.status).toBe(200);
  const retriedOld = await authorized('put', url, firstInput);
  expect(retriedOld.status).toBe(200);
  expect(retriedOld.body).toMatchObject({ replayed: true, link: { schedule_project_id: 8, version: changed.body.link.version } });
  expect((await store.loadCommandCenter()).activity_events).toHaveLength(2);
});

test('unlink keeps a new version and stale pre-link writers cannot exploit a return to no schedule', async () => {
  const first = await authorized('put', url, body());
  const unlinkInput = body(null, first.body.link.version);
  const removed = await authorized('put', url, unlinkInput);
  expect(removed.status).toBe(200);
  expect(removed.body.link).toMatchObject({ schedule_project_id: null, schedule_name: null, status: 'available', linked_by: 'user_allowed' });
  expect(removed.body.link.version).not.toBe(first.body.link.version);
  expect((await authorized('get')).body.link).toEqual(removed.body.link);
  expect((await authorized('put', url, body(8))).status).toBe(409);
  expect((await authorized('put', url, unlinkInput)).body.replayed).toBe(true);
  expect((await store.loadCommandCenter()).activity_events.map(event => event.type)).toEqual(['project.schedule_linked', 'project.schedule_unlinked']);
  expect((await authorized('put', url, body(8, removed.body.link.version))).status).toBe(200);
});

test('malformed input, missing JSON job, missing SQL target, or failed SQL cannot mutate the store', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  for (const input of [
    {}, { ...body(), request_id: undefined }, { ...body(), request_id: 'invalid' },
    { ...body(), expected_version: undefined }, { ...body(), expected_version: 'invalid' },
    body('7'), body(0), body(-1), body(1.5), body(2147483648), body(Number.MAX_SAFE_INTEGER + 1), body([]),
  ]) expect((await authorized('put', url, input)).status).toBe(400);
  expect((await authorized('put', '/api/project-helper/projects/missing/schedule-link', body())).status).toBe(404);
  expect(query).not.toHaveBeenCalled();
  expect((await authorized('put', url, body(99))).status).toBe(404);
  query.mockRejectedValue(new Error('private database connection details'));
  const failed = await authorized('put', url, body());
  expect(failed.status).toBe(503);
  expect(JSON.stringify(failed.body)).not.toContain('private database');
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
});

test('missing and unavailable SQL references remain saved and allow an explicit unlink during an outage', async () => {
  const linked = await authorized('put', url, body());
  const before = fs.readFileSync(store.storePath, 'utf8');
  query.mockResolvedValue({ rows: [] });
  expect((await authorized('get')).body.link).toMatchObject({ schedule_project_id: 7, version: linked.body.link.version, status: 'missing', schedule_name: null });
  query.mockRejectedValue(new Error('private database address'));
  const unavailable = await authorized('get');
  expect(unavailable.status).toBe(200);
  expect(unavailable.body.link).toMatchObject({ schedule_project_id: 7, status: 'unavailable' });
  expect(JSON.stringify(unavailable.body)).not.toContain('private database');
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  expect((await authorized('put', url, body(null, linked.body.link.version))).status).toBe(200);
});

test('generic updates, stale full state, and resets cannot replace server-owned link versions', async () => {
  const stale = await store.loadCommandCenter();
  const linked = await authorized('put', url, body());
  expect(linked.status).toBe(200);
  expect((await authorized('put', '/api/command-center', { schedule_links: [] })).status).toBe(400);
  await store.saveCommandCenter({ ...stale, schedule_links: [{ project_id: 'job-fixture', schedule_project_id: 99, version: 'forged' }] });
  expect((await store.loadCommandCenter()).schedule_links[0].version).toBe(linked.body.link.version);
  await store.resetCommandCenter();
  expect((await store.loadCommandCenter()).schedule_links[0].version).toBe(linked.body.link.version);
});

test('failed atomic publication changes neither link nor audit and the same request can retry', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  const input = body();
  const rename = jest.spyOn(require('node:fs/promises'), 'rename').mockRejectedValueOnce(new Error('Fixture disk failure'));
  try {
    const failed = await authorized('put', url, input);
    expect(failed.status).toBe(503);
    expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
    expect((await authorized('get')).body).toEqual({ link: null });
    expect((await authorized('put', url, input)).status).toBe(200);
    expect((await store.loadCommandCenter()).activity_events).toHaveLength(1);
  } finally { rename.mockRestore(); }
});

test('concurrent links for separate jobs preserve both associations and request IDs cannot cross jobs or actors', async () => {
  fs.writeFileSync(store.storePath, JSON.stringify({ projects: [{ id: 'job-fixture' }, { id: 'job-other' }] }));
  app = require('../src/index').createApp({ env: { ...auth.env, CLERK_ALLOWED_USER_IDS: 'user_allowed,user_other' } });
  const firstInput = body(), otherUrl = '/api/project-helper/projects/job-other/schedule-link';
  const responses = await Promise.all([authorized('put', url, firstInput), authorized('put', otherUrl, body(8))]);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  expect((await store.loadCommandCenter()).schedule_links).toHaveLength(2);
  expect((await authorized('put', otherUrl, firstInput)).status).toBe(409);
  const anotherActor = await request(app).put(url).set('Authorization', `Bearer ${auth.token({ sub: 'user_other' })}`).send(firstInput);
  expect(anotherActor.status).toBe(409);
  expect((await store.loadCommandCenter()).activity_events).toHaveLength(2);
});

async function within(promise, milliseconds = 300) {
  let timer;
  try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve('stalled'), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

test('a stalled SQL preflight cannot block notes or competing links and late results recheck the version', async () => {
  let release, signalStarted;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const stalled = new Promise(resolve => { release = resolve; });
  query.mockImplementation((...args) => {
    const [id] = queryParts(...args).values;
    if (id === 7) { signalStarted(); return stalled; }
    return Promise.resolve({ rows: [{ id, name: `Schedule ${id}` }] });
  });
  const pending = authorized('put', url, body()).then(response => response);
  await started;
  const note = authorized('post', '/api/project-helper/projects/job-fixture/notes', { request_id: randomUUID(), text: 'Saved while SQL is waiting.' }).then(response => response);
  const competitor = authorized('put', url, body(8)).then(response => response);
  const progress = await within(Promise.all([note, competitor]));
  release({ rows: [{ id: 7, name: 'Late schedule' }] });
  const late = await pending;
  await Promise.all([note, competitor]);
  expect(progress).not.toBe('stalled');
  expect(progress.map(response => response.status)).toEqual([201, 200]);
  expect(late.status).toBe(409);
  const saved = await store.loadCommandCenter();
  expect(saved.schedule_links[0].schedule_project_id).toBe(8);
  expect(saved.activity_events.map(event => event.type).sort()).toEqual(['note.saved', 'project.schedule_linked']);
});

test('a timed-out SQL lookup returns safely without publishing a late link', async () => {
  const express = require('express');
  const workspace = require('../src/auth').createWorkspaceAuth(auth.env);
  app = express();
  app.use(workspace.checkOrigin, workspace.requireSession, express.json());
  app.use('/api/project-helper', require('../src/routes/projectScheduleLink').createProjectScheduleLinkRouter({ query, lookupTimeoutMs: 20 }));
  let release;
  query.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const before = fs.readFileSync(store.storePath, 'utf8');
  const pending = authorized('put', url, body()).then(response => response);
  const completed = await within(pending);
  release({ rows: [{ id: 7, name: 'Too late' }] });
  const response = await pending;
  expect(completed).not.toBe('stalled');
  expect(response.status).toBe(503);
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
});
