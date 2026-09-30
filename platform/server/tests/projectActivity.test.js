const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/services/clientPacketPdf', () => ({ createClientPacketPdf: jest.fn(async () => Buffer.from('%PDF-fixture')) }));
const auth = createAuthFixture();
let directory, previousPath, store, app;
const projectId = 'activity-fixture';
const api = `/api/project-helper/projects/${projectId}`;
const authorized = (method, url, body) => {
  const req = request(app)[method](url).set('Authorization', `Bearer ${auth.token()}`);
  return body === undefined ? req : req.send(body);
};

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-project-activity-'));
  previousPath = process.env.COMMAND_CENTER_STORE_PATH;
  process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'state.json');
  fs.writeFileSync(process.env.COMMAND_CENTER_STORE_PATH, JSON.stringify({
    projects: [{ id: projectId, client: 'Fixture homeowner', address: 'Fixture site', model: 'Netherwood House', sqft: 440, bid_total: 125400 }],
    activity: [{ id: 'legacy-event', type: 'Old note', detail: 'Keep this legacy activity.' }],
  }));
  jest.resetModules();
  store = require('../src/services/commandCenterStore');
});
afterEach(() => {
  if (previousPath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
  else process.env.COMMAND_CENTER_STORE_PATH = previousPath;
  fs.rmSync(directory, { recursive: true, force: true });
});

function mountApp() {
  const express = require('express');
  const workspace = require('../src/auth').createWorkspaceAuth({ ...auth.env, CLERK_ALLOWED_USER_IDS: 'user_allowed,user_other' });
  const { activityContextMiddleware } = require('../src/services/activityEvents');
  app = express();
  app.use(workspace.checkOrigin, workspace.requireSession, activityContextMiddleware, express.json());
  app.use('/api/project-helper', require('../src/routes/projectActivity'));
  app.use('/api/command-center', require('../src/routes/commandCenter'));
  app.use('/api/contractor-desk', require('../src/routes/contractorDesk').createContractorDeskRouter({ env: auth.env }));
  app.use(require('../src/errorHandler'));
}

test('concurrent saved project changes append distinct durable events and preserve legacy activity', async () => {
  await Promise.all(Array.from({ length: 8 }, (_, index) => store.saveCommandCenter(current => ({
    projects: current.projects.map(project => ({ ...project, next_action: `Fixture step ${index}` })),
  }))));
  const saved = await store.loadCommandCenter();
  expect(saved.activity_events).toHaveLength(8);
  expect(new Set(saved.activity_events.map(event => event.id)).size).toBe(8);
  expect(saved.activity).toEqual([{ id: 'legacy-event', type: 'Old note', detail: 'Keep this legacy activity.' }]);
  const raw = JSON.parse(fs.readFileSync(store.storePath, 'utf8'));
  expect(raw.activity_events).toEqual(saved.activity_events);
});

test('concurrent authenticated edits retain each verified actor in the serialized event append', async () => {
  mountApp();
  const project = (await store.loadCommandCenter()).projects[0];
  const changes = [
    authorized('put', '/api/command-center', { projects: [{ ...project, next_action: 'First actor change' }] }),
    request(app).put('/api/command-center').set('Authorization', `Bearer ${auth.token({ sub: 'user_other' })}`)
      .send({ projects: [{ ...project, next_action: 'Second actor change' }] }),
  ];
  expect((await Promise.all(changes)).map(response => response.status)).toEqual([200, 200]);
  const events = (await store.loadCommandCenter()).activity_events;
  expect(events.map(event => event.actor_id).sort()).toEqual(['user_allowed', 'user_other']);
  expect(JSON.stringify(events)).not.toMatch(/Bearer|session_token|sk_test/);
});

test('failed atomic publication leaves both project state and activity unchanged', async () => {
  const before = fs.readFileSync(store.storePath, 'utf8');
  const rename = jest.spyOn(require('node:fs/promises'), 'rename').mockRejectedValueOnce(new Error('Fixture disk failure'));
  try {
    await expect(store.saveCommandCenter(current => ({ projects: current.projects.map(project => ({ ...project, next_action: 'Not saved' })) })))
      .rejects.toThrow('Fixture disk failure');
    expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
  } finally { rename.mockRestore(); }
});

test('reviewed notes are idempotent under concurrent retry and stamp the verified actor', async () => {
  mountApp();
  const body = { request_id: randomUUID(), text: 'Review the revised kitchen plan.', actor_id: 'forged-user', type: 'paid' };
  const responses = await Promise.all([authorized('post', `${api}/notes`, body), authorized('post', `${api}/notes`, body)]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
  expect(responses[0].body.event).toEqual(responses[1].body.event);
  expect(responses[0].body.event).toMatchObject({ project_id: projectId, actor_id: 'user_allowed', type: 'note.saved', text: body.text });
  expect(responses[0].body.event.id).toMatch(/^[a-f\d-]{36}$/);
  expect((await store.loadCommandCenter()).activity_events).toHaveLength(1);
  const replay = await authorized('post', `${api}/notes`, { ...body, request_id: body.request_id.toUpperCase() });
  expect(replay.status).toBe(200);
  expect(replay.body.event).toEqual(responses[0].body.event);
  const conflict = await authorized('post', `${api}/notes`, { ...body, text: 'A different note.' });
  expect(conflict.status).toBe(409);
});

test('recent history is project scoped, bounded, and cursor stable when new events arrive', async () => {
  mountApp();
  for (let index = 0; index < 7; index += 1) {
    expect((await authorized('post', `${api}/notes`, { request_id: randomUUID(), text: `Note ${index}` })).status).toBe(201);
  }
  const first = await authorized('get', `${api}/activity`);
  expect(first.body.events.map(event => event.text)).toEqual(['Note 6', 'Note 5', 'Note 4', 'Note 3', 'Note 2']);
  expect(first.body.next_cursor).toEqual(expect.any(String));
  await authorized('post', `${api}/notes`, { request_id: randomUUID(), text: 'Newest note' });
  const older = await authorized('get', `${api}/activity?cursor=${encodeURIComponent(first.body.next_cursor)}`);
  expect(older.body.events.map(event => event.text)).toEqual(['Note 1', 'Note 0']);
  expect(older.body.next_cursor).toBeNull();
  expect((await authorized('get', `${api}/activity?limit=51`)).status).toBe(400);
  expect((await authorized('get', `${api}/activity?cursor=forged`)).status).toBe(400);
  expect((await authorized('get', '/api/project-helper/projects/missing/activity')).status).toBe(404);
});

test('notes reject unknown projects, invalid request IDs, and blank, oversized, or nontext fields', async () => {
  mountApp();
  expect((await authorized('post', '/api/project-helper/projects/missing/notes', { request_id: randomUUID(), text: 'Fixture' })).status).toBe(404);
  for (const body of [
    { request_id: 'invalid', text: 'Fixture' },
    { request_id: randomUUID(), text: '' },
    { request_id: randomUUID(), text: 'x'.repeat(2001) },
    { request_id: randomUUID(), text: { value: 'Fixture' } },
  ]) expect((await authorized('post', `${api}/notes`, body)).status).toBe(400);
  expect((await store.loadCommandCenter()).activity_events || []).toHaveLength(0);
});

test('legacy text logging saves a reviewed project draft without sending a text or trusting event claims', async () => {
  mountApp();
  const sendSms = jest.spyOn(require('../src/services/productionIntegrations'), 'sendSms')
    .mockImplementation(() => { throw new Error('Logging must never send a text.'); });
  try {
    const logged = await authorized('post', '/api/command-center/activity', {
      project_id: projectId, type: 'Builder text', detail: '  Please review the updated scope.  ', actor_id: 'forged',
    });
    expect(logged.status).toBe(201);
    expect(logged.body.activity[0]).toMatchObject({ project_id: projectId, type: 'Builder text', detail: 'Please review the updated scope.' });
    const history = (await authorized('get', `${api}/activity`)).body.events;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ project_id: projectId, actor_id: 'user_allowed', type: 'text.draft_logged',
      summary: 'Saved text draft for review.', text: 'Please review the updated scope.' });
    const note = await authorized('post', '/api/command-center/activity', { project_id: projectId, type: 'payment.paid', detail: 'Invoice needs review.' });
    expect(note.status).toBe(201);
    expect((await authorized('get', `${api}/activity`)).body.events[0]).toMatchObject({ type: 'note.logged', summary: 'Saved project note.', text: 'Invoice needs review.' });
    expect(sendSms).not.toHaveBeenCalled();
  } finally { sendSms.mockRestore(); }
});

test('legacy logging rejects invalid project and text fields without changing the store', async () => {
  mountApp();
  const before = fs.readFileSync(store.storePath, 'utf8');
  expect((await authorized('post', '/api/command-center/activity', { project_id: 'missing', detail: 'Fixture' })).status).toBe(404);
  for (const body of [
    { project_id: null }, { project_id: [] }, { project_id: '' }, { project_id: 'x'.repeat(121) }, { project_id: 'bad\u0000id' },
    { type: [] }, { type: '' }, { type: 'x'.repeat(81) }, { type: 'Bad\nlabel' },
    { detail: {} }, { detail: '' }, { detail: 'x'.repeat(2001) }, { detail: 'Bad\u0000text' },
  ]) expect((await authorized('post', '/api/command-center/activity', body)).status).toBe(400);
  expect(fs.readFileSync(store.storePath, 'utf8')).toBe(before);
});

test('concurrent legacy logs preserve every entry and existing history with or without a project', async () => {
  mountApp();
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => authorized('post', '/api/command-center/activity', {
    ...(index % 2 ? { project_id: projectId } : {}), type: 'Builder note', detail: `Concurrent log ${index}`,
  })));
  expect(responses.map(response => response.status)).toEqual(Array(8).fill(201));
  const saved = await store.loadCommandCenter();
  expect(saved.activity).toHaveLength(9);
  expect(new Set(saved.activity.map(row => row.id)).size).toBe(9);
  expect(saved.activity.some(row => row.id === 'legacy-event')).toBe(true);
  expect(saved.activity.map(row => row.detail)).toEqual(expect.arrayContaining(Array.from({ length: 8 }, (_, index) => `Concurrent log ${index}`)));
  expect(saved.activity_events).toHaveLength(4);
  expect(saved.activity_events.every(event => event.project_id === projectId && event.type === 'note.logged')).toBe(true);
  const legacyDefault = await authorized('post', '/api/command-center/activity', {});
  expect(legacyDefault.status).toBe(201);
  expect(legacyDefault.body.activity[0]).toMatchObject({ type: 'Builder note', detail: 'Version 10 builder activity logged.' });
  expect(legacyDefault.body.activity_events).toHaveLength(4);
});

test('anonymous activity access and generic activity history replacement are refused', async () => {
  mountApp();
  expect((await request(app).get(`${api}/activity`)).status).toBe(401);
  expect((await request(app).post(`${api}/notes`).send({ request_id: randomUUID(), text: 'Fixture' })).status).toBe(401);
  await authorized('post', `${api}/notes`, { request_id: randomUUID(), text: 'Preserve this.' });
  const before = (await store.loadCommandCenter()).activity_events;
  expect((await authorized('put', '/api/command-center', { activity_events: [] })).status).toBe(400);
  await store.saveCommandCenter({ activity_events: [{ id: 'forged' }] });
  expect((await store.loadCommandCenter()).activity_events).toEqual(before);
  await store.saveCommandCenter({ bid_requests: [{ id: 'reset-fixture-bid', project_id: projectId }] });
  await store.resetCommandCenter();
  expect((await store.loadCommandCenter()).activity_events).toEqual(expect.arrayContaining(before));
  expect((await store.loadCommandCenter()).bid_requests).toBeUndefined();
});

test('successful document preparation records generation, while a failed PDF records no success', async () => {
  mountApp();
  const route = `/api/command-center/projects/${projectId}`;
  expect((await authorized('post', `${route}/invoice-drafts`)).status).toBe(201);
  expect((await authorized('get', `${route}/client-packet.pdf`)).status).toBe(200);
  const events = (await authorized('get', `${api}/activity`)).body.events;
  expect(events.map(event => event.type)).toEqual(['document.generated', 'invoice_drafts.prepared']);
  expect(events.every(event => event.actor_id === 'user_allowed')).toBe(true);
  expect(events.map(event => event.summary).join(' ')).not.toMatch(/sent|delivered|paid/i);
  require('../src/services/clientPacketPdf').createClientPacketPdf.mockRejectedValueOnce(new Error('fixture render failure'));
  expect((await authorized('get', `${route}/client-packet.pdf`)).status).toBe(503);
  expect((await store.loadCommandCenter()).activity_events).toHaveLength(2);
});

test('supplier, bid request, received text, and weather decisions produce accurate project events', async () => {
  mountApp();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  await store.saveCommandCenter({ supplier_quotes: [{ id: 'fixture-supplier', supplier: 'Fixture supplier', package: 'Windows', quoted_total: 2400 }] });
  expect((await authorized('post', `/api/command-center/projects/${projectId}/send-supplier-to-cogs`, { quote_id: 'fixture-supplier' })).status).toBe(201);
  expect((await authorized('post', '/api/contractor-desk/bid-requests', {
    project_id: projectId, trade: 'Framing', title: 'Review framing quote', scope: 'Fixture scope', contact_name: 'Fixture contractor', contact_phone: '5055550123',
  })).status).toBe(201);
  const held = await authorized('post', '/api/contractor-desk/weather-holds', { project_id: projectId, trade: 'Roofing', date: today, note: 'Site conditions need review.' });
  expect(held.status).toBe(201);
  expect((await authorized('post', `/api/contractor-desk/weather-holds/${held.body.weather_holds[0].id}/cancel`, {})).status).toBe(200);
  await store.saveCommandCenter(current => ({ sms_inbox: [{ id: 'sms-fixture', project_id: projectId, body: 'Fixture quote', status: 'Needs review' }, ...(current.sms_inbox || [])] }));
  expect((await authorized('post', '/api/contractor-desk/sms/sms-fixture/review', { project_id: projectId })).status).toBe(200);
  const events = (await authorized('get', `${api}/activity?limit=50`)).body.events;
  expect(events.map(event => event.type)).toEqual(['text.reviewed', 'text.received', 'weather_hold.cancelled', 'weather_hold.confirmed', 'bid_request.prepared', 'supplier.cogs_updated']);
  expect(events.find(event => event.type === 'text.received').actor_id).toBe('system:twilio');
  expect(events.filter(event => event.type !== 'text.received').every(event => event.actor_id === 'user_allowed')).toBe(true);
  expect(events.map(event => event.summary).join(' ')).not.toMatch(/sent|delivered|paid/i);
});
