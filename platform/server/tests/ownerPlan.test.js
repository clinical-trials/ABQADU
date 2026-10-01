const express = require('express');
const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');
const { createWorkspaceAuth } = require('../src/auth');
const { createExecutiveRouter } = require('../src/routes/executive');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createOwnerPlanService, normalizeOwnerPlan, formatOwnerPlan } = require('../src/services/ownerPlan');

const hostedEnv = { CLERK_ALLOWED_USER_IDS: 'user_owner,user_staff', EXECUTIVE_OWNER_USER_IDS: 'user_owner' };
const owner = { userId: 'user_owner', sessionId: 'session_fixture' };
const localEnv = { ABQ_LOCAL_WORKSPACE: '1', NODE_ENV: 'development', HOST: '127.0.0.1' };
const localOwner = { userId: 'local-owner', sessionId: 'session_local_fixture' };
const goal = (overrides = {}) => ({
  id: 'annual-target', kind: 'annual_income', title: 'Fictional annual target', target_amount_cents: 1234500,
  reported_balance_cents: null, reported_balance_as_of: null, basis: 'unconfirmed', target_date: null,
  status: 'planned', next_step: 'Select the financial basis.', notes: '', ...overrides,
});
const planFixture = () => ({
  version: 1, updated_at: '2026-10-01T12:00:00.000Z', currency: 'USD', vision: 'A fictional private planning fixture.',
  goals: [goal(), goal({ id: 'debt', kind: 'debt_payoff', title: 'Fictional reported obligation', target_amount_cents: null,
    reported_balance_cents: 678900, reported_balance_as_of: '2026-09-30', next_step: 'Check the next statement.' }),
  goal({ id: 'land', kind: 'property', title: 'Future property', target_amount_cents: null, next_step: '' }),
  goal({ id: 'home', kind: 'home', title: 'Future home', target_amount_cents: null, next_step: '' })],
  weekly_review: ['Review one practical next step.'],
});

test('the designated hosted owner can read the separate private plan through the verified workspace gate', async () => {
  const fixture = createAuthFixture();
  const env = { ...fixture.env, EXECUTIVE_OWNER_USER_IDS: 'user_allowed' };
  const auth = createWorkspaceAuth(env);
  const app = express();
  app.use('/api', auth.checkOrigin, auth.requireSession);
  app.use('/api/executive', createExecutiveRouter({
    env, getBriefing: async () => ({ headline: 'Company only' }),
    ownerPlanService: { getReport: async () => ({ version: 1, vision: 'Fictional private plan' }) },
  }));
  const response = await request(app).get('/api/executive/owner-plan')
    .set('Authorization', `Bearer ${fixture.token()}`);
  expect(response.status).toBe(200);
  expect(response.body.vision).toBe('Fictional private plan');
  expect(response.headers['cache-control']).toBe('private, no-store');
});

describe('private source isolation', () => {
  let directory, filePath;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'owner-plan-test-'));
    filePath = path.join(directory, 'plan.json');
  });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  test('reads only the separate supplied file and leaves bytes and directory unchanged', async () => {
    const raw = JSON.stringify(planFixture());
    await fs.writeFile(filePath, raw, { mode: 0o600 });
    const before = await fs.stat(filePath);
    const service = createOwnerPlanService({ env: { ...hostedEnv, EXECUTIVE_OWNER_PLAN_PATH: filePath } });
    const report = await service.getReport(owner);
    expect(report.goals[0]).toMatchObject({ target_amount_cents: 1234500, basis: 'unconfirmed', target_date: null });
    expect(report.goals[2].target_amount_cents).toBeNull();
    expect(report.plan_text).toContain('$12,345.00');
    expect(report.plan_text).toContain('$6,789.00');
    expect(report.plan_text).toMatch(/basis: Not selected/);
    expect(report.plan_text).toMatch(/not verified bank balances/i);
    expect(report.plan_text).toMatch(/Target date: Not specified/);
    expect(report).not.toHaveProperty('progress_pct');
    expect(await fs.readFile(filePath, 'utf8')).toBe(raw);
    expect((await fs.stat(filePath)).mtimeMs).toBe(before.mtimeMs);
    expect(await fs.readdir(directory)).toEqual(['plan.json']);
  });

  test('missing source is concealed and is never initialized with starter records', async () => {
    const service = createOwnerPlanService({ env: { ...hostedEnv, EXECUTIVE_OWNER_PLAN_PATH: filePath } });
    await expect(service.getReport(owner)).rejects.toMatchObject({ status: 404, message: 'Owner plan is not available.' });
    expect(await fs.readdir(directory)).toEqual([]);
  });

  test('corrupt and oversized files remain unchanged and their content is absent from errors', async () => {
    for (const raw of ['{"secret_fixture": "DO_NOT_ECHO",', 'x'.repeat(128 * 1024 + 1)]) {
      await fs.writeFile(filePath, raw);
      const service = createOwnerPlanService({ env: { ...hostedEnv, EXECUTIVE_OWNER_PLAN_PATH: filePath } });
      await expect(service.getReport(owner)).rejects.toMatchObject({ status: 503, message: 'The owner plan is temporarily unavailable. Please try again.' });
      expect(await fs.readFile(filePath, 'utf8')).toBe(raw);
    }
  });
});

describe('owner authorization before source access', () => {
  test.each([
    ['no session', undefined, hostedEnv],
    ['missing verified session identifier', { userId: 'user_owner' }, hostedEnv],
    ['ordinary approved staff', { userId: 'user_staff', sessionId: 'session_staff' }, hostedEnv],
    ['no owner policy', owner, { CLERK_ALLOWED_USER_IDS: 'user_owner' }],
    ['owner not in staff policy', owner, { CLERK_ALLOWED_USER_IDS: 'user_staff', EXECUTIVE_OWNER_USER_IDS: 'user_owner' }],
    ['partly invalid owner policy', owner, { ...hostedEnv, EXECUTIVE_OWNER_USER_IDS: 'user_owner,user_outside' }],
    ['wildcard policy', owner, { ...hostedEnv, EXECUTIVE_OWNER_USER_IDS: '*' }],
    ['local identity outside local mode', localOwner, hostedEnv],
    ['local production', localOwner, { ...localEnv, NODE_ENV: 'production' }],
    ['nonloopback binding', localOwner, { ...localEnv, HOST: '0.0.0.0' }],
    ['hosted identity inside local mode', owner, localEnv],
  ])('%s cannot read or parse private bytes', async (_name, auth, env) => {
    const readFile = jest.fn(async () => { throw new Error('Source must not be read'); });
    await expect(createOwnerPlanService({ env, readFile }).getReport(auth)).rejects.toMatchObject({ status: 404 });
    expect(readFile).not.toHaveBeenCalled();
  });

  test('the verified local-owner can read in explicit development loopback mode', async () => {
    const report = await createOwnerPlanService({ env: localEnv, readFile: async () => JSON.stringify(planFixture()) }).getReport(localOwner);
    expect(report.goals[1].reported_balance_cents).toBe(678900);
  });

  test('explicit admin owner access takes precedence over development flags and requires trusted auth mode', async () => {
    const env = { ...localEnv, ...hostedEnv, ABQ_AUTH_MODE: 'admin' };
    const readFile = jest.fn(async () => JSON.stringify(planFixture()));
    const service = createOwnerPlanService({ env, readFile });
    for (const identity of [localOwner, owner, { userId: 'admin-owner', sessionId: 'test' }, { userId: 'other', sessionId: 'test', mode: 'admin' }]) {
      await expect(service.getReport(identity)).rejects.toMatchObject({ status: 404 });
    }
    expect(readFile).not.toHaveBeenCalled();
    const report = await service.getReport({ userId: 'admin-owner', sessionId: 'verified-session', mode: 'admin' });
    expect(report.goals[0].title).toBe('Fictional annual target');
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  test('filesystem exceptions are sanitized and slow reads cannot publish a late result', async () => {
    const service = createOwnerPlanService({ env: hostedEnv, readFile: async () => { throw new Error('secret fixture path and contents'); } });
    await expect(service.getReport(owner)).rejects.toMatchObject({ status: 503, message: 'The owner plan is temporarily unavailable. Please try again.' });
    let finish;
    const slow = createOwnerPlanService({ env: hostedEnv, readTimeoutMs: 5, readFile: () => new Promise(resolve => { finish = resolve; }) });
    await expect(slow.getReport(owner)).rejects.toMatchObject({ status: 503 });
    finish(JSON.stringify(planFixture()));
  });
});

describe('validated plans and unknown financial inputs', () => {
  test.each([
    ['unsupported schema', plan => { plan.version = 2; }],
    ['extra root field', plan => { plan.bank_token = 'fictional'; }],
    ['extra goal field', plan => { plan.goals[0].income_actual = 1; }],
    ['missing field', plan => { delete plan.goals[0].notes; }],
    ['numeric strings', plan => { plan.goals[0].target_amount_cents = '123'; }],
    ['fractional cents', plan => { plan.goals[0].target_amount_cents = 1.5; }],
    ['negative amount', plan => { plan.goals[0].target_amount_cents = -1; }],
    ['unsafe amount', plan => { plan.goals[0].target_amount_cents = Number.MAX_SAFE_INTEGER + 1; }],
    ['invalid calendar date', plan => { plan.goals[0].target_date = '2027-02-29'; }],
    ['invalid update timestamp', plan => { plan.updated_at = '2026-02-30T12:00:00.000Z'; }],
    ['year zero', plan => { plan.goals[0].target_date = '0000-01-01'; }],
    ['duplicate IDs', plan => { plan.goals[1].id = plan.goals[0].id; }],
    ['unexpected kind', plan => { plan.goals[0].kind = 'bank_account'; }],
    ['unrecognized basis', plan => { plan.goals[0].basis = 'cash'; }],
    ['basis on nonannual goal', plan => { plan.goals[1].basis = 'revenue'; }],
    ['balance on a nondebt goal', plan => { plan.goals[0].reported_balance_cents = 100; }],
    ['date without reported balance', plan => { plan.goals[1].reported_balance_cents = null; }],
    ['unexpected status', plan => { plan.goals[0].status = 'paid'; }],
    ['control characters', plan => { plan.vision = 'do not\u0000persist'; }],
    ['oversized notes', plan => { plan.goals[0].notes = 'x'.repeat(2001); }],
    ['too many goals', plan => { plan.goals = Array.from({ length: 21 }, (_, index) => goal({ id: `goal-${index}` })); }],
    ['too many reviews', plan => { plan.weekly_review = Array(21).fill('Review'); }],
  ])('rejects %s without echoing the source', (_name, mutate) => {
    const plan = planFixture();
    mutate(plan);
    expect(() => normalizeOwnerPlan(plan)).toThrow('The owner plan is temporarily unavailable. Please try again.');
  });

  test('supports partial plans and distinguishes zero, unspecified and exact large cents', () => {
    const plan = planFixture();
    plan.goals = [goal({ target_amount_cents: 0 }), goal({ id: 'other', target_amount_cents: Number.MAX_SAFE_INTEGER }),
      goal({ id: 'unknown', target_amount_cents: null })];
    const normalized = normalizeOwnerPlan(plan);
    const output = formatOwnerPlan(normalized);
    expect(output).toContain('Annual target: $0.00');
    expect(output).toContain('Annual target: $90,071,992,547,409.91');
    expect(output).toContain('Annual target: Not specified');
    expect(normalizeOwnerPlan({ ...plan, goals: [], weekly_review: [] }).goals).toEqual([]);
    expect(plan.goals[2].target_amount_cents).toBeNull();
  });

  test('labels a debt payoff target as the desired balance, distinct from the reported debt', () => {
    const plan = planFixture();
    plan.goals[1].target_amount_cents = 0;
    const output = formatOwnerPlan(normalizeOwnerPlan(plan));
    expect(output).toContain('Target balance: $0.00');
    expect(output).toContain('Reported balance: $6,789.00');
  });
});

describe('verified HTTP owner boundary and shared report isolation', () => {
  const fixture = createAuthFixture();
  let app, readFile;
  beforeEach(() => {
    const env = { ...fixture.env, CLERK_ALLOWED_USER_IDS: 'user_allowed,user_staff', EXECUTIVE_OWNER_USER_IDS: 'user_allowed' };
    readFile = jest.fn(async () => JSON.stringify(planFixture()));
    const auth = createWorkspaceAuth(env);
    app = express();
    app.use('/api', auth.checkOrigin, auth.requireSession);
    app.use('/api/executive', createExecutiveRouter({ env, ownerPlanService: createOwnerPlanService({ env, readFile }),
      getBriefing: async () => ({ headline: 'Company only' }) }));
  });

  test('approved non-owner staff get concealed404 before reading while their company access remains available', async () => {
    const bearer = `Bearer ${fixture.token({ sub: 'user_staff' })}`;
    const denied = await request(app).get('/api/executive/owner-plan').set('Authorization', bearer);
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual({ error: 'Owner plan is not available.' });
    expect(denied.headers['cache-control']).toBe('private, no-store');
    expect(readFile).not.toHaveBeenCalled();
    const shared = await request(app).get('/api/executive/cfo/briefing').set('Authorization', bearer);
    expect(shared.status).toBe(200);
    expect(shared.body).toEqual({ headline: 'Company only' });
    expect(readFile).not.toHaveBeenCalled();
  });

  test('anonymous, unapproved, expired and foreign-origin requests never reach the private source', async () => {
    expect((await request(app).get('/api/executive/owner-plan')).status).toBe(401);
    expect((await request(app).get('/api/executive/owner-plan').set('Authorization', `Bearer ${fixture.token({ sub: 'user_outside' })}`)).status).toBe(403);
    expect((await request(app).get('/api/executive/owner-plan').set('Authorization', `Bearer ${fixture.token({ exp: Math.floor(Date.now() / 1000) - 60 })}`)).status).toBe(401);
    expect((await request(app).get('/api/executive/owner-plan').set('Authorization', `Bearer ${fixture.token()}`).set('Origin', 'https://foreign.example')).status).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
  });

  test('no write/delete endpoint exists and unexpected service errors never reach generic logging', async () => {
    const bearer = `Bearer ${fixture.token()}`;
    for (const method of ['put', 'post', 'delete']) {
      expect((await request(app)[method]('/api/executive/owner-plan').set('Authorization', bearer).send({})).status).toBe(404);
    }
    expect(readFile).not.toHaveBeenCalled();
    readFile.mockRejectedValue(new Error('DO_NOT_LOG private fixture'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failed = await request(app).get('/api/executive/owner-plan').set('Authorization', bearer);
      expect(failed.status).toBe(503);
      expect(failed.body.error).toBe('The owner plan is temporarily unavailable. Please try again.');
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
