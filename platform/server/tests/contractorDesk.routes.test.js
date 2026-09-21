const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const twilio = require('twilio');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/db', () => ({ pool: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));

const auth = createAuthFixture();
const inboundPath = '/api/contractor-desk/sms/inbound';
const env = {
  ...auth.env,
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'fixture-token-only',
  TWILIO_FROM_NUMBER: '+15055550100',
  TWILIO_INBOUND_URL: `https://builder.example.test${inboundPath}`,
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
const bid = () => ({ project_id: 'site-a', trade: 'Roofing', title: 'Roofing quote', scope: 'Quote labor and materials for the ADU roof.', due_date: today(), contact_name: 'Fixture roofer', contact_phone: '(505) 555-0123' });
let directory;
let previousStorePath;
let store;
let save;
let app;
let createApp;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-contractor-desk-'));
  previousStorePath = process.env.COMMAND_CENTER_STORE_PATH;
  process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'store.json');
  fs.writeFileSync(process.env.COMMAND_CENTER_STORE_PATH, JSON.stringify({ projects: [{ id: 'site-a', client: 'Fixture homeowner', address: '123 Fixture Street' }], activity: [] }));
  jest.resetModules();
  store = require('../src/services/commandCenterStore');
  save = store.saveCommandCenter;
  jest.spyOn(store, 'saveCommandCenter');
  createApp = require('../src/index').createApp;
  app = createApp({ env });
});

afterEach(() => {
  if (previousStorePath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
  else process.env.COMMAND_CENTER_STORE_PATH = previousStorePath;
  fs.rmSync(directory, { recursive: true, force: true });
});

function staff(method, url, body) {
  const pending = request(app)[method](url).set('Authorization', `Bearer ${auth.token()}`);
  return body === undefined ? pending : pending.send(body);
}

function smsParams(overrides = {}) {
  return { AccountSid: env.TWILIO_ACCOUNT_SID, MessageSid: `SM${'b'.repeat(32)}`, From: '+15055550123', To: env.TWILIO_FROM_NUMBER, Body: 'A quote is ready.', NumMedia: '0', ...overrides };
}

function incoming(params, { targetApp = app, signature, url = env.TWILIO_INBOUND_URL } = {}) {
  return request(targetApp).post(inboundPath).type('form')
    .set('X-Twilio-Signature', signature || twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, url, params)).send(params);
}

test('approved staff create a saved, referenced bid draft without marking it sent', async () => {
  const response = await staff('post', '/api/contractor-desk/bid-requests', bid());
  expect(response.status).toBe(201);
  const row = response.body.bid_requests[0];
  expect(row).toMatchObject({ project_id: 'site-a', trade: 'Roofing', contact_phone: '+15055550123', status: 'Draft' });
  expect(row.reference).toMatch(/^BID-[A-Z0-9]{8}$/);
  expect(row.message_body).toContain(row.reference);
  expect(row.message_body).toContain(env.TWILIO_FROM_NUMBER);
  expect(row.message_body).toContain('123 Fixture Street');
  expect((await store.loadCommandCenter()).bid_requests).toEqual([row]);
  expect(row).not.toHaveProperty('sent_at');
});

test.each([
  ['bad phone', { contact_phone: 'not-a-phone' }],
  ['missing scope', { scope: '' }],
  ['oversized scope', { scope: 'x'.repeat(4001) }],
  ['past date', { due_date: '2000-01-01' }],
  ['invalid calendar date', { due_date: '2026-02-30' }],
  ['wrong field type', { trade: ['Roofing'] }],
])('rejects %s without saving a bid', async (_name, patch) => {
  const response = await staff('post', '/api/contractor-desk/bid-requests', { ...bid(), ...patch });
  expect(response.status).toBe(400);
  expect((await store.loadCommandCenter()).bid_requests).toBeUndefined();
});

test('unknown projects cannot receive a bid or a weather hold', async () => {
  expect((await staff('post', '/api/contractor-desk/bid-requests', { ...bid(), project_id: 'deleted' })).status).toBe(404);
  expect((await staff('post', '/api/contractor-desk/weather-holds', { project_id: 'deleted', trade: 'Roofing', date: today(), note: 'Site not ready.' })).status).toBe(404);
});

test('staff explicitly confirm one weather hold and dates outside the next ten days are refused', async () => {
  const response = await staff('post', '/api/contractor-desk/weather-holds', { project_id: 'site-a', trade: 'Concrete', date: today(), note: 'Hold the pour until the site is dry.' });
  expect(response.status).toBe(201);
  expect(response.body.weather_holds[0]).toMatchObject({ project_id: 'site-a', date: today(), status: 'Confirmed', note: 'Hold the pour until the site is dry.' });
  expect(response.body.weather_holds[0].message_body).toContain('Concrete');
  for (const date of ['2000-01-01', '2100-01-01', '2026-02-30']) {
    expect((await staff('post', '/api/contractor-desk/weather-holds', { project_id: 'site-a', trade: 'Concrete', date, note: 'Hold.' })).status).toBe(400);
  }
  expect((await store.loadCommandCenter()).weather_holds).toHaveLength(1);
});

test('staff-only routes reject unauthenticated and non-allowlisted accounts', async () => {
  for (const route of ['bid-requests', 'weather-holds']) {
    expect((await request(app).post(`/api/contractor-desk/${route}`).send(bid())).status).toBe(401);
    expect((await request(app).post(`/api/contractor-desk/${route}`).set('Authorization', `Bearer ${auth.token({ sub: 'user_outsider' })}`).send(bid())).status).toBe(403);
  }
  expect((await request(app).get('/api/contractor-desk/status')).status).toBe(401);
});

test('inbound status reveals the receiving number and missing variable names but never credentials', async () => {
  const response = await staff('get', '/api/contractor-desk/status');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ inbound_configured: true, phone: env.TWILIO_FROM_NUMBER, missing: [] });
  expect(JSON.stringify(response.body)).not.toContain(env.TWILIO_AUTH_TOKEN);
  const incomplete = createApp({ env: { ...auth.env } });
  const status = await request(incomplete).get('/api/contractor-desk/status').set('Authorization', `Bearer ${auth.token()}`);
  expect(status.body.inbound_configured).toBe(false);
  expect(status.body.phone).toBeNull();
  expect(status.body.missing).toContain('TWILIO_INBOUND_URL');
});

test('signed inbound texts persist once and associate only a known reference from the matching contact', async () => {
  const draft = (await staff('post', '/api/contractor-desk/bid-requests', bid())).body.bid_requests[0];
  const params = smsParams({ Body: `${draft.reference}: labor and materials $4,200. <script>leave as text</script>` });
  const response = await incoming(params);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/xml/);
  expect(response.text).toContain('<Response/>');
  expect(response.text).not.toMatch(/<Message|<Redirect/);
  expect((await incoming(params)).status).toBe(200);
  const state = await store.loadCommandCenter();
  expect(state.sms_inbox).toHaveLength(1);
  expect(state.sms_inbox[0]).toMatchObject({ provider_sid: params.MessageSid, body: params.Body, project_id: 'site-a', bid_request_id: draft.id, reference: draft.reference, status: 'Needs review' });
  expect(state.bid_requests[0].status).toBe('Draft');
  expect(state.bid_requests[0]).not.toHaveProperty('quoted_amount');
});

test('unknown references and a different sender stay in the unassigned inbox', async () => {
  const draft = (await staff('post', '/api/contractor-desk/bid-requests', bid())).body.bid_requests[0];
  await incoming(smsParams({ Body: draft.reference, From: '+15055550999' }));
  await incoming(smsParams({ Body: 'BID-UNKNOWN1', MessageSid: `SM${'c'.repeat(32)}` }));
  const rows = (await store.loadCommandCenter()).sms_inbox;
  expect(rows).toHaveLength(2);
  rows.forEach(row => expect(row).toMatchObject({ project_id: null, bid_request_id: null, status: 'Needs review' }));
});

test('forged and modified signatures or parameters do not write to the inbox', async () => {
  const params = smsParams({ ExtraTwilioField: 'included in signature' });
  const originalSignature = twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_INBOUND_URL, params);
  expect((await incoming(params, { signature: 'forged' })).status).toBe(403);
  expect((await incoming({ ...params, Body: 'altered' }, { signature: originalSignature })).status).toBe(403);
  expect((await incoming({ ...params, ExtraTwilioField: 'altered' }, { signature: originalSignature })).status).toBe(403);
  expect((await incoming(params, { url: 'https://attacker.example/api/contractor-desk/sms/inbound' })).status).toBe(403);
  expect((await incoming({ ...params, AccountSid: `AC${'f'.repeat(32)}` })).status).toBe(403);
  expect((await incoming({ ...params, To: '+15055550999' })).status).toBe(403);
  expect((await store.loadCommandCenter()).sms_inbox).toBeUndefined();
});

test('inbound signatures work without Clerk setup and cannot be used for staff APIs', async () => {
  const locked = createApp({ env: { ...env, CLERK_ALLOWED_USER_IDS: '' } });
  expect((await incoming(smsParams(), { targetApp: locked })).status).toBe(200);
  expect((await request(locked).post('/api/contractor-desk/bid-requests').set('X-Twilio-Signature', 'anything').send(bid())).status).toBe(503);
});

test('unconfigured webhooks fail closed and malformed content never reaches storage', async () => {
  const missing = createApp({ env: auth.env });
  expect((await incoming(smsParams(), { targetApp: missing })).status).toBe(503);
  expect((await request(app).post(inboundPath).send(smsParams())).status).toBe(400);
  expect((await incoming(smsParams({ MessageSid: 'not-a-sid' }))).status).toBe(400);
  expect((await incoming(smsParams({ Body: 'x'.repeat(4097) }))).status).toBe(400);
  expect((await store.loadCommandCenter()).sms_inbox).toBeUndefined();
});

test('STOP and START update reviewable opt-out state while sending no reply', async () => {
  const stop = await incoming(smsParams({ Body: 'STOP' }));
  expect(stop.text).toContain('<Response/>');
  expect((await store.loadCommandCenter()).sms_contact_preferences[0]).toMatchObject({ phone: '+15055550123', opted_out: true });
  const start = await incoming(smsParams({ Body: 'START', MessageSid: `SM${'d'.repeat(32)}` }));
  expect(start.text).toContain('<Response/>');
  expect((await store.loadCommandCenter()).sms_contact_preferences[0]).toMatchObject({ phone: '+15055550123', opted_out: false });
});

test.each(['bid_requests', 'sms_inbox', 'weather_holds', 'sms_contact_preferences'])('generic command-center writes cannot overwrite owned %s', async key => {
  const response = await staff('put', '/api/command-center', { [key]: [], projects: [] });
  expect(response.status).toBe(400);
  expect((await store.loadCommandCenter()).projects).toHaveLength(1);
});

test('concurrent drafts, duplicate webhooks, and a project edit preserve every independent record', async () => {
  const responses = await Promise.all([
    staff('post', '/api/contractor-desk/bid-requests', bid()),
    staff('post', '/api/contractor-desk/bid-requests', { ...bid(), title: 'Second quote' }),
    incoming(smsParams()), incoming(smsParams()),
    staff('put', '/api/command-center', { projects: [{ id: 'site-a', client: 'Updated fixture homeowner', address: 'Updated fixture address' }] }),
  ]);
  expect(responses.every(response => response.status < 300)).toBe(true);
  const state = await store.loadCommandCenter();
  expect(state.bid_requests).toHaveLength(2);
  expect(new Set(state.bid_requests.map(row => row.reference)).size).toBe(2);
  expect(state.sms_inbox).toHaveLength(1);
  expect(state.projects[0].client).toBe('Updated fixture homeowner');
});

test.each([
  '/api/command-center/supplier-bidout/send-to-cogs',
  '/api/command-center/projects/site-a/send-supplier-to-cogs',
])('supplier import %s retains a text, draft, and hold arriving immediately before its save', async route => {
  await staff('post', '/api/contractor-desk/bid-requests', bid());
  await staff('post', '/api/contractor-desk/weather-holds', { project_id: 'site-a', trade: 'Concrete', date: today(), note: 'Hold fixture.' });
  await incoming(smsParams({ MessageSid: `SM${'e'.repeat(32)}`, Body: 'Earlier fixture message.' }));
  // Interleave a real signed delivery and dedicated workflow writes between the
  // import's read and commit. Each uses the real serialized temporary store.
  store.saveCommandCenter.mockImplementationOnce(async patch => {
    expect((await incoming(smsParams())).status).toBe(200);
    expect((await staff('post', '/api/contractor-desk/bid-requests', { ...bid(), title: 'Concurrent quote' })).status).toBe(201);
    expect((await staff('post', '/api/contractor-desk/weather-holds', { project_id: 'site-a', trade: 'Roofing', date: today(), note: 'Concurrent hold.' })).status).toBe(201);
    return save(patch);
  });
  const response = await staff('post', route, { project_id: 'site-a', package_id: 'sip-pur-panels' });
  expect(response.status).toBe(201);
  const state = await store.loadCommandCenter();
  expect(state.sms_inbox).toHaveLength(2);
  expect(state.bid_requests).toHaveLength(2);
  expect(state.weather_holds).toHaveLength(2);
  expect(state.projects[0].supplier_status).toBe('Supplier COGS imported');
  expect(state.estimate_sections[0].items[0].source).toBe('supplier-bidout');
});

test('staff can cancel a hold once and restore the workday without deleting its history', async () => {
  const created = await staff('post', '/api/contractor-desk/weather-holds', { project_id: 'site-a', trade: 'Concrete', date: today(), note: 'Hold fixture.' });
  const hold = created.body.weather_holds[0];
  const endpoint = `/api/contractor-desk/weather-holds/${hold.id}/cancel`;
  const cancelled = await staff('post', endpoint, {});
  expect(cancelled.status).toBe(200);
  expect(cancelled.body.weather_holds).toHaveLength(1);
  expect(cancelled.body.weather_holds[0]).toMatchObject({ ...hold, status: 'Cancelled', cancelled_at: expect.any(String) });
  const again = await staff('post', endpoint, {});
  expect(again.status).toBe(200);
  expect(again.body.weather_holds).toEqual(cancelled.body.weather_holds);
  expect(again.body.projects).toEqual(created.body.projects);
});

test('staff assign and review an unmatched text while preserving its original message', async () => {
  await incoming(smsParams({ Body: 'Please call about the job.' }));
  const message = (await store.loadCommandCenter()).sms_inbox[0];
  const reviewed = await staff('post', `/api/contractor-desk/sms/${message.id}/review`, { project_id: 'site-a' });
  expect(reviewed.status).toBe(200);
  expect(reviewed.body.sms_inbox[0]).toMatchObject({ ...message, project_id: 'site-a', status: 'Reviewed', reviewed_at: expect.any(String) });
  const again = await staff('post', `/api/contractor-desk/sms/${message.id}/review`, { project_id: 'site-a' });
  expect(again.body.sms_inbox).toEqual(reviewed.body.sms_inbox);
});

test('reassigning a reviewed text removes a bid link from a different project', async () => {
  const draft = (await staff('post', '/api/contractor-desk/bid-requests', bid())).body.bid_requests[0];
  await incoming(smsParams({ Body: `${draft.reference} quote is ready.` }));
  const message = (await store.loadCommandCenter()).sms_inbox[0];
  await save(current => ({ projects: [...current.projects, { id: 'site-b', client: 'Second fixture' }] }));
  const reviewed = await staff('post', `/api/contractor-desk/sms/${message.id}/review`, { project_id: 'site-b' });
  expect(reviewed.status).toBe(200);
  expect(reviewed.body.sms_inbox[0]).toMatchObject({ project_id: 'site-b', bid_request_id: null, reference: draft.reference, body: message.body, status: 'Reviewed' });
});

test('review and cancellation reject unknown records, unknown projects, and anonymous requests', async () => {
  await incoming(smsParams());
  const message = (await store.loadCommandCenter()).sms_inbox[0];
  expect((await staff('post', '/api/contractor-desk/weather-holds/missing/cancel', {})).status).toBe(404);
  expect((await staff('post', '/api/contractor-desk/sms/missing/review', { project_id: 'site-a' })).status).toBe(404);
  expect((await staff('post', `/api/contractor-desk/sms/${message.id}/review`, { project_id: 'deleted-project' })).status).toBe(404);
  expect((await staff('post', `/api/contractor-desk/sms/${message.id}/review`, {})).status).toBe(400);
  for (const endpoint of ['/api/contractor-desk/weather-holds/missing/cancel', `/api/contractor-desk/sms/${message.id}/review`]) {
    expect((await request(app).post(endpoint).send({ project_id: 'site-a' })).status).toBe(401);
    expect((await request(app).post(endpoint).set('Authorization', `Bearer ${auth.token({ sub: 'user_outsider' })}`).send({ project_id: 'site-a' })).status).toBe(403);
  }
  expect((await store.loadCommandCenter()).sms_inbox[0].status).toBe('Needs review');
});

test('review and cancellation preserve a concurrently arriving signed message', async () => {
  await incoming(smsParams());
  const created = await staff('post', '/api/contractor-desk/weather-holds', { project_id: 'site-a', trade: 'Concrete', date: today(), note: 'Hold fixture.' });
  const hold = created.body.weather_holds[0];
  const message = created.body.sms_inbox[0];
  const responses = await Promise.all([
    staff('post', `/api/contractor-desk/weather-holds/${hold.id}/cancel`, {}),
    staff('post', `/api/contractor-desk/sms/${message.id}/review`, { project_id: 'site-a' }),
    incoming(smsParams({ MessageSid: `SM${'f'.repeat(32)}`, Body: 'Concurrent reply.' })),
  ]);
  expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
  const state = await store.loadCommandCenter();
  expect(state.sms_inbox).toHaveLength(2);
  expect(state.sms_inbox.find(row => row.id === message.id).status).toBe('Reviewed');
  expect(state.sms_inbox.find(row => row.body === 'Concurrent reply.').status).toBe('Needs review');
  expect(state.weather_holds[0].status).toBe('Cancelled');
});
