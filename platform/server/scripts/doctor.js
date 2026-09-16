const path = require('node:path');

const REQUIRED_TABLES = [
  'projects', 'calendars', 'calendar_exceptions', 'wbs_nodes', 'activities', 'dependencies',
  'baselines', 'baseline_activities', 'resources', 'assignments',
  'field_tasks', 'risks', 'comments', 'notifications',
  'design_templates', 'designs',
  'clients', 'bids', 'bid_line_items', 'invoices', 'payments', 'invoice_engine_events',
];

function connectionGuidance(error) {
  switch (error?.code) {
    case '3D000':
      return 'The configured PostgreSQL database does not exist. For the default local setup, run createdb abqadu once, then npm run migrate once on that fresh database. For a custom DATABASE_URL, create its intended database with your database administrator.';
    case '28P01':
    case '28000':
      return 'PostgreSQL authentication failed. Check the credentials and role in the server DATABASE_URL and PostgreSQL access configuration.';
    case '42501':
      return 'PostgreSQL permission check failed. Give the configured application role access to its database, schema, and required tables.';
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'EHOSTUNREACH':
    case 'ETIMEDOUT':
    case '57P03':
      return 'PostgreSQL is unreachable or not ready. Confirm PostgreSQL is running and check the DATABASE_URL host, port, and network access.';
    default:
      return 'PostgreSQL could not complete the check. Check that PostgreSQL is running and that the server DATABASE_URL, credentials, network, and schema permissions are correct.';
  }
}

async function runDoctor({ pool, log = console.log }) {
  const messages = ['ABQ ADU database doctor (read-only)'];
  let client;
  let exitCode = 1;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query(
      'SELECT expected.name AS table_name, to_regclass(expected.name) IS NOT NULL AS present FROM unnest($1::text[]) AS expected(name)',
      [REQUIRED_TABLES],
    );
    await client.query('ROLLBACK');
    const present = new Set(result.rows.filter(row => row.present === true).map(row => row.table_name));
    const missing = REQUIRED_TABLES.filter(name => !present.has(name));
    if (missing.length) {
      messages.push(`NOT READY: Missing required tables: ${missing.join(', ')}.`);
      messages.push('For a fresh, empty database, run npm run migrate once from platform/server, then npm run doctor.');
      messages.push('For an existing or partially migrated database, back it up and inspect the migrations first. The current runner replays every SQL file; rerunning it can duplicate default design layouts.');
    } else {
      exitCode = 0;
      messages.push(`READY: PostgreSQL is reachable and all ${REQUIRED_TABLES.length} required tables are visible to the application role.`);
      messages.push('This checks connectivity and table presence; it does not verify every column, write permission, external integration, or backup.');
    }
  } catch (error) {
    messages.push(`NOT READY: ${connectionGuidance(error)}`);
  } finally {
    if (client) client.release();
    try {
      await pool.end();
    } catch {
      exitCode = 1;
      messages.push('NOT READY: Database connection cleanup failed. Check PostgreSQL availability and retry npm run doctor.');
    }
  }
  messages.push('Command Center JSON data is a separate store; this check does not read or modify it.');
  messages.push('Setup and recovery: docs/version-10-platform-deployment.md');
  messages.forEach(message => log(message));
  return exitCode;
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/abqadu',
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    max: 1,
  });
  process.exitCode = await runDoctor({ pool });
}

if (require.main === module) {
  main().catch(() => {
    console.error('NOT READY: Doctor could not start. Run npm install in platform/server and check the server database configuration.');
    process.exitCode = 1;
  });
}

module.exports = { runDoctor, REQUIRED_TABLES };
