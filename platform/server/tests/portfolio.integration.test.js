const crypto = require('node:crypto');
const { Pool } = require('pg');

// Opt-in integration test: every fixture lives in a random schema with no
// public-schema fallback. Application records and migrations are never touched.
const database = process.env.PORTFOLIO_TEST_DATABASE_URL || process.env.BILLING_TEST_DATABASE_URL;
(database ? describe : describe.skip)('portfolio aggregation with PostgreSQL', () => {
  const schema = `portfolio_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  let admin, pool, router, schemaCreated = false;
  beforeAll(async () => {
    admin = new Pool({ connectionString: database, connectionTimeoutMillis: 3000 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    pool = new Pool({ connectionString: database, options: `-c search_path=${schema}`, connectionTimeoutMillis: 3000 });
    await pool.query(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, start_date DATE, status TEXT);
      CREATE TABLE activities (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, planned_start DATE,
        planned_finish DATE, actual_finish DATE, pct_complete NUMERIC, is_critical BOOLEAN, total_float INTEGER, sort_order INTEGER);
      CREATE TABLE risks (id INTEGER PRIMARY KEY, project_id INTEGER, title TEXT, status TEXT, probability INTEGER, impact INTEGER, risk_score INTEGER);
      INSERT INTO projects VALUES
        (1, 'Two activities and three risks', CURRENT_DATE, 'active'),
        (2, 'Empty project', CURRENT_DATE, 'active'),
        (3, 'Risks only', CURRENT_DATE, 'active'),
        (4, 'Archived project', CURRENT_DATE, 'archived'),
        (5, 'Past finish below threshold', CURRENT_DATE - 3, 'active');
      INSERT INTO activities VALUES
        (1, 1, 'Critical activity', CURRENT_DATE - 2, CURRENT_DATE - 1, NULL, 20, TRUE, 0, 1),
        (2, 1, 'Finished activity', CURRENT_DATE - 2, CURRENT_DATE + 2, CURRENT_DATE, 100, FALSE, 2, 2),
        (3, 5, 'Nearly complete activity', CURRENT_DATE - 3, CURRENT_DATE - 1, NULL, 94.96, FALSE, 1, 1);
      INSERT INTO risks VALUES
        (1, 1, 'First open risk', 'open', 4, 5, 20),
        (2, 1, 'Second open risk', 'open', 3, 5, 15),
        (3, 1, 'Third open risk', 'open', 5, 5, 25),
        (4, 3, 'Risk without activities', 'open', 4, 5, 20),
        (5, 3, 'Closed risk', 'closed', 5, 5, 25);
    `);
    jest.resetModules();
    jest.doMock('../src/db', () => ({ pool }));
    router = require('../src/routes/portfolio');
  });
  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) {
      try { if (schemaCreated) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
      finally { await admin.end(); }
    }
    jest.dontMock('../src/db');
  });
  async function invoke(path = '/', params = {}) {
    const handler = router.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
    const res = { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
    let error;
    await handler({ params }, res, failure => { error = failure; });
    if (error) throw error;
    return { payload: res.json.mock.calls[0][0], status: res.status.mock.calls[0]?.[0] || 200 };
  }

  test('multiple risks cannot multiply activity, critical, completion or risk counts', async () => {
    const { payload } = await invoke();
    const project = payload.find(row => row.id === 1);
    expect(Number(project.total_activities)).toBe(2);
    expect(Number(project.complete_activities)).toBe(1);
    expect(Number(project.critical_count)).toBe(1);
    expect(Number(project.high_risks)).toBe(3);
    expect(Number(project.pct_complete)).toBe(60);
    expect(project.health).toBe('at_risk');
  });

  test('empty projects and risks without activities retain accurate zero counts and unknown progress', async () => {
    const { payload } = await invoke();
    const empty = payload.find(row => row.id === 2), risksOnly = payload.find(row => row.id === 3);
    expect([empty.total_activities, empty.complete_activities, empty.critical_count, empty.high_risks].map(Number)).toEqual([0, 0, 0, 0]);
    expect(empty.pct_complete).toBeNull();
    expect(Number(risksOnly.total_activities)).toBe(0);
    expect(Number(risksOnly.high_risks)).toBe(1);
    expect(risksOnly.pct_complete).toBeNull();
  });

  test('inactive projects stay out of the active list but remain available by exact ID', async () => {
    const list = await invoke();
    expect(list.payload.some(row => row.id === 4)).toBe(false);
    expect((await invoke('/:projectId', { projectId: '4' })).payload).toMatchObject({ project: { id: 4, status: 'archived' }, activities: [], top_risks: [] });
    expect((await invoke('/:projectId', { projectId: '99' })).status).toBe(404);
  });

  test('display rounding does not change the existing completion threshold for delayed health', async () => {
    const { payload } = await invoke();
    const project = payload.find(row => row.id === 5);
    expect(Number(project.pct_complete)).toBe(95);
    expect(project.health).toBe('delayed');
  });
});
