const request = require('supertest');
const { createWorkspaceAuth } = require('../src/auth');

jest.mock('../src/db', () => ({ pool: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));

const { createApp } = require('../src/index');
const localEnv = { ABQ_LOCAL_WORKSPACE: '1', NODE_ENV: 'development', HOST: '127.0.0.1' };
let server;

beforeEach(async () => {
  server = createApp({ env: localEnv }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await new Promise(resolve => server.close(resolve));
});

const origin = () => `http://127.0.0.1:${server.address().port}`;
const handshake = () => request(server).post('/api/auth/local-session')
  .set('Origin', origin()).set('X-ABQ-Local-Access', '1').send({});

test('explicit local entry creates a bearer session and unlocks an existing business read', async () => {
  const config = await request(server).get('/api/auth/config');
  expect(config.body).toEqual({ configured: true, mode: 'local', publishableKey: null });
  expect(config.headers['cache-control']).toContain('no-store');
  expect((await request(server).get('/api/clients')).status).toBe(401);
  const entered = await handshake();
  expect(entered.status).toBe(201);
  expect(entered.body).toMatchObject({ userId: 'local-owner', sessionId: expect.any(String) });
  expect(Buffer.from(entered.body.token, 'base64url').length).toBeGreaterThanOrEqual(32);
  expect(entered.headers['cache-control']).toContain('no-store');
  const authorization = `Bearer ${entered.body.token}`;
  const clients = await request(server).get('/api/clients').set('Authorization', authorization);
  expect(clients.status).toBe(200);
  expect(clients.body).toEqual([]);
  const session = await request(server).get('/api/auth/session').set('Authorization', authorization);
  expect(session.body).toEqual({ userId: 'local-owner' });
});

test.each([
  ['foreign origin', { Origin: 'https://attacker.example' }],
  ['lookalike local origin', { Origin: 'http://localhost.attacker.example' }],
  ['null origin', { Origin: 'null' }],
  ['foreign host', { Host: 'attacker.example' }],
  ['wrong local port', { Host: '127.0.0.1:1' }],
  ['forwarded headers cannot fix a foreign host', { Host: 'attacker.example', 'X-Forwarded-Host': '127.0.0.1', 'X-Forwarded-For': '127.0.0.1' }],
  ['forwarded peer', { 'X-Forwarded-For': '127.0.0.1' }],
  ['forwarded protocol', { 'X-Forwarded-Proto': 'http' }],
  ['forwarded port', { 'X-Forwarded-Port': '4000' }],
  ['standard proxy header', { Forwarded: 'for=127.0.0.1' }],
  ['real IP proxy header', { 'X-Real-IP': '127.0.0.1' }],
  ['cross-site fetch', { 'Sec-Fetch-Site': 'cross-site' }],
  ['same-site fetch from another origin', { 'Sec-Fetch-Site': 'same-site' }],
])('local config and handshake reject %s', async (_name, headers) => {
  expect((await request(server).get('/api/auth/config').set(headers)).status).toBe(403);
  expect((await handshake().set(headers)).status).toBe(403);
});

test('local handshake requires an explicit custom header and JSON content type', async () => {
  const missingHeader = await request(server).post('/api/auth/local-session').send({});
  expect(missingHeader.status).toBe(403);
  const wrongHeader = await handshake().set('X-ABQ-Local-Access', 'true');
  expect(wrongHeader.status).toBe(403);
  const form = await request(server).post('/api/auth/local-session')
    .set('X-ABQ-Local-Access', '1').type('form').send({ enter: '1' });
  expect(form.status).toBe(415);
});

test('valid capabilities cannot override an untrusted business request origin or host', async () => {
  const entered = await handshake();
  for (const headers of [{ Origin: 'http://localhost:1' }, { Origin: 'https://attacker.example' }, { Host: 'attacker.example' }]) {
    const response = await request(server).get('/api/clients')
      .set('Authorization', `Bearer ${entered.body.token}`).set(headers);
    expect(response.status).toBe(403);
  }
});

test('forged capabilities and cookie-only requests do not authenticate', async () => {
  const entered = await handshake();
  expect((await request(server).get('/api/clients').set('Authorization', `Bearer ${'A'.repeat(43)}`)).status).toBe(401);
  expect((await request(server).get('/api/clients').set('Cookie', `__session=${entered.body.token}`)).status).toBe(401);
});

test('signing out revokes only the selected local session', async () => {
  const first = await handshake();
  const second = await handshake();
  expect(first.body.token).not.toBe(second.body.token);
  const revoked = await request(server).delete('/api/auth/local-session')
    .set('Authorization', `Bearer ${first.body.token}`);
  expect(revoked.status).toBe(204);
  expect((await request(server).get('/api/clients').set('Authorization', `Bearer ${first.body.token}`)).status).toBe(401);
  expect((await request(server).get('/api/clients').set('Authorization', `Bearer ${second.body.token}`)).status).toBe(200);
});

test('local capabilities expire after eight hours and are invalid in a new app instance', async () => {
  const entered = await handshake();
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 7 * 60 * 60 * 1000);
  expect((await request(server).get('/api/clients').set('Authorization', `Bearer ${entered.body.token}`)).status).toBe(200);
  clock.mockReturnValue(now + 8 * 60 * 60 * 1000);
  expect((await request(server).get('/api/clients').set('Authorization', `Bearer ${entered.body.token}`)).status).toBe(401);
  jest.restoreAllMocks();
  const newApp = createApp({ env: localEnv });
  expect((await request(newApp).get('/api/clients').set('Authorization', `Bearer ${entered.body.token}`)).status).toBe(401);
});

test('entry at capacity revokes an abandoned session while preserving recently used access', async () => {
  const active = await handshake();
  const abandoned = await handshake();
  for (let index = 2; index < 64; index += 1) expect((await handshake()).status).toBe(201);
  expect((await request(server).get('/api/clients').set('Authorization', `Bearer ${active.body.token}`)).status).toBe(200);

  const reopened = await handshake();
  expect(reopened.status).toBe(201);
  expect((await request(server).get('/api/clients').set('Authorization', `Bearer ${abandoned.body.token}`)).status).toBe(401);
  expect((await request(server).get('/api/clients').set('Authorization', `Bearer ${active.body.token}`)).status).toBe(200);
  expect((await request(server).get('/api/clients').set('Authorization', `Bearer ${reopened.body.token}`)).status).toBe(200);
});

test.each(['192.0.2.1', '::ffff:192.0.2.1', undefined])('physical peer %s is rejected independently of a trusted Host', remoteAddress => {
  const auth = createWorkspaceAuth(localEnv);
  const req = { headers: { host: '127.0.0.1:4000' }, socket: { remoteAddress, localPort: 4000 } };
  const res = { set: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  auth.checkOrigin(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test.each([
  { ...localEnv, NODE_ENV: 'production' },
  { ...localEnv, NODE_ENV: 'test' },
  { ...localEnv, HOST: '0.0.0.0' },
  { ...localEnv, HOST: 'localhost' },
  { ABQ_LOCAL_WORKSPACE: '1' },
])('invalid local activation fails closed at startup: %j', env => {
  expect(() => createWorkspaceAuth(env)).toThrow(/local workspace.*development.*127\.0\.0\.1/i);
});

test('default unconfigured Clerk remains locked and cannot create local sessions', async () => {
  const locked = createApp({ env: {} });
  expect((await request(locked).get('/api/clients')).status).toBe(503);
  expect((await request(locked).get('/api/auth/config')).body).toEqual({ configured: false, publishableKey: null });
  expect((await request(locked).post('/api/auth/local-session').set('X-ABQ-Local-Access', '1').send({})).status).toBe(404);
});
