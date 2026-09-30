const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { createCfoBriefingService } = require('../src/services/cfoBriefing');

// All fixture DDL/data is restricted to this random schema, never public.
const database = process.env.BILLING_TEST_DATABASE_URL;
(database ? describe : describe.skip)('CFO read-only report against isolated PostgreSQL fixtures', () => {
  const schema = `cfo_test_${process.pid}_${randomBytes(6).toString('hex')}`;
  let admin, pool;
  const now = () => new Date('2026-10-01T00:30:00Z');
  const state = { projects: [{ id: 'json-fixture', client: 'Fixture job', bid_total: '100000', cogs_low: '60000', cogs_high: '70000' }] };
  beforeAll(async () => {
    admin = new Pool({ connectionString: database });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: database, options: `-c search_path=${schema}`, max: 2 });
    await pool.query('CREATE TABLE projects (id SERIAL PRIMARY KEY); CREATE TABLE designs (id SERIAL PRIMARY KEY)');
    for (const file of ['005_bidding_invoicing.sql', '006_invoice_engine_sync.sql', '007_billing_ledger.sql']) {
      await pool.query(await fs.readFile(path.join(__dirname, '../src/migrations', file), 'utf8'));
    }
  });
  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE payments, stripe_checkout_attempts, invoices, clients RESTART IDENTITY CASCADE');
  });
  async function invoice(status = 'sent', amount = '100') {
    return (await pool.query("INSERT INTO invoices(amount,status,issued_date,due_date) VALUES ($1,$2,'2026-09-01','2026-09-20') RETURNING id", [amount, status])).rows[0].id;
  }
  async function payment(id, amount, options = {}) {
    await pool.query(`INSERT INTO payments(invoice_id,amount,method,paid_date,provider,provider_payment_id,stripe_checkout_session_id,manual_request_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, amount, options.method || 'check', options.date || '2026-09-25', options.provider || null, options.paymentId || null, options.sessionId || null, options.manual ? randomUUID() : null]);
  }
  async function stripe(id, amount, livemode, options = {}) {
    const sessionId = `cs_${randomUUID()}`, paymentId = `pi_${randomUUID()}`;
    await pool.query(`INSERT INTO stripe_checkout_attempts(id,invoice_id,amount_cents,currency,livemode,idempotency_key,request_payload,stripe_session_id,state)
      VALUES($1,$2,$3,'usd',$4,$5,'{}',$6,'paid')`, [randomUUID(), id, options.attemptCents || Math.round(Number(amount) * 100), livemode, randomUUID(), sessionId]);
    await payment(options.paymentInvoice || id, amount, { provider: 'stripe', method: 'card', paymentId, sessionId });
  }
  async function readOnlyReport() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const result = await createCfoBriefingService({ readState: async () => state, query: (...args) => client.query(...args), now })();
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  test('preaggregated SQL distinguishes live/manual, test, unresolved and invalid payments without invoice fanout', async () => {
    const live = await invoice();
    await stripe(live, '10.10', true);
    await payment(live, '20.20', { manual: true });
    const test = await invoice();
    await stripe(test, '25', false);
    const unresolved = await invoice();
    await payment(unresolved, '15', { provider: 'stripe', method: 'card', paymentId: 'pi_unresolved', sessionId: 'cs_unresolved' });
    const manual = await invoice();
    await payment(manual, '40', { method: 'ach', manual: true });
    const unknownCard = await invoice();
    await payment(unknownCard, '10', { method: 'card' });
    const futurePayment = await invoice();
    await payment(futurePayment, '5', { manual: true, date: '2026-10-01' });
    await invoice('draft', '50');
    const original = JSON.stringify(state);
    const result = await readOnlyReport();
    expect(result.ledger).toMatchObject({ status: 'partial', invoice_count: 7, issued_count: 6, draft_count: 1, issued_balance_cents: 12970, overdue_balance_cents: 12970, draft_total_cents: 5000, recorded_payments_cents: 7030, known_test_payments_cents: 2500, needs_review_count: 4 });
    expect(result.ledger.overdue_invoices.map(row => row.id).sort()).toEqual([live, manual]);
    expect(JSON.stringify(state)).toBe(original);
    expect((await pool.query('SELECT COUNT(*)::int AS count FROM payments')).rows[0].count).toBe(7);
  });

  test('mismatched Stripe amount/invoice references stay unresolved instead of becoming known collections', async () => {
    const wrongAmount = await invoice();
    await stripe(wrongAmount, '25', true, { attemptCents: 5000 });
    const wrongTestAmount = await invoice();
    await stripe(wrongTestAmount, '25', false, { attemptCents: 5000 });
    const target = await invoice(), other = await invoice();
    await stripe(target, '25', true, { paymentInvoice: other });
    const result = await readOnlyReport();
    expect(result.ledger).toMatchObject({ invoice_count: 4, recorded_payments_cents: 0, known_test_payments_cents: 0, needs_review_count: 3, issued_balance_cents: 10000 });
    expect(result.ledger.overdue_invoices.map(row => row.id)).toEqual([target]);
  });

  test('mixed payment sources on one invoice retain separate totals and exclude the entire invoice from collections', async () => {
    const id = await invoice('sent', '200');
    await stripe(id, '10', true);
    await stripe(id, '20', false);
    await payment(id, '30', { manual: true });
    await payment(id, '40', { provider: 'unknown-online', method: 'card' });
    const result = await readOnlyReport();
    expect(result.ledger).toMatchObject({ invoice_count: 1, recorded_payments_cents: 4000, known_test_payments_cents: 2000, needs_review_count: 1, issued_balance_cents: null, overdue_balance_cents: null });
    expect(result.ledger.overdue_invoices).toEqual([]);
  });
});
