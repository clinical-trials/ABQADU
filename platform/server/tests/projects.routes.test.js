const request = require('supertest');
const { createAuthFixture } = require('./helpers/authFixture');
process.env.CLERK_TELEMETRY_DISABLED = '1';

jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
// This unrelated design-route module uses ESM syntax that Jest's CommonJS
// runtime cannot parse; project and fallback requests never call it.
jest.mock('../src/services/bomGenerator', () => ({ generateBOM: jest.fn() }));

const { pool } = require('../src/db');
const fixture = createAuthFixture();
const app = require('../src/index').createApp({ env: fixture.env });
const agent = request.agent(app).set('Authorization', `Bearer ${fixture.token()}`);

beforeEach(() => pool.query.mockReset());

test('creates a project with trimmed input and returns its database identity', async () => {
  const project = {
    id: 42,
    name: 'Maple ADU',
    description: 'Detached guest house',
    start_date: '2026-10-01',
    status: 'active',
    created_at: '2026-09-16T12:00:00.000Z',
  };
  pool.query.mockResolvedValue({ rows: [project] });

  const response = await agent.post('/api/projects').send({
    name: '  Maple ADU  ',
    description: '  Detached guest house  ',
    start_date: '2026-10-01',
  });

  expect(response.status).toBe(201);
  expect(response.body).toEqual(project);
  expect(pool.query).toHaveBeenCalledWith(
    expect.stringMatching(/INSERT INTO projects[\s\S]*RETURNING \*/),
    ['Maple ADU', 'Detached guest house', '2026-10-01']
  );
});

test('accepts a 200-character name and keeps omitted optional fields null', async () => {
  const name = 'a'.repeat(200);
  pool.query.mockResolvedValue({ rows: [{ id: 43, name, description: null, start_date: null, status: 'active' }] });

  const response = await agent.post('/api/projects').send({ name });

  expect(response.status).toBe(201);
  expect(response.body.id).toBe(43);
  expect(pool.query).toHaveBeenCalledWith(expect.any(String), [name, null, null]);
});

test.each([undefined, null, '', '   ', 'a'.repeat(201), 12, {}, []])(
  'rejects invalid project name %j without writing a project', async name => {
    const response = await agent.post('/api/projects').send({ name });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/name/i);
    expect(pool.query).not.toHaveBeenCalled();
  }
);

test.each(['2026-02-30', '2026-13-01', '09/16/2026', '0000-01-01', 42])(
  'rejects invalid start date %j without writing a project', async start_date => {
    const response = await agent.post('/api/projects').send({ name: 'Maple ADU', start_date });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/start_date/i);
    expect(pool.query).not.toHaveBeenCalled();
  }
);

test('rejects an object description instead of serializing it into the database', async () => {
  const response = await agent.post('/api/projects').send({ name: 'Maple ADU', description: {} });

  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/description/i);
  expect(pool.query).not.toHaveBeenCalled();
});

test('unknown API paths return JSON 404 while health remains available', async () => {
  const response = await agent.get('/api/no-such-endpoint');

  expect(response.status).toBe(404);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.body).toEqual({ error: 'API endpoint not found' });
  const health = await request(app).get('/health');
  expect(health.status).toBe(200);
  expect(health.body).toEqual({ ok: true });
});
