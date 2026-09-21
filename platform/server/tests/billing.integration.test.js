const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Pool } = require('pg');
const Stripe = require('stripe');
const express = require('express');
const request = require('supertest');

// This suite creates and drops only a random, isolated schema. Never point the
// migration runner at a database to run these tests.
const database = process.env.BILLING_TEST_DATABASE_URL;
(database ? describe : describe.skip)('billing with real PostgreSQL transactions', () => {
  let admin, pool, service, app, stripe, config, statePath, directory;
  const schema = `billing_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const fixture = () => ({ projects: [{ id: 'json-project', client: 'Saved homeowner', client_email: 'client@example.test', address: 'Saved address', bid_total: 999999,
    invoice_drafts: [{ id: 'draw-1', label: 'Saved deposit', amount: 100, notes: 'Reviewed draft' }, { id: 'draw-2', label: 'Saved final', amount: 50 }] }] });
  let sessions;
  beforeAll(async () => {
    admin = new Pool({ connectionString: database });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: database, options: `-c search_path=${schema}`, max: 10 });
    await pool.query('CREATE TABLE projects (id SERIAL PRIMARY KEY); CREATE TABLE designs (id SERIAL PRIMARY KEY)');
    for (const name of ['005_bidding_invoicing.sql', '006_invoice_engine_sync.sql', '007_billing_ledger.sql']) {
      await pool.query(await fs.readFile(path.join(__dirname, '../src/migrations', name), 'utf8'));
    }
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'abq-billing-'));
    statePath = path.join(directory, 'drafts.json');
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE stripe_webhook_events, payments, stripe_checkout_attempts, invoices, clients RESTART IDENTITY CASCADE');
    await fs.writeFile(statePath, JSON.stringify(fixture()));
    sessions = new Map();
    const keys = new Map();
    const sdk = new Stripe('sk_test_fixture');
    stripe = { webhooks: sdk.webhooks, checkout: { sessions: {
      create: jest.fn(async (payload, { idempotencyKey }) => {
        if (!keys.has(idempotencyKey)) {
          const id = `cs_test_${keys.size + 1}`;
          keys.set(idempotencyKey, id);
          sessions.set(id, { id, url: `https://checkout.stripe.com/c/pay/${id}`, mode: payload.mode,
            metadata: payload.metadata, client_reference_id: payload.client_reference_id, currency: 'usd',
            amount_total: payload.line_items[0].price_data.unit_amount, livemode: false,
            payment_status: 'unpaid', status: 'open', payment_intent: null, expires_at: Math.floor(Date.now() / 1000) + 86400 });
        }
        return { ...sessions.get(keys.get(idempotencyKey)) };
      }),
      retrieve: jest.fn(async id => ({ ...sessions.get(id) })),
    } } };
    config = { secretKey: 'sk_test_fixture', webhookSecret: 'whsec_fixture', mode: 'test',
      successUrl: 'https://example.test/invoices?checkout=returned', cancelUrl: 'https://example.test/invoices?checkout=cancelled' };
    const { createBillingService } = require('../src/services/billing');
    service = createBillingService({ pool, stripe, config, loadState: async () => JSON.parse(await fs.readFile(statePath, 'utf8')) });
    const { createBillingRouter } = require('../src/routes/billing');
    const router = createBillingRouter(service);
    app = express();
    app.post('/webhook', express.raw({ type: 'application/json' }), router.stripeWebhook);
    app.use(express.json());
    app.use('/billing', router);
    app.use((err, req, res, next) => res.status(503).json({ error: 'Database unavailable' }));
  });
  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });
  async function invoice() { return (await service.importDrafts('json-project'))[0]; }
  async function checkout() { const inv = await invoice(); return service.createCheckout(inv.id, {}); }
  function eventFor(id, type = 'checkout.session.completed', eventId = 'evt_paid') {
    return { id: eventId, object: 'event', type, livemode: false, data: { object: { ...sessions.get(id) } } };
  }
  function deliver(event, secret = config.webhookSecret, timestamp = Math.floor(Date.now() / 1000)) {
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
    return request(app).post('/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(payload);
  }
  function markPaid(id, overrides = {}) { Object.assign(sessions.get(id), { status: 'complete', payment_status: 'paid', payment_intent: 'pi_paid', ...overrides }); }
  async function counts() {
    return (await pool.query('SELECT (SELECT COUNT(*)::int FROM payments) AS payments,(SELECT COUNT(*)::int FROM stripe_webhook_events) AS events')).rows[0];
  }

  test('concurrent imports snapshot saved drafts, map clients, and never alter JSON', async () => {
    const before = await fs.readFile(statePath, 'utf8');
    const [first, second] = await Promise.all([service.importDrafts('json-project'), service.importDrafts('json-project')]);
    expect(first.map(i => i.id)).toEqual(second.map(i => i.id));
    expect(first.map(i => Number(i.amount))).toEqual([100, 50]);
    expect(first[0].client_id).toBeTruthy();
    expect(first[0].source_snapshot.draft.notes).toBe('Reviewed draft');
    expect((await pool.query('SELECT * FROM clients')).rows).toHaveLength(1);
    expect(await fs.readFile(statePath, 'utf8')).toBe(before);
  });
  test('changed or invalid drafts cannot partially import or overwrite an invoice', async () => {
    await invoice();
    const state = fixture();
    state.projects[0].invoice_drafts = [{ id: 'new', label: 'New', amount: 1 }, { id: 'draw-1', label: 'Changed', amount: 200 }];
    await fs.writeFile(statePath, JSON.stringify(state));
    await expect(service.importDrafts('json-project')).rejects.toMatchObject({ status: 409 });
    expect((await pool.query('SELECT amount FROM invoices ORDER BY id')).rows.map(i => Number(i.amount))).toEqual([100, 50]);
    state.projects[0].invoice_drafts = [{ id: 'bad', label: 'Invalid', amount: -1 }];
    await fs.writeFile(statePath, JSON.stringify(state));
    await expect(service.importDrafts('json-project')).rejects.toMatchObject({ status: 400 });
  });
  test('checkout refuses browser amounts, uses outstanding ledger balance, and reuses its durable attempt', async () => {
    const inv = await invoice();
    await service.recordManualPayment(inv.id, { request_id: crypto.randomUUID(), amount: 25, method: 'check' });
    const tampered = await request(app).post(`/billing/invoices/${inv.id}/checkout`).send({ amount: 1, metadata: { invoice_id: 2 } });
    expect(tampered.status).toBe(400);
    const [first, second] = await Promise.all([service.createCheckout(inv.id, {}), service.createCheckout(inv.id, {})]);
    expect(first).toEqual(second);
    expect(stripe.checkout.sessions.create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(7500);
    expect(new Set(stripe.checkout.sessions.create.mock.calls.map(call => call[1].idempotencyKey)).size).toBe(1);
    expect((await pool.query('SELECT * FROM stripe_checkout_attempts')).rows).toHaveLength(1);
    await expect(service.recordManualPayment(inv.id, { request_id: crypto.randomUUID(), amount: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(service.updateInvoice(inv.id, { request_id: crypto.randomUUID(), amount: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(service.deleteInvoice(inv.id)).rejects.toMatchObject({ status: 409 });
  });
  test('provider failure preserves the attempt and retries the same key and payload', async () => {
    const inv = await invoice();
    stripe.checkout.sessions.create.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.createCheckout(inv.id, {})).rejects.toMatchObject({ status: 502 });
    const [attempt] = (await pool.query('SELECT * FROM stripe_checkout_attempts')).rows;
    expect(attempt.state).toBe('creating');
    await service.createCheckout(inv.id, {});
    expect(stripe.checkout.sessions.create.mock.calls[1]).toEqual(stripe.checkout.sessions.create.mock.calls[0]);
  });
  test('provider success followed by a failed association write is recovered on retry', async () => {
    const inv = await invoice();
    await pool.query("CREATE FUNCTION fail_association() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.stripe_session_id IS NOT NULL THEN RAISE EXCEPTION 'association unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_association BEFORE UPDATE ON stripe_checkout_attempts FOR EACH ROW EXECUTE FUNCTION fail_association()");
    try {
      await expect(service.createCheckout(inv.id, {})).rejects.toThrow('association unavailable');
    } finally { await pool.query('DROP TRIGGER fail_association ON stripe_checkout_attempts; DROP FUNCTION fail_association()'); }
    const recovered = await service.createCheckout(inv.id, {});
    expect(recovered.id).toBe('cs_test_1');
    expect(stripe.checkout.sessions.create.mock.calls[1]).toEqual(stripe.checkout.sessions.create.mock.calls[0]);
  });
  test('forged and expired signatures cannot record payments', async () => {
    const session = await checkout(); markPaid(session.id);
    expect((await deliver(eventFor(session.id), 'wrong')).status).toBe(400);
    expect((await deliver(eventFor(session.id), config.webhookSecret, 1)).status).toBe(400);
    expect(await counts()).toEqual({ payments: 0, events: 0 });
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });
  test('concurrent duplicate events and different events for one paid session record exactly one payment', async () => {
    const session = await checkout(); markPaid(session.id);
    const results = await Promise.all([deliver(eventFor(session.id)), deliver(eventFor(session.id)), deliver(eventFor(session.id, 'checkout.session.async_payment_succeeded', 'evt_other'))]);
    expect(results.map(r => r.status)).toEqual([200, 200, 200]);
    expect(await counts()).toEqual({ payments: 1, events: 2 });
    const inv = (await pool.query('SELECT * FROM invoices WHERE id=$1', [session.invoice_id])).rows[0];
    expect(inv.status).toBe('paid');
    expect(Number((await pool.query('SELECT amount FROM payments')).rows[0].amount)).toBe(100);
  });
  test.each([
    ['amount', { amount_total: 1 }], ['currency', { currency: 'eur' }], ['mode', { mode: 'subscription' }],
    ['live mode', { livemode: true }], ['invoice reference', { client_reference_id: '999' }],
    ['metadata', { metadata: { abq_invoice_id: '999', abq_attempt_id: 'missing' } }],
  ])('signed but mismatched %s never records a payment', async (label, mismatch) => {
    const session = await checkout(); markPaid(session.id, mismatch);
    expect((await deliver(eventFor(session.id))).status).toBe(409);
    expect(await counts()).toEqual({ payments: 0, events: 0 });
  });
  test('a different session cannot take over an existing attempt', async () => {
    const session = await checkout();
    sessions.set('cs_unknown', { ...sessions.get(session.id), id: 'cs_unknown', status: 'complete', payment_status: 'paid', payment_intent: 'pi_other' });
    expect((await deliver(eventFor('cs_unknown'))).status).toBe(409);
    expect(await counts()).toEqual({ payments: 0, events: 0 });
  });
  test('unpaid completion does not pay the invoice; later success does', async () => {
    const session = await checkout(); Object.assign(sessions.get(session.id), { status: 'complete' });
    expect((await deliver(eventFor(session.id, 'checkout.session.completed', 'evt_unpaid'))).status).toBe(200);
    expect(await counts()).toEqual({ payments: 0, events: 1 });
    await expect(service.recordManualPayment(session.invoice_id, { request_id: crypto.randomUUID(), amount: 1 })).rejects.toMatchObject({ status: 409 });
    markPaid(session.id);
    expect((await deliver(eventFor(session.id, 'checkout.session.async_payment_succeeded', 'evt_later'))).status).toBe(200);
    expect(await counts()).toEqual({ payments: 1, events: 2 });
  });
  test('database failure rolls back event and payment together, allowing a safe retry', async () => {
    const session = await checkout(); markPaid(session.id);
    await pool.query("CREATE FUNCTION fail_paid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='paid' THEN RAISE EXCEPTION 'ledger unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_paid BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fail_paid()");
    try {
      expect((await deliver(eventFor(session.id))).status).toBe(503);
      expect(await counts()).toEqual({ payments: 0, events: 0 });
    } finally { await pool.query('DROP TRIGGER fail_paid ON invoices; DROP FUNCTION fail_paid()'); }
    expect((await deliver(eventFor(session.id))).status).toBe(200);
    expect(await counts()).toEqual({ payments: 1, events: 1 });
  });
  test('paid status and manual payment amount are guarded by the actual ledger', async () => {
    const inv = await invoice();
    await expect(service.updateInvoice(inv.id, { status: 'paid' })).rejects.toMatchObject({ status: 409 });
    await expect(service.recordManualPayment(inv.id, { request_id: crypto.randomUUID(), amount: -1 })).rejects.toMatchObject({ status: 400 });
    await expect(service.recordManualPayment(inv.id, { request_id: crypto.randomUUID(), amount: 101 })).rejects.toMatchObject({ status: 409 });
    await service.recordManualPayment(inv.id, { request_id: crypto.randomUUID(), amount: 100, method: 'check' });
    expect((await pool.query('SELECT status FROM invoices WHERE id=$1', [inv.id])).rows[0].status).toBe('paid');
    await expect(service.deleteInvoice(inv.id)).rejects.toMatchObject({ status: 409 });
  });
  test('expired checkout releases its guard; a new link gets a new durable attempt', async () => {
    const first = await checkout();
    Object.assign(sessions.get(first.id), { status: 'expired', url: null });
    expect((await deliver(eventFor(first.id, 'checkout.session.expired', 'evt_expired'))).status).toBe(200);
    await service.updateInvoice(first.invoice_id, { amount: 80 });
    const next = await service.createCheckout(first.invoice_id, {});
    expect(next.id).not.toBe(first.id);
    expect(sessions.get(next.id).amount_total).toBe(8000);
    expect((await pool.query('SELECT state FROM stripe_checkout_attempts ORDER BY created_at')).rows.map(row => row.state)).toEqual(['expired', 'open']);
  });
  test('failed delayed payment records no money and releases the invoice guard', async () => {
    const session = await checkout();
    Object.assign(sessions.get(session.id), { status: 'complete', payment_status: 'unpaid' });
    expect((await deliver(eventFor(session.id, 'checkout.session.async_payment_failed', 'evt_failed'))).status).toBe(200);
    expect(await counts()).toEqual({ payments: 0, events: 1 });
    await service.recordManualPayment(session.invoice_id, { request_id: crypto.randomUUID(), amount: 20 });
    expect(Number((await pool.query('SELECT amount FROM payments')).rows[0].amount)).toBe(20);
  });
  test('a delayed stale failure cannot demote a recorded payment', async () => {
    const session = await checkout(); markPaid(session.id);
    await deliver(eventFor(session.id));
    expect((await deliver(eventFor(session.id, 'checkout.session.async_payment_failed', 'evt_stale'))).status).toBe(200);
    expect(await counts()).toEqual({ payments: 1, events: 2 });
    expect((await pool.query('SELECT state FROM stripe_checkout_attempts')).rows[0].state).toBe('paid');
  });
  test('unresolved checkout creation older than Stripe idempotency retention is never retried blindly', async () => {
    const inv = await invoice();
    stripe.checkout.sessions.create.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.createCheckout(inv.id, {})).rejects.toMatchObject({ status: 502 });
    await pool.query("UPDATE stripe_checkout_attempts SET created_at=NOW()-INTERVAL '25 hours'");
    await expect(service.createCheckout(inv.id, {})).rejects.toMatchObject({ status: 409 });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
  test('migration replay is additive and retains existing imported invoices and payments', async () => {
    const session = await checkout(); markPaid(session.id);
    await deliver(eventFor(session.id));
    const before = await pool.query('SELECT * FROM invoices ORDER BY id');
    await pool.query(await fs.readFile(path.join(__dirname, '../src/migrations/007_billing_ledger.sql'), 'utf8'));
    expect((await pool.query('SELECT * FROM invoices ORDER BY id')).rows).toEqual(before.rows);
    expect(await counts()).toEqual({ payments: 1, events: 1 });
  });
  test('manual payment retries are idempotent, including concurrent responses and later checkout creation', async () => {
    const inv = await invoice();
    const body = { request_id: crypto.randomUUID(), amount: 20, method: 'check', reference: 'check 10' };
    const [first, second] = await Promise.all([service.recordManualPayment(inv.id, body), service.recordManualPayment(inv.id, body)]);
    expect(first.id).toBe(second.id);
    await service.createCheckout(inv.id, {});
    expect((await service.recordManualPayment(inv.id, body)).id).toBe(first.id);
    expect((await counts()).payments).toBe(1);
    await expect(service.recordManualPayment(inv.id, { ...body, amount: 21 })).rejects.toMatchObject({ status: 409 });
    await expect(service.recordManualPayment(inv.id, { amount: 20 })).rejects.toMatchObject({ status: 400 });
  });
  test('one manual request identity cannot record payments on two invoices concurrently', async () => {
    const invoices = await service.importDrafts('json-project');
    const body = { request_id: crypto.randomUUID(), amount: 20 };
    const results = await Promise.allSettled(invoices.map(inv => service.recordManualPayment(inv.id, body)));
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(item => item.status === 'rejected').reason.status).toBe(409);
    expect((await counts()).payments).toBe(1);
  });
  test('a provider payment identity cannot pay two invoices in concurrent events', async () => {
    const invoices = await service.importDrafts('json-project');
    const checkouts = await Promise.all(invoices.map(inv => service.createCheckout(inv.id, {})));
    checkouts.forEach(session => markPaid(session.id));
    const results = await Promise.all(checkouts.map((session, index) => deliver(eventFor(session.id, 'checkout.session.completed', `evt_shared_payment_${index}`))));
    expect(results.map(item => item.status).sort()).toEqual([200, 409]);
    expect(await counts()).toEqual({ payments: 1, events: 1 });
    expect((await pool.query("SELECT * FROM invoices WHERE status='paid'")).rows).toHaveLength(1);
  });
  test.each(['reserved', 'linked'])('InvoiceShelf %s invoices cannot change exported terms or be deleted', async state => {
    const inv = (await pool.query(`INSERT INTO invoices(invoice_number,amount,description,invoiceshelf_sync_error,invoiceshelf_invoice_id)
      VALUES ('REMOTE-GUARD',100,'Original invoice',$1,$2) RETURNING *`,
    [state === 'reserved' ? 'Creation pending or uncertain; reconcile before retrying.' : null, state === 'linked' ? 'remote-7' : null])).rows[0];
    for (const patch of [{ amount: 120 }, { description: 'Changed' }, { draw_type: 'final' }, { issued_date: '2026-09-21' }, { due_date: '2026-10-21' }]) {
      await expect(service.updateInvoice(inv.id, patch)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('InvoiceShelf') });
    }
    // No source mapping, checkout or payments exist to mask the deletion guard.
    await expect(service.deleteInvoice(inv.id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('InvoiceShelf') });
    expect((await pool.query('SELECT amount,description FROM invoices WHERE id=$1', [inv.id])).rows[0]).toEqual({ amount: '100.00', description: 'Original invoice' });
    expect((await service.updateInvoice(inv.id, { status: 'sent', amount: '100.00' })).status).toBe('sent');
    await service.recordManualPayment(inv.id, { request_id: crypto.randomUUID(), amount: 20, method: 'check' });
    expect((await counts()).payments).toBe(1);
  });
  test('a financial edit waiting behind an InvoiceShelf reservation sees the committed reservation', async () => {
    const inv = (await pool.query("INSERT INTO invoices(invoice_number,amount) VALUES ('REMOTE-RACE',100) RETURNING *")).rows[0];
    const reservation = await pool.connect();
    let pending;
    try {
      await reservation.query('BEGIN');
      await reservation.query("UPDATE invoices SET invoiceshelf_sync_error='Creation pending' WHERE id=$1", [inv.id]);
      pending = service.updateInvoice(inv.id, { amount: 120 }).then(value => ({ value }), error => ({ error }));
      await reservation.query('COMMIT');
    } finally { reservation.release(); }
    expect((await pending).error).toMatchObject({ status: 409, message: expect.stringContaining('InvoiceShelf') });
    expect((await pool.query('SELECT amount FROM invoices WHERE id=$1', [inv.id])).rows[0].amount).toBe('100.00');
  });
  async function savedBid(amount = '100.01') {
    const bid = (await pool.query("INSERT INTO bids(bid_number,title,markup_pct,tax_pct,contingency_pct) VALUES ('BID-SCHEDULE','Saved scope',0,0,0) RETURNING *")).rows[0];
    await pool.query("INSERT INTO bid_line_items(bid_id,description,qty,unit_cost) VALUES ($1,'Saved scope',1,$2)", [bid.id, amount]);
    return bid;
  }
  test('bid schedule retries and concurrent requests return the same five saved invoices', async () => {
    const bid = await savedBid();
    await pool.query("UPDATE bids SET valid_until='2026-10-01' WHERE id=$1", [bid.id]);
    const [first, concurrent] = await Promise.all([service.generateBidSchedule(bid.id), service.generateBidSchedule(bid.id)]);
    expect(first).toHaveLength(5);
    expect(concurrent.map(row => row.id)).toEqual(first.map(row => row.id));
    expect(first.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0)).toBe(10001);
    expect(first.every(row => /^BD-\d+$/.test(row.invoice_number))).toBe(true);
    expect(first[0].source_snapshot.bid.valid_until).toBe('2026-10-01');
    // The client accepts the bid after creation and its save recreates item IDs.
    await pool.query("UPDATE bids SET status='accepted',updated_at=NOW() WHERE id=$1", [bid.id]);
    await pool.query('DELETE FROM bid_line_items WHERE bid_id=$1', [bid.id]);
    await pool.query("INSERT INTO bid_line_items(bid_id,description,qty,unit_cost) VALUES ($1,'Saved scope',1,100.01)", [bid.id]);
    expect((await service.generateBidSchedule(bid.id)).map(row => row.id)).toEqual(first.map(row => row.id));
    expect((await pool.query('SELECT * FROM invoices')).rows).toHaveLength(5);
  });
  test('changed bid terms require review instead of generating another schedule', async () => {
    const bid = await savedBid();
    const first = await service.generateBidSchedule(bid.id);
    await pool.query('UPDATE bid_line_items SET unit_cost=200 WHERE bid_id=$1', [bid.id]);
    await expect(service.generateBidSchedule(bid.id)).rejects.toMatchObject({ status: 409 });
    expect((await pool.query('SELECT amount FROM invoices ORDER BY id')).rows.map(row => row.amount)).toEqual(first.map(row => row.amount));
  });
  test('legacy bid invoices require reconciliation before creating any schedule', async () => {
    const bid = await savedBid();
    await pool.query("INSERT INTO invoices(bid_id,invoice_number,amount) VALUES ($1,'INV-2026-0001',20)", [bid.id]);
    await expect(service.generateBidSchedule(bid.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/review|reconcil/i) });
    expect((await pool.query('SELECT * FROM invoices')).rows).toHaveLength(1);
  });
  test('bid schedule creation rolls back all draws when one insert fails', async () => {
    const bid = await savedBid();
    await pool.query("CREATE FUNCTION fail_draw() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description LIKE 'Dry-in%' THEN RAISE EXCEPTION 'draw insert unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_draw BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION fail_draw()");
    try {
      await expect(service.generateBidSchedule(bid.id)).rejects.toThrow('draw insert unavailable');
      expect((await pool.query('SELECT * FROM invoices')).rows).toHaveLength(0);
    } finally { await pool.query('DROP TRIGGER fail_draw ON invoices; DROP FUNCTION fail_draw()'); }
    expect(await service.generateBidSchedule(bid.id)).toHaveLength(5);
  });
  test('bid generation waits for a complete bid and item edit transaction', async () => {
    const bid = await savedBid();
    const editor = await pool.connect();
    let generated;
    try {
      await editor.query('BEGIN');
      await editor.query('SELECT id FROM bids WHERE id=$1 FOR UPDATE', [bid.id]);
      await editor.query("UPDATE bids SET title='Revised scope' WHERE id=$1", [bid.id]);
      await editor.query('DELETE FROM bid_line_items WHERE bid_id=$1', [bid.id]);
      generated = service.generateBidSchedule(bid.id);
      await editor.query("INSERT INTO bid_line_items(bid_id,description,qty,unit_cost) VALUES ($1,'Revised scope',1,200)", [bid.id]);
      await editor.query('COMMIT');
    } finally { editor.release(); }
    const invoices = await generated;
    expect(invoices.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(200);
    expect(invoices[0].source_snapshot.bid.title).toBe('Revised scope');
  });
});
