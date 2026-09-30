const path = require('node:path');

const REQUIRED_TABLES = [
  'projects', 'calendars', 'calendar_exceptions', 'wbs_nodes', 'activities', 'dependencies',
  'baselines', 'baseline_activities', 'resources', 'assignments',
  'field_tasks', 'risks', 'comments', 'notifications',
  'design_templates', 'designs',
  'clients', 'bids', 'bid_line_items', 'invoices', 'payments', 'invoice_engine_events',
  'stripe_checkout_attempts', 'stripe_webhook_events',
];

// These additive fields are required even when all legacy tables already exist.
const BILLING_COLUMNS = {
  clients: ['command_center_source_key'],
  invoices: ['source_key', 'source_snapshot', 'source_fingerprint', 'invoiceshelf_remote_status'],
  payments: ['provider', 'provider_payment_id', 'stripe_checkout_session_id', 'manual_request_key', 'manual_request_fingerprint'],
  stripe_checkout_attempts: ['id', 'invoice_id', 'amount_cents', 'currency', 'livemode', 'idempotency_key', 'request_payload', 'stripe_session_id', 'checkout_url', 'state', 'expires_at', 'created_at', 'updated_at'],
  stripe_webhook_events: ['event_id', 'event_type', 'stripe_session_id', 'livemode', 'processed_at'],
};
const requiredColumns = Object.entries(BILLING_COLUMNS).flatMap(([table, columns]) => columns.map(column => [table, column]));

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
    const columnResult = await client.query(
      `SELECT expected.table_name, expected.column_name, EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass(expected.table_name) AND attname = expected.column_name
          AND attnum > 0 AND NOT attisdropped
      ) AS present
      FROM unnest($1::text[], $2::text[]) AS expected(table_name, column_name)`,
      [requiredColumns.map(([table]) => table), requiredColumns.map(([, column]) => column)],
    );
    await client.query('ROLLBACK');
    const present = new Set(result.rows.filter(row => row.present === true).map(row => row.table_name));
    const missing = REQUIRED_TABLES.filter(name => !present.has(name));
    const presentColumns = new Set(columnResult.rows.filter(row => row.present === true).map(row => `${row.table_name}.${row.column_name}`));
    const missingColumns = requiredColumns.filter(([table, column]) => present.has(table) && !presentColumns.has(`${table}.${column}`))
      .map(([table, column]) => `${table}.${column}`);
    if (missing.length || missingColumns.length) {
      if (missing.length) messages.push(`NOT READY: Missing required tables: ${missing.join(', ')}.`);
      if (missingColumns.length) messages.push(`NOT READY: Missing required billing columns: ${missingColumns.join(', ')}.`);
      messages.push('For a fresh, empty database, run npm run migrate once from platform/server, then npm run doctor.');
      messages.push('For an existing or partially migrated database, back it up and inspect the migrations first. The current runner replays every SQL file; rerunning it can duplicate default design layouts.');
      if (missing.some(name => name.startsWith('stripe_')) || missingColumns.length) {
        messages.push('Billing schema is incomplete. After a backup, review and apply only src/migrations/007_billing_ledger.sql in one transaction to an existing database whose earlier migrations are present. Do not replay npm run migrate on an existing database. Then rerun npm run doctor.');
      }
    } else {
      exitCode = 0;
      messages.push(`READY: PostgreSQL is reachable and all ${REQUIRED_TABLES.length} required tables and ${requiredColumns.length} required billing columns are present in the application search path.`);
      messages.push('This checks connectivity, table presence, and billing column presence; it does not verify column types, every other column, indexes, constraints, write permissions, external integrations, or backups.');
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
