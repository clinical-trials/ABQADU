const { runDoctor, REQUIRED_TABLES } = require('../scripts/doctor');

function database({ missing = [], failure } = {}) {
  const statements = [];
  const client = {
    query: jest.fn(async (sql, values) => {
      statements.push(sql);
      if (sql.startsWith('SELECT')) {
        return { rows: values[0].map(name => ({ table_name: name, present: !missing.includes(name) })) };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  const pool = {
    connect: jest.fn(async () => {
      if (failure) throw failure;
      return client;
    }),
    end: jest.fn(async () => {}),
  };
  return { pool, client, statements };
}

function output() {
  const lines = [];
  return { lines, log: message => lines.push(message) };
}

test('healthy database returns success after a read-only required-table check', async () => {
  const db = database();
  const report = output();
  expect(await runDoctor({ pool: db.pool, log: report.log })).toBe(0);
  expect(report.lines.join('\n')).toMatch(/22 required tables/i);
  expect(report.lines.join('\n')).toMatch(/Command Center.*separate/i);
  expect(db.statements[0]).toBe('BEGIN READ ONLY');
  expect(db.statements.at(-1)).toBe('ROLLBACK');
  expect(db.statements.some(sql => /\b(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\b/i.test(sql))).toBe(false);
  expect(db.client.release).toHaveBeenCalledTimes(1);
  expect(db.pool.end).toHaveBeenCalledTimes(1);
  expect(REQUIRED_TABLES).toEqual(expect.arrayContaining(['projects', 'clients', 'invoices', 'design_templates', 'invoice_engine_events']));
});

test('missing tables return failure with safe fresh-database and existing-database instructions', async () => {
  const db = database({ missing: ['clients', 'invoices'] });
  const report = output();
  expect(await runDoctor({ pool: db.pool, log: report.log })).toBe(1);
  const text = report.lines.join('\n');
  expect(text).toMatch(/clients, invoices/);
  expect(text).toMatch(/fresh.*npm run migrate.*once/i);
  expect(text).toMatch(/existing.*back.*up/i);
  expect(text).toMatch(/duplicate.*layout/i);
});

test.each([
  ['3D000', /createdb abqadu/],
  ['ECONNREFUSED', /PostgreSQL.*running/i],
  ['28P01', /credentials/i],
  ['42501', /permission/i],
  ['ETIMEDOUT', /network|running/i],
  ['UNKNOWN', /DATABASE_URL/],
])('database error %s returns actionable guidance without printing credentials', async (code, guidance) => {
  const db = database({ failure: Object.assign(new Error('postgres://user:private-password@secret-host/database'), { code }) });
  const report = output();
  expect(await runDoctor({ pool: db.pool, log: report.log })).toBe(1);
  const text = report.lines.join('\n');
  expect(text).toMatch(guidance);
  expect(text).not.toMatch(/private-password|secret-host|postgres:\/\//);
  expect(db.pool.end).toHaveBeenCalledTimes(1);
});

test('schema query failure closes the connection and returns failure without raw error details', async () => {
  const db = database();
  db.client.query.mockRejectedValueOnce(Object.assign(new Error('private query detail'), { code: '42501' }));
  const report = output();
  expect(await runDoctor({ pool: db.pool, log: report.log })).toBe(1);
  expect(report.lines.join('\n')).not.toMatch(/private query detail/);
  expect(db.client.release).toHaveBeenCalledTimes(1);
  expect(db.pool.end).toHaveBeenCalledTimes(1);
});
