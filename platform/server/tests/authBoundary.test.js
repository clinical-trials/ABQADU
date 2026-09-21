const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');

jest.mock('../src/db', () => ({ pool: { query: jest.fn(async () => ({ rows: [] })) } }));
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));

const fixture = createAuthFixture();
Object.assign(process.env, fixture.env);
const app = require('../src/index');

const businessPaths = [
  'projects', 'wbs', 'activities', 'dependencies', 'calendars', 'baselines',
  'resources', 'assignments', 'schedule', 'field-tasks', 'risks', 'comments',
  'portfolio', 'reports', 'claude', 'designs', 'claude-design', 'clients',
  'bids', 'invoices', 'invoice-engine', 'command-center', 'integrations', 'weather', 'billing',
];

test.each(businessPaths)('anonymous reads and writes under /api/%s cannot reach business handlers', async path => {
  for (const method of ['get', 'post', 'put', 'delete']) {
    const response = await request(app)[method](`/api/${path}/__auth_boundary_probe__`);
    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toMatch(/application\/json/);
  }
});

test('a signed allowlisted session reaches business data and the verified session endpoint', async () => {
  const bearer = `Bearer ${fixture.token()}`;
  const response = await request(app).get('/api/clients').set('Authorization', bearer);
  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
  const session = await request(app).get('/api/auth/session').set('Authorization', bearer);
  expect(session.status).toBe(200);
  expect(session.body).toEqual({ userId: 'user_allowed' });
});

test.each([
  ['malformed', () => 'not-a-token'],
  ['forged', () => createAuthFixture().token()],
  ['expired', () => fixture.token({ exp: Math.floor(Date.now() / 1000) - 60 })],
  ['future', () => fixture.token({ nbf: Math.floor(Date.now() / 1000) + 60 })],
  ['wrong authorized party', () => fixture.token({ azp: 'https://attacker.example' })],
  ['missing authorized party', () => fixture.token({ azp: undefined })],
  ['wrong issuer', () => fixture.token({ iss: 'https://other.clerk.accounts.dev' })],
  ['missing session', () => fixture.token({ sid: undefined })],
  ['machine token', () => fixture.token({}, { cat: 'm2m_token' })],
])('%s tokens cannot access private client records', async (_name, token) => {
  const response = await request(app).get('/api/clients').set('Authorization', `Bearer ${token()}`);
  expect(response.status).toBe(401);
  expect(response.body.error).toEqual(expect.any(String));
  expect(response.body).not.toHaveProperty('details');
});

test('a signed non-staff account is denied without returning private records', async () => {
  const response = await request(app).get('/api/clients').set('Authorization', `Bearer ${fixture.token({ sub: 'user_outsider' })}`);
  expect(response.status).toBe(403);
});

test('cookie-only authentication is refused and a valid token cannot override an untrusted Origin', async () => {
  const token = fixture.token();
  const cookieOnly = await request(app).get('/api/clients').set('Cookie', `__session=${token}`);
  expect(cookieOnly.status).toBe(401);
  const crossOrigin = await request(app).get('/api/clients').set('Authorization', `Bearer ${token}`).set('Origin', 'https://attacker.example');
  expect(crossOrigin.status).toBe(403);
  expect(crossOrigin.headers['access-control-allow-origin']).toBeUndefined();
});

test('public configuration reveals only the publishable key while health stays public', async () => {
  const response = await request(app).get('/api/auth/config');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ configured: true, publishableKey: fixture.env.CLERK_PUBLISHABLE_KEY });
  expect(response.headers['cache-control']).toContain('no-store');
  const health = await request(app).get('/health');
  expect(health.status).toBe(200);
});

test.each([
  ['missing keys', {}],
  ['missing allowlist', { ...fixture.env, CLERK_ALLOWED_USER_IDS: '' }],
  ['wildcard allowlist', { ...fixture.env, CLERK_ALLOWED_USER_IDS: '*' }],
  ['missing origins', { ...fixture.env, APP_ORIGINS: '' }],
  ['wildcard origin', { ...fixture.env, APP_ORIGINS: '*' }],
  ['unencrypted remote origin', { ...fixture.env, APP_ORIGINS: 'http://builder.example.test' }],
  ['origin with path', { ...fixture.env, APP_ORIGINS: 'https://builder.example.test/path' }],
  ['invalid publishable key', { ...fixture.env, CLERK_PUBLISHABLE_KEY: 'pk_test_invalid' }],
  ['missing secret', { ...fixture.env, CLERK_SECRET_KEY: '' }],
  ['mixed live and test keys', { ...fixture.env, CLERK_SECRET_KEY: 'sk_live_wrong_instance' }],
  ['invalid public PEM', { ...fixture.env, CLERK_JWT_KEY: 'not a PEM' }],
])('%s locks the API while leaving setup and health available', async (_name, env) => {
  const lockedApp = app.createApp({ env });
  const response = await request(lockedApp).get('/api/clients').set('Authorization', `Bearer ${fixture.token()}`);
  expect(response.status).toBe(503);
  const config = await request(lockedApp).get('/api/auth/config');
  expect(config.status).toBe(200);
  expect(config.body).toEqual({ configured: false, publishableKey: null });
  expect((await request(lockedApp).get('/health')).status).toBe(200);
});

test('CORS preflight allows only configured browser origins and never returns business data', async () => {
  const allowed = await request(app).options('/api/clients').set('Origin', fixture.origin)
    .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'Authorization,Content-Type');
  expect(allowed.status).toBe(204);
  expect(allowed.headers['access-control-allow-origin']).toBe(fixture.origin);
  const denied = await request(app).options('/api/clients').set('Origin', 'https://attacker.example')
    .set('Access-Control-Request-Method', 'POST');
  expect(denied.status).toBe(403);
});

test('integration auth status reports the verified identity without decoding arbitrary claims', async () => {
  const response = await request(app).get('/api/integrations/clerk/status')
    .set('Authorization', `Bearer ${fixture.token()}`);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ authenticated: true, subject: 'user_allowed' });
  expect(response.body).not.toHaveProperty('token_shape_valid');
});

test('the signed Stripe webhook uses the original bytes and stays available without Clerk configuration', async () => {
  const Stripe = require('stripe');
  Object.assign(process.env, {
    STRIPE_SECRET_KEY: 'sk_test_local_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_local_fixture',
    STRIPE_MODE: 'test', STRIPE_SUCCESS_URL: 'https://builder.example.test/invoices',
    STRIPE_CANCEL_URL: 'https://builder.example.test/invoices',
  });
  const lockedApp = app.createApp({ env: {} });
  const payload = '{\n  "id": "evt_ignored", "type": "test.unknown", "livemode": false, "data": { "object": {} }\n}';
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_local_fixture' });
  const accepted = await request(lockedApp).post('/api/billing/stripe/webhook')
    .set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(payload);
  expect(accepted.status).toBe(200);
  expect(accepted.body).toEqual({ received: true, ignored: true });
  const rejected = await request(lockedApp).post('/api/billing/stripe/webhook')
    .set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(payload.replace('evt_ignored', 'evt_forged'));
  expect(rejected.status).toBe(400);
  const privateRoute = await request(lockedApp).post('/api/billing/invoices/1/checkout');
  expect(privateRoute.status).toBe(503);
});
