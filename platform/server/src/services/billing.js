const crypto = require('crypto');
const Stripe = require('stripe');
const { pool: defaultPool } = require('../db');
const { loadCommandCenter } = require('./commandCenterStore');
const { computeBidTotals, buildDrawSchedule } = require('./bidCalc');

class BillingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new BillingError(status, message); };
const ACTIVE = "('creating','open','processing')";
const SUPPORTED_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired']);

// Parse exact decimal currency rather than rounding caller-supplied fractions.
function cents(value, allowZero = false) {
  const text = String(value ?? '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) fail(400, 'Amount must be a valid USD amount with at most two decimal places.');
  const [whole, decimal = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 999999999999 || result < (allowZero ? 0 : 1)) fail(400, 'Amount must be positive and within the supported range.');
  return result;
}
const money = value => (value / 100).toFixed(2);
const validId = value => {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 2147483647) fail(400, 'Invalid invoice ID.');
  return Number(value);
};
function ledgerInvoice(invoice, paid = invoice.paid ?? 0) {
  const amount = Number(invoice.amount), total = Number(paid);
  return { ...invoice, paid: total, balance: amount - total,
    status: amount > 0 && total >= amount ? 'paid' : invoice.status === 'paid' ? 'sent' : invoice.status };
}
function readConfig() {
  return { secretKey: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    mode: process.env.STRIPE_MODE || 'test', successUrl: process.env.STRIPE_SUCCESS_URL, cancelUrl: process.env.STRIPE_CANCEL_URL };
}
function validateConfig(config) {
  if (!config.secretKey || !config.webhookSecret || !config.successUrl || !config.cancelUrl) fail(503, 'Stripe payment setup is incomplete. Configure the secret key, webhook secret, and return URLs.');
  if (!['test', 'live'].includes(config.mode) || !new RegExp(`^(sk|rk)_${config.mode}_`).test(config.secretKey)) fail(503, 'Stripe key and STRIPE_MODE must match.');
  for (const value of [config.successUrl, config.cancelUrl]) {
    let url; try { url = new URL(value); } catch { fail(503, 'Stripe return URLs must be absolute URLs.'); }
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) fail(503, 'Stripe return URLs must use HTTPS, or HTTP on localhost.');
  }
  return config;
}

function createBillingService({ pool = defaultPool, stripe: injectedStripe, config: injectedConfig, loadState = loadCommandCenter } = {}) {
  let sdk, sdkKey;
  const configuration = () => validateConfig(injectedConfig || readConfig());
  function provider(config) {
    if (injectedStripe) return injectedStripe;
    if (!sdk || sdkKey !== config.secretKey) { sdk = new Stripe(config.secretKey, { timeout: 15000, maxNetworkRetries: 1 }); sdkKey = config.secretKey; }
    return sdk;
  }
  async function transaction(work) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function lockedInvoice(client, id) {
    const result = await client.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [validId(id)]);
    if (!result.rows.length) fail(404, 'Invoice not found.');
    return result.rows[0];
  }
  async function paidCents(client, id) {
    const { rows } = await client.query('SELECT COALESCE(SUM(amount),0)::numeric AS paid FROM payments WHERE invoice_id=$1', [id]);
    return cents(rows[0].paid, true);
  }
  async function assertNoActive(client, id) {
    const { rows } = await client.query(`SELECT id FROM stripe_checkout_attempts WHERE invoice_id=$1 AND state IN ${ACTIVE}`, [id]);
    if (rows.length) fail(409, 'This invoice has an active or pending checkout. Wait for Stripe to confirm payment or checkout expiration before changing the invoice or recording another payment.');
  }

  async function generateBidSchedule(bidId) {
    return transaction(async client => {
      // Bid edits use this same lock while replacing both the header and items.
      const bid = (await client.query('SELECT *,valid_until::text AS quoted_valid_until FROM bids WHERE id=$1 FOR UPDATE', [validId(bidId)])).rows[0];
      if (!bid) fail(404, 'Bid not found.');
      const items = (await client.query('SELECT * FROM bid_line_items WHERE bid_id=$1 ORDER BY sort_order,id', [bid.id])).rows;
      const quotedBid = {
        id: bid.id, bid_number: bid.bid_number, client_id: bid.client_id, project_id: bid.project_id,
        design_id: bid.design_id, title: bid.title, markup_pct: Number(bid.markup_pct),
        tax_pct: Number(bid.tax_pct), contingency_pct: Number(bid.contingency_pct),
        notes: bid.notes || '', valid_until: bid.quoted_valid_until,
      };
      // Surrogate item IDs change on an otherwise identical editor save. Only
      // quoted semantics belong in the fingerprint, not IDs, timestamps/status.
      const quotedItems = items.map(item => ({ category: item.category || '', description: item.description,
        qty: Number(item.qty), unit: item.unit || '', unit_cost: Number(item.unit_cost), sort_order: Number(item.sort_order) }));
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ bid: quotedBid, items: quotedItems })).digest('hex');
      const sourceKeys = Array.from({ length: 5 }, (_, index) => JSON.stringify(['bid-schedule', String(bid.id), index + 1]));
      const existing = (await client.query('SELECT * FROM invoices WHERE bid_id=$1 ORDER BY id FOR UPDATE', [bid.id])).rows;
      if (existing.length) {
        const bySource = new Map(existing.map(row => [row.source_key, row]));
        if (existing.length !== sourceKeys.length || sourceKeys.some(key => !bySource.has(key))) fail(409, 'This bid already has legacy, additional, or incomplete invoices. Review and reconcile them before creating a draw schedule.');
        if (existing.some(row => row.source_fingerprint !== fingerprint)) fail(409, 'Bid terms changed after the draw schedule was created. Review the existing invoices before issuing a revised schedule.');
        const result = [];
        for (const key of sourceKeys) {
          const invoice = bySource.get(key);
          result.push(ledgerInvoice(invoice, money(await paidCents(client, invoice.id))));
        }
        return result;
      }
      const total = cents(computeBidTotals(items, bid).total);
      const draws = buildDrawSchedule(Number(money(total)));
      // Allocate the rounding remainder to the final draw so the schedule sums
      // exactly to the quoted total, including bids with fractional dollars.
      const drawCents = draws.map(draw => cents(draw.amount, true));
      drawCents[drawCents.length - 1] = total - drawCents.slice(0, -1).reduce((sum, amount) => sum + amount, 0);
      if (drawCents.some(amount => amount < 0)) fail(400, 'The bid amount cannot produce a valid draw schedule.');
      const created = [];
      for (const [index, draw] of draws.entries()) {
        const id = (await client.query("SELECT nextval(pg_get_serial_sequence('invoices','id')) AS id")).rows[0].id;
        const amount = money(drawCents[index]);
        const snapshot = { source: 'bid-schedule', bid: quotedBid, items: quotedItems, total: money(total), draw_index: index + 1, draw: { ...draw, amount } };
        const { rows } = await client.query(`INSERT INTO invoices(id,bid_id,client_id,project_id,invoice_number,draw_type,description,amount,source_key,source_fingerprint,source_snapshot)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [id, bid.id, bid.client_id, bid.project_id, `BD-${id}`, draw.draw_type, draw.description, amount, sourceKeys[index], fingerprint, snapshot]);
        created.push(ledgerInvoice(rows[0]));
      }
      return created;
    });
  }

  async function importDrafts(projectId) {
    const state = await loadState();
    const project = state.projects?.find(item => item.id === projectId);
    if (!project) fail(404, 'Command Center project not found.');
    if (!Array.isArray(project.invoice_drafts) || !project.invoice_drafts.length) fail(409, 'Save invoice drafts for this project in Command Center before importing.');
    const seen = new Set();
    const drafts = project.invoice_drafts.map(draft => {
      if (!draft || typeof draft.id !== 'string' || !draft.id || seen.has(draft.id)) fail(400, 'Each saved draft needs a unique source ID.');
      seen.add(draft.id);
      if (typeof draft.label !== 'string' || !draft.label.trim() || draft.label.length > 300) fail(400, 'Each saved draft needs a description of at most 300 characters.');
      const amount = cents(draft.amount);
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ id: draft.id, label: draft.label, amount, notes: draft.notes ?? '', suggested_send_day: draft.suggested_send_day ?? null })).digest('hex');
      return { draft, amount, fingerprint, sourceKey: JSON.stringify(['command-center', projectId, draft.id]) };
    });
    const billing = { name: String(project.client || 'Command Center client'), email: project.client_email || null, phone: project.client_phone || null, address: project.address || null };
    if (billing.name.length > 200 || (billing.email?.length || 0) > 200 || (billing.phone?.length || 0) > 40) fail(400, 'Saved client contact details exceed the invoice field limits.');
    return transaction(async client => {
      // This row lock also serializes imports of the same JSON project.
      const { rows: customers } = await client.query(`INSERT INTO clients (name,email,phone,address,lead_source,command_center_source_key)
        VALUES ($1,$2,$3,$4,'Command Center',$5) ON CONFLICT (command_center_source_key)
        DO UPDATE SET command_center_source_key=EXCLUDED.command_center_source_key RETURNING *`,
      [billing.name, billing.email, billing.phone, billing.address, JSON.stringify(['command-center', projectId])]);
      const invoices = [];
      for (const entry of drafts) {
        const existing = await client.query('SELECT * FROM invoices WHERE source_key=$1', [entry.sourceKey]);
        if (existing.rows.length) {
          if (existing.rows[0].source_fingerprint !== entry.fingerprint) fail(409, 'A saved draft changed after import. Review the existing invoice; imports never overwrite financial records.');
          invoices.push(ledgerInvoice(existing.rows[0], money(await paidCents(client, existing.rows[0].id))));
          continue;
        }
        const { rows: ids } = await client.query("SELECT nextval(pg_get_serial_sequence('invoices','id')) AS id");
        const id = ids[0].id;
        const snapshot = { source: 'command-center', project_id: projectId, draft: entry.draft, billing };
        const { rows } = await client.query(`INSERT INTO invoices (id,client_id,invoice_number,draw_type,description,amount,source_key,source_snapshot,source_fingerprint)
          VALUES ($1,$2,$3,'progress',$4,$5,$6,$7,$8) RETURNING *`,
        [id, customers[0].id, `CC-${id}`, entry.draft.label, money(entry.amount), entry.sourceKey, snapshot, entry.fingerprint]);
        invoices.push(ledgerInvoice(rows[0]));
      }
      return invoices;
    });
  }

  function verifySession(session, attempt, config) {
    if (!session?.id || !/^cs_/.test(session.id) || (attempt.stripe_session_id && attempt.stripe_session_id !== session.id)
      || session.metadata?.abq_attempt_id !== attempt.id || session.metadata?.abq_invoice_id !== String(attempt.invoice_id)
      || session.client_reference_id !== String(attempt.invoice_id) || session.mode !== 'payment'
      || session.currency !== attempt.currency || session.amount_total !== Number(attempt.amount_cents)
      || session.livemode !== attempt.livemode || session.livemode !== (config.mode === 'live')) fail(409, 'Stripe session does not match the stored invoice checkout.');
  }
  async function retrieveSession(id, config) {
    try { return await provider(config).checkout.sessions.retrieve(id); }
    catch { fail(502, 'Stripe could not confirm the checkout. Retry; the saved invoice and checkout attempt are preserved.'); }
  }

  // Lock invoice before attempt consistently with checkout and manual edits.
  // The provider event, payment and paid status commit (or roll back) together.
  async function reconcileSession(session, config, event = null) {
    const { rows } = await pool.query('SELECT * FROM stripe_checkout_attempts WHERE stripe_session_id=$1 OR id::text=$2', [session.id, session.metadata?.abq_attempt_id || '']);
    if (rows.length !== 1) fail(409, 'Stripe session is not associated with a known checkout.');
    return transaction(async client => {
      const invoice = await lockedInvoice(client, rows[0].invoice_id);
      const attempt = (await client.query('SELECT * FROM stripe_checkout_attempts WHERE id=$1 FOR UPDATE', [rows[0].id])).rows[0];
      verifySession(session, attempt, config);
      if (event) {
        const inserted = await client.query('INSERT INTO stripe_webhook_events(event_id,event_type,stripe_session_id,livemode) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id', [event.id, event.type, session.id, event.livemode]);
        if (!inserted.rows.length) return { duplicate: true, state: attempt.state };
      }
      let nextState = attempt.state;
      if (session.payment_status === 'paid') {
        if (session.status !== 'complete') fail(409, 'Stripe payment is not complete.');
        const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (!paymentId || !paymentId.startsWith('pi_')) fail(409, 'Stripe payment is missing its payment identity.');
        const inserted = await client.query(`INSERT INTO payments(invoice_id,amount,method,reference,provider,provider_payment_id,stripe_checkout_session_id)
          VALUES ($1,$2,'card',$3,'stripe',$4,$5) ON CONFLICT DO NOTHING RETURNING *`, [invoice.id, money(Number(attempt.amount_cents)), 'Stripe Checkout', paymentId, session.id]);
        if (!inserted.rows.length) {
          const previous = (await client.query("SELECT * FROM payments WHERE (provider='stripe' AND provider_payment_id=$1) OR stripe_checkout_session_id=$2", [paymentId, session.id])).rows;
          if (previous.length !== 1 || previous[0].invoice_id !== invoice.id || previous[0].provider_payment_id !== paymentId || previous[0].stripe_checkout_session_id !== session.id || cents(previous[0].amount) !== Number(attempt.amount_cents)) fail(409, 'Stripe payment identity already belongs to a different ledger entry.');
        }
        const paid = await paidCents(client, invoice.id);
        await client.query("UPDATE invoices SET status=$1 WHERE id=$2", [paid >= cents(invoice.amount, true) ? 'paid' : 'sent', invoice.id]);
        nextState = 'paid';
      } else if (attempt.state !== 'paid') {
        if (session.status === 'expired') nextState = 'expired';
        else if (event?.type === 'checkout.session.async_payment_failed' && session.status === 'complete') nextState = 'failed';
        else if (session.status === 'complete') nextState = 'processing';
        else if (session.status === 'open') nextState = 'open';
        else fail(409, 'Stripe checkout has an unsupported state.');
      }
      await client.query(`UPDATE stripe_checkout_attempts SET stripe_session_id=$1,state=$2,checkout_url=COALESCE($3,checkout_url),expires_at=to_timestamp($4),updated_at=NOW() WHERE id=$5`,
        [session.id, nextState, session.url || null, session.expires_at || null, attempt.id]);
      return { state: nextState };
    });
  }

  async function createCheckout(invoiceId, body = {}, retried = false) {
    if (!body || Array.isArray(body) || Object.keys(body).length) fail(400, 'Checkout accepts an invoice ID only. Payment amount and metadata come from the stored invoice.');
    const config = configuration();
    const reserved = await transaction(async client => {
      const invoice = await lockedInvoice(client, invoiceId);
      const amount = cents(invoice.amount, true) - await paidCents(client, invoice.id);
      if (amount < 50) fail(409, amount <= 0 ? 'This invoice has no outstanding balance.' : 'Stripe requires a balance of at least $0.50.');
      if (amount > 99999999) fail(409, 'This balance exceeds Stripe checkout limits. Record a partial payment before creating a payment link.');
      const existing = await client.query(`SELECT * FROM stripe_checkout_attempts WHERE invoice_id=$1 AND state IN ${ACTIVE} FOR UPDATE`, [invoice.id]);
      if (existing.rows.length) {
        const attempt = existing.rows[0];
        if (Number(attempt.amount_cents) !== amount || attempt.livemode !== (config.mode === 'live')) fail(409, 'An outstanding checkout uses a different balance or Stripe mode. Reconcile it before creating another.');
        return attempt;
      }
      const id = crypto.randomUUID();
      const payload = { mode: 'payment', success_url: config.successUrl, cancel_url: config.cancelUrl,
        client_reference_id: String(invoice.id), metadata: { abq_invoice_id: String(invoice.id), abq_attempt_id: id },
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: amount, product_data: { name: invoice.invoice_number || `Invoice ${invoice.id}` } } }] };
      const { rows } = await client.query(`INSERT INTO stripe_checkout_attempts(id,invoice_id,amount_cents,currency,livemode,idempotency_key,request_payload)
        VALUES ($1,$2,$3,'usd',$4,$5,$6) RETURNING *`, [id, invoice.id, amount, config.mode === 'live', `abqadu-checkout-${id}`, payload]);
      return rows[0];
    });
    let session;
    if (reserved.stripe_session_id) session = await retrieveSession(reserved.stripe_session_id, config);
    else {
      // Stripe can prune idempotency keys after 24h. Never replay an unresolved
      // creation past that boundary; staff must reconcile its provider state.
      if (Date.now() - new Date(reserved.created_at).getTime() > 23 * 60 * 60 * 1000) fail(409, 'This unresolved checkout is older than 23 hours. Reconcile it in Stripe before retrying; creating another could duplicate payment.');
      try { session = await provider(config).checkout.sessions.create(reserved.request_payload, { idempotencyKey: reserved.idempotency_key }); }
      catch { fail(502, 'Stripe checkout could not be confirmed. Retry this invoice; its saved checkout identity will be reused.'); }
    }
    verifySession(session, reserved, config);
    const result = await reconcileSession(session, config);
    if (['expired', 'failed'].includes(result.state) && !retried) return createCheckout(invoiceId, {}, true);
    if (result.state !== 'open') fail(409, result.state === 'paid' ? 'Payment is already recorded for this checkout.' : 'Checkout payment is pending. Wait for Stripe to confirm the payment.');
    if (!session.url || !/^https:\/\/checkout\.stripe\.com\//.test(session.url)) fail(502, 'Stripe did not provide a usable payment link. Retry this invoice.');
    return { id: session.id, url: session.url, invoice_id: reserved.invoice_id };
  }

  async function handleWebhook(body, signature) {
    const config = configuration();
    if (!Buffer.isBuffer(body) || typeof signature !== 'string') fail(400, 'A signed raw Stripe request is required.');
    let event;
    try { event = provider(config).webhooks.constructEvent(body, signature, config.webhookSecret); }
    catch { fail(400, 'Invalid or expired Stripe webhook signature.'); }
    if (!SUPPORTED_EVENTS.has(event.type)) return { received: true, ignored: true };
    if (!event.id || event.livemode !== (config.mode === 'live') || !event.data?.object?.id) fail(409, 'Stripe event does not match the configured payment mode.');
    const session = await retrieveSession(event.data.object.id, config);
    if (session.id !== event.data.object.id) fail(409, 'Stripe returned a different checkout session.');
    await reconcileSession(session, config, event);
    return { received: true };
  }

  async function recordManualPayment(id, body) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id || '')) fail(400, 'A payment request_id UUID is required for safe retries.');
    const amount = cents(body.amount);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ invoice_id: validId(id), amount,
      method: body.method || null, reference: body.reference || null, paid_date: body.paid_date || null })).digest('hex');
    function sameRequest(payment) {
      if (payment.manual_request_fingerprint !== fingerprint) fail(409, 'This payment request ID was already used with different details. Review the recorded payment before starting a new payment.');
      return payment;
    }
    return transaction(async client => {
      const invoice = await lockedInvoice(client, id);
      const previous = await client.query('SELECT * FROM payments WHERE manual_request_key=$1', [body.request_id]);
      if (previous.rows.length) return sameRequest(previous.rows[0]);
      await assertNoActive(client, invoice.id);
      const paid = await paidCents(client, invoice.id);
      if (amount > cents(invoice.amount, true) - paid) fail(409, 'Payment exceeds the outstanding invoice balance.');
      const { rows } = await client.query(`INSERT INTO payments(invoice_id,amount,method,reference,paid_date,manual_request_key,manual_request_fingerprint)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING *`, [invoice.id, money(amount), body.method || null, body.reference || null, body.paid_date || new Date(), body.request_id, fingerprint]);
      if (!rows.length) return sameRequest((await client.query('SELECT * FROM payments WHERE manual_request_key=$1', [body.request_id])).rows[0]);
      await client.query('UPDATE invoices SET status=$1 WHERE id=$2', [paid + amount >= cents(invoice.amount, true) ? 'paid' : invoice.status === 'paid' ? 'sent' : invoice.status, invoice.id]);
      return rows[0];
    });
  }
  async function updateInvoice(id, body) {
    return transaction(async client => {
      const invoice = await lockedInvoice(client, id);
      await assertNoActive(client, invoice.id);
      const amount = body.amount == null ? cents(invoice.amount, true) : cents(body.amount, true);
      const dateKey = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
      const exportedTermsChanged = amount !== cents(invoice.amount, true)
        || (body.description != null && body.description !== invoice.description)
        || (body.draw_type != null && body.draw_type !== invoice.draw_type)
        || (body.issued_date !== undefined && dateKey(body.issued_date) !== dateKey(invoice.issued_date))
        || (body.due_date !== undefined && dateKey(body.due_date) !== dateKey(invoice.due_date));
      if ((invoice.invoiceshelf_sync_error || invoice.invoiceshelf_invoice_id) && exportedTermsChanged) {
        fail(409, 'InvoiceShelf creation is pending, needs reconciliation, or is already linked. Exported invoice terms cannot be changed; reconcile the existing invoice before issuing a revision.');
      }
      const paid = await paidCents(client, invoice.id);
      if (amount < paid || (body.status === 'paid' && (amount === 0 || paid < amount))) fail(409, 'Invoice amount and paid status must match recorded payments.');
      const requested = body.status ?? invoice.status;
      if (!['draft', 'sent', 'paid', 'overdue'].includes(requested)) fail(400, 'Unsupported invoice status.');
      const status = amount > 0 && paid >= amount ? 'paid' : requested === 'paid' ? 'sent' : requested;
      const { rows } = await client.query(`UPDATE invoices SET draw_type=$1,description=$2,amount=$3,status=$4,issued_date=$5,due_date=$6 WHERE id=$7 RETURNING *`,
        [body.draw_type ?? invoice.draw_type, body.description ?? invoice.description, money(amount), status,
          body.issued_date === undefined ? invoice.issued_date : body.issued_date || null,
          body.due_date === undefined ? invoice.due_date : body.due_date || null, invoice.id]);
      return ledgerInvoice(rows[0], money(paid));
    });
  }
  async function deleteInvoice(id) {
    return transaction(async client => {
      const invoice = await lockedInvoice(client, id);
      if (invoice.invoiceshelf_sync_error || invoice.invoiceshelf_invoice_id) {
        fail(409, 'An invoice reserved for or linked to InvoiceShelf cannot be deleted. Preserve it for reconciliation.');
      }
      const history = await client.query('SELECT 1 FROM payments WHERE invoice_id=$1 UNION ALL SELECT 1 FROM stripe_checkout_attempts WHERE invoice_id=$1 LIMIT 1', [invoice.id]);
      if (history.rows.length || invoice.source_key) fail(409, 'An imported invoice or invoice with payment history cannot be deleted. Preserve it for reconciliation.');
      await client.query('DELETE FROM invoices WHERE id=$1', [invoice.id]);
    });
  }
  return { importDrafts, generateBidSchedule, createCheckout, handleWebhook, recordManualPayment, updateInvoice, deleteInvoice };
}

const billing = createBillingService();
module.exports = { ...billing, createBillingService, BillingError, cents, ledgerInvoice, validateConfig };
