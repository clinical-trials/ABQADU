const express = require('express');
const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');
const { createWorkspaceAuth } = require('../src/auth');
const { calculateCashScenario } = require('../src/services/cashScenario');
const { createExecutiveRouter } = require('../src/routes/executive');

jest.mock('../src/services/cfoBriefing', () => ({
  createCfoBriefingService: jest.fn(() => async () => ({ headline: 'Default company report' })),
}));

const input = { opening_cash: '1000.00', weekly_inflow: '100.00', weekly_outflow: '75.00', collection_delay_weeks: 2 };
const now = new Date('2026-10-01T00:30:00Z');
async function invoke(path, { getBriefing = async () => ({ headline: 'Review receivables' }), scenario = body => calculateCashScenario(body, { now }) } = {}, body = input) {
  const router = createExecutiveRouter({ getBriefing, scenario });
  const handler = router.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
  const res = { set: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  await handler({ body }, res, error => { throw error; });
  return res;
}

test('GET returns the company report without passing caller-supplied financial data', async () => {
  const getBriefing = jest.fn(async () => ({ generated_at: now.toISOString(), headline: 'Review receivables' }));
  const scenario = jest.fn();
  const res = await invoke('/cfo/briefing', { getBriefing, scenario });
  expect(getBriefing).toHaveBeenCalledWith();
  expect(scenario).not.toHaveBeenCalled();
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  expect(res.json).toHaveBeenCalledWith({ generated_at: now.toISOString(), headline: 'Review receivables' });
});

test('POST returns a temporary calculation without reading company records', async () => {
  const getBriefing = jest.fn();
  const res = await invoke('/cfo/cash-scenario', { getBriefing });
  expect(getBriefing).not.toHaveBeenCalled();
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  expect(res.json).toHaveBeenCalledWith(calculateCashScenario(input, { now }));
});

test('controlled invalid cash assumptions return a helpful 400', async () => {
  const res = await invoke('/cfo/cash-scenario', {}, { ...input, weekly_inflow: null });
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0].error).toMatch(/Weekly inflow/);
});

test.each(['/cfo/briefing', '/cfo/cash-scenario'])('%s sanitizes unexpected errors even when they carry a status', async path => {
  const fail = async () => { throw Object.assign(new Error('Private database password and connection details'), { status: 400 }); };
  const res = await invoke(path, { getBriefing: fail, scenario: fail });
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json.mock.calls[0][0].error).toMatch(/temporarily unavailable/i);
  expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/password|connection details/i);
});

test('the default factory wires the CFO service with the environment', () => {
  const env = { FIXTURE: 'only' };
  const factory = require('../src/services/cfoBriefing').createCfoBriefingService;
  createExecutiveRouter({ env });
  expect(factory).toHaveBeenCalledWith({ env });
});

describe('executive routes behind the actual private workspace gate', () => {
  const fixture = createAuthFixture();
  let app, getBriefing, scenario;
  beforeEach(() => {
    const auth = createWorkspaceAuth(fixture.env);
    getBriefing = jest.fn(async () => ({ headline: 'Private finance report' }));
    scenario = jest.fn(body => calculateCashScenario(body, { now }));
    app = express();
    app.use('/api', auth.checkOrigin, auth.requireSession, express.json());
    app.use('/api/executive', createExecutiveRouter({ getBriefing, scenario }));
  });

  test.each([
    ['get', '/cfo/briefing'], ['post', '/cfo/cash-scenario'],
  ])('%s %s rejects anonymous, unapproved, expired and foreign-origin requests before either service', async (method, path) => {
    const url = `/api/executive${path}`;
    expect((await request(app)[method](url).send(input)).status).toBe(401);
    expect((await request(app)[method](url).set('Authorization', `Bearer ${fixture.token({ sub: 'user_outsider' })}`).send(input)).status).toBe(403);
    expect((await request(app)[method](url).set('Authorization', `Bearer ${fixture.token({ exp: Math.floor(Date.now() / 1000) - 60 })}`).send(input)).status).toBe(401);
    expect((await request(app)[method](url).set('Authorization', `Bearer ${fixture.token()}`).set('Origin', 'https://foreign.example').send(input)).status).toBe(403);
    expect(getBriefing).not.toHaveBeenCalled();
    expect(scenario).not.toHaveBeenCalled();
  });

  test('an allowed session can read and calculate without enabling any mutation endpoint', async () => {
    const bearer = `Bearer ${fixture.token()}`;
    const report = await request(app).get('/api/executive/cfo/briefing').set('Authorization', bearer);
    expect(report.status).toBe(200);
    expect(report.body).toEqual({ headline: 'Private finance report' });
    const projection = await request(app).post('/api/executive/cfo/cash-scenario').set('Authorization', bearer).send(input);
    expect(projection.status).toBe(200);
    expect(projection.body.weeks).toHaveLength(13);
    expect(projection.headers['cache-control']).toBe('private, no-store');
    expect((await request(app).put('/api/executive/cfo/briefing').set('Authorization', bearer).send(input)).status).toBe(404);
    expect((await request(app).delete('/api/executive/cfo/cash-scenario').set('Authorization', bearer)).status).toBe(404);
    expect(getBriefing).toHaveBeenCalledTimes(1);
    expect(scenario).toHaveBeenCalledTimes(1);
  });
});
