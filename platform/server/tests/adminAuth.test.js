const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');
const request = require('supertest');

jest.mock('../src/db', () => ({ pool: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));
const { createApp } = require('../src/index');
const password = 'Synthetic-test-password-482!';
const origin = 'http://127.0.0.1:4000';
let directory, credentialFile, env, app;
const login = (body = { username: 'admin', password }, target = app) => request(target).post('/api/auth/admin-session')
  .set('Host', '127.0.0.1:4000').set('Origin', origin).send(body);
const business = token => request(app).get('/api/clients').set('Host', '127.0.0.1:4000')
  .set('Authorization', `Bearer ${token}`);

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-admin-auth-'));
  credentialFile = path.join(directory, 'admin-auth.json');
  const salt = randomBytes(32).toString('hex');
  fs.writeFileSync(credentialFile, JSON.stringify({ version: 1, username: 'admin', kdf: 'scrypt-v1', salt,
    passwordHash: scryptSync(password, Buffer.from(salt, 'hex'), 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex') }), { mode: 0o600 });
});
beforeEach(() => {
  env = { ABQ_AUTH_MODE: 'admin', APP_ORIGINS: origin, ABQ_ADMIN_CREDENTIAL_FILE: credentialFile };
  app = createApp({ env });
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

test('explicit admin mode exposes sanitized setup and creates a memory bearer session', async () => {
  const config = await request(app).get('/api/auth/config');
  expect(config.body).toEqual({ mode: 'admin', configured: true, publishableKey: null });
  expect(config.headers['cache-control']).toContain('no-store');
  const entered = await login();
  expect(entered.status).toBe(201);
  expect(entered.body).toMatchObject({ userId: 'admin-owner', sessionId: expect.any(String), expiresAt: expect.any(String) });
  expect(Buffer.from(entered.body.token, 'base64url').length).toBe(32);
  expect(entered.headers['set-cookie']).toBeUndefined();
  expect((await business(entered.body.token)).status).toBe(200);
  const session = await request(app).get('/api/auth/session').set('Host', '127.0.0.1:4000')
    .set('Authorization', `Bearer ${entered.body.token}`);
  expect(session.body).toEqual({ userId: 'admin-owner' });
});

test.each([{ username: 'admin', password: 'Wrong-password-482!' }, { username: 'other', password }])('wrong credentials return a generic failure and never unlock business data', async body => {
  const response = await login(body);
  expect(response.status).toBe(401);
  expect(response.body).toEqual({ error: 'Username or password is incorrect.' });
  expect(response.body).not.toHaveProperty('token');
  expect((await business('A'.repeat(43))).status).toBe(401);
});

test('admin mode takes precedence over the local workspace flag without allowing a bootstrap bypass', async () => {
  const target = createApp({ env: { ...env, ABQ_LOCAL_WORKSPACE: '1', NODE_ENV: 'development', HOST: '127.0.0.1' } });
  expect((await request(target).get('/api/auth/config')).body.mode).toBe('admin');
  const bypass = await request(target).post('/api/auth/local-session').set('Host', '127.0.0.1:4000')
    .set('Origin', origin).set('X-ABQ-Local-Access', '1').send({});
  expect(bypass.status).toBe(404);
  expect((await login(undefined, target)).status).toBe(201);
});

test.each([
  ['foreign origin', { Origin: 'https://attacker.example' }],
  ['null origin', { Origin: 'null' }],
  ['another allowed origin is not the request host', { Origin: 'http://localhost:4000' }],
  ['foreign host', { Host: 'attacker.example' }],
  ['cross-site browser metadata', { 'Sec-Fetch-Site': 'cross-site' }],
  ['same-site browser metadata', { 'Sec-Fetch-Site': 'same-site' }],
])('login rejects %s', async (_name, headers) => {
  const response = await login().set(headers);
  expect(response.status).toBe(403);
  expect(response.body).not.toHaveProperty('token');
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
});

test('login requires Origin and JSON and sanitizes parser errors instead of logging password bytes', async () => {
  const absent = await request(app).post('/api/auth/admin-session').set('Host', '127.0.0.1:4000').send({ username: 'admin', password });
  expect(absent.status).toBe(403);
  const form = await request(app).post('/api/auth/admin-session').set('Host', '127.0.0.1:4000').set('Origin', origin)
    .type('form').send({ username: 'admin', password });
  expect(form.status).toBe(415);
  const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
  for (const body of [`{"password":"${password}",`, `{"password":"${password}${'a'.repeat(5000)}"}`]) {
    const response = await request(app).post('/api/auth/admin-session').set('Host', '127.0.0.1:4000').set('Origin', origin)
      .type('json').send(body);
    expect([400, 413]).toContain(response.status);
    expect(response.text).not.toContain(password);
  }
  expect(logged).not.toHaveBeenCalled();
});

test('failures throttle without trusting a spoofed forwarded IP and become retryable after the window', async () => {
  for (let count = 0; count < 5; count += 1) {
    expect((await login({ username: 'admin', password: 'incorrect-passphrase' }).set('X-Forwarded-For', `192.0.2.${count}`)).status).toBe(401);
  }
  const throttled = await login();
  expect(throttled.status).toBe(429);
  expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 15 * 60 * 1000 + 1);
  expect((await login()).status).toBe(201);
});

test('logout revokes the selected session while others remain valid; cookies never authorize', async () => {
  const first = await login(), second = await login();
  expect(first.body.token).not.toBe(second.body.token);
  const revoked = await request(app).delete('/api/auth/admin-session').set('Host', '127.0.0.1:4000')
    .set('Authorization', `Bearer ${first.body.token}`);
  expect(revoked.status).toBe(204);
  expect((await business(first.body.token)).status).toBe(401);
  expect((await business(second.body.token)).status).toBe(200);
  expect((await request(app).get('/api/clients').set('Host', '127.0.0.1:4000').set('Cookie', `session=${second.body.token}`)).status).toBe(401);
  expect((await business(second.body.token).set('Origin', 'https://attacker.example')).status).toBe(403);
});

test('sessions expire at eight hours and cannot survive a server instance change', async () => {
  const entered = await login();
  const expiry = Date.parse(entered.body.expiresAt);
  const clock = jest.spyOn(Date, 'now').mockReturnValue(expiry - 1);
  expect((await business(entered.body.token)).status).toBe(200);
  clock.mockReturnValue(expiry);
  expect((await business(entered.body.token)).status).toBe(401);
  clock.mockRestore();
  const fresh = createApp({ env });
  expect((await request(fresh).get('/api/clients').set('Host', '127.0.0.1:4000').set('Authorization', `Bearer ${entered.body.token}`)).status).toBe(401);
});

test.each([
  ['missing credentials', { ABQ_ADMIN_CREDENTIAL_FILE: '/definitely-missing-admin-fixture.json' }],
  ['no origins', { APP_ORIGINS: '' }],
  ['insecure hosted origin', { APP_ORIGINS: 'http://builder.example.test' }],
  ['wildcard', { APP_ORIGINS: '*' }],
  ['origin path', { APP_ORIGINS: 'https://builder.example.test/path' }],
  ['unknown auth mode', { ABQ_AUTH_MODE: 'admn' }],
])('%s fails closed despite local development being enabled', async (_name, overrides) => {
  const target = createApp({ env: { ...env, ABQ_LOCAL_WORKSPACE: '1', NODE_ENV: 'development', HOST: '127.0.0.1', ...overrides } });
  expect((await request(target).get('/api/auth/config')).body.configured).toBe(false);
  expect((await login(undefined, target)).status).toBe(503);
  expect((await request(target).get('/api/clients')).status).toBe(503);
  expect((await request(target).get('/')).status).toBe(200);
});

test('world-readable, malformed and symlinked credential files are not configured', async () => {
  const unsafe = path.join(directory, 'unsafe.json');
  for (const situation of ['permissions', 'malformed', 'symlink']) {
    fs.rmSync(unsafe, { force: true });
    if (situation === 'symlink') fs.symlinkSync(credentialFile, unsafe);
    else fs.writeFileSync(unsafe, situation === 'malformed' ? '{private fixture' : fs.readFileSync(credentialFile), { mode: situation === 'permissions' ? 0o644 : 0o600 });
    const target = createApp({ env: { ...env, ABQ_ADMIN_CREDENTIAL_FILE: unsafe } });
    const config = await request(target).get('/api/auth/config');
    expect(config.body).toEqual({ mode: 'admin', configured: false, publishableKey: null });
    expect(config.text).not.toContain('private fixture');
    expect((await login(undefined, target)).status).toBe(503);
  }
});

test('hosted transport requires HTTPS and trusts only an explicitly configured local TLS proxy', async () => {
  const hostedEnv = { ...env, APP_ORIGINS: 'https://builder.example.test' };
  const send = target => request(target).post('/api/auth/admin-session')
    .set('Host', 'builder.example.test').set('Origin', 'https://builder.example.test').set('X-Forwarded-Proto', 'https')
    .send({ username: 'admin', password });
  expect((await send(createApp({ env: hostedEnv }))).status).toBe(403);
  const target = createApp({ env: { ...hostedEnv, ABQ_ADMIN_TRUST_PROXY: 'loopback' } });
  expect((await send(target)).status).toBe(201);
  expect((await send(target).set('X-Forwarded-Proto', 'http')).status).toBe(403);
  expect((await send(target).set('X-Forwarded-Proto', 'https,http')).status).toBe(403);
  expect((await send(target).set('Host', 'foreign.example.test').set('X-Forwarded-Host', 'builder.example.test')).status).toBe(403);
});

test('successful sign-ins are bounded to 64 live sessions', async () => {
  const first = await login();
  let last;
  for (let count = 0; count < 64; count += 1) {
    last = await login(); expect(last.status).toBe(201);
  }
  expect((await business(first.body.token)).status).toBe(401);
  expect((await business(last.body.token)).status).toBe(200);
}, 20000);

test('credential setup uses new private files without printing or overwriting password material', async () => {
  const { setupAdminAuth } = require('../scripts/setup-admin-auth');
  const { getAdminAuthStatus, createAdminCredential } = require('../src/adminAuth');
  const destination = path.join(directory, 'setup-auth.json'), handoffFile = path.join(directory, 'handoff.txt');
  await setupAdminAuth({ credentialFile: destination, handoffFile });
  expect(fs.statSync(destination).mode & 0o777).toBe(0o600);
  expect(fs.statSync(handoffFile).mode & 0o777).toBe(0o600);
  const handoff = fs.readFileSync(handoffFile, 'utf8');
  const generatedPassword = handoff.match(/^Password: (.+)$/m)[1];
  expect(fs.readFileSync(destination, 'utf8')).not.toContain(generatedPassword);
  const configured = { ...env, ABQ_ADMIN_CREDENTIAL_FILE: destination };
  expect(getAdminAuthStatus(configured)).toEqual({ mode: 'admin', configured: true });
  expect((await login({ username: 'admin', password: generatedPassword }, createApp({ env: configured }))).status).toBe(201);
  const before = fs.readFileSync(destination);
  await expect(setupAdminAuth({ password, credentialFile: destination })).rejects.toThrow(/never replaced/);
  expect(fs.readFileSync(destination)).toEqual(before);
  await expect(createAdminCredential('short')).rejects.toThrow(/12/);
});
