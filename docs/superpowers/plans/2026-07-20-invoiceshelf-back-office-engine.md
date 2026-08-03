# InvoiceShelf Back-Office Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use InvoiceShelf as the back-office estimate/invoice engine while ABQ ADU remains the contractor-facing cockpit for model selection, COGS, supplier pricing, and draw schedules.

**Architecture:** ABQ ADU keeps ownership of bids, COGS, supplier comparisons, project schedules, and client-facing builder workflow. A new InvoiceShelf adapter layer syncs ABQ ADU clients, estimates, invoice draw schedules, and payments to InvoiceShelf through its API. The adapter makes InvoiceShelf swappable and keeps AGPL-licensed code out of the ABQ ADU source tree.

**Tech Stack:** Existing ABQ ADU Express/Postgres backend, existing React builder app, InvoiceShelf 3.x Docker sandbox for proof of concept, InvoiceShelf API via Bearer token, Jest/Supertest-style route tests or current Node route smoke tests.

## Global Constraints

- InvoiceShelf is the back-office estimate/invoice engine, not the main builder interface.
- ABQ ADU must remain the builder cockpit for site visit, ADU model, square footage, COGS, supplier bidout, SIP/PUR panel comparison, and 90-day schedule.
- Do not fork or modify InvoiceShelf for the first integration; keep AGPL code isolated in a separate Docker deployment.
- Treat InvoiceShelf `3.x` as a proof-of-concept target because the requested branch is `3.x`; production can pin a stable InvoiceShelf release if 3.x remains alpha.
- ABQ ADU customer-facing totals must not expose internal COGS or supplier margin math.
- Invoice 1 remains `$10,000 Preconstruction Contract`.
- Keep existing ABQ ADU local PDF/print fallback working even when InvoiceShelf is offline.
- Sync failures must be visible to the builder and must not erase local ABQ ADU bid data.

---

## File Structure

- `platform/server/src/services/invoiceShelfClient.js`
  - Owns low-level InvoiceShelf HTTP calls, auth headers, base URL, retry-safe error formatting, and response normalization.
- `platform/server/src/services/invoiceShelfMapper.js`
  - Converts ABQ ADU clients, bids, draw invoices, and payments into InvoiceShelf payloads. Keeps internal COGS out of customer documents.
- `platform/server/src/routes/invoiceEngine.js`
  - Exposes ABQ-owned routes such as sync customer, create estimate, convert estimate, sync invoice status, and record payment status.
- `platform/server/src/migrations/006_invoice_engine_sync.sql`
  - Adds sync columns and an activity table without changing existing bid/invoice semantics.
- `platform/server/src/index.js`
  - Registers `/api/invoice-engine`.
- `platform/client/src/pages/Invoices.jsx`
  - Adds InvoiceShelf sync status, client-view link, and retry controls to the existing invoices screen.
- `platform/client/src/pages/BidBuilder.jsx`
  - Adds "Create InvoiceShelf estimate" and "Sync draw invoices" actions after a bid is ready.
- `platform.html`
  - Keeps static Version 8 prototype aligned with the back-office concept: visible notes/buttons are local fallbacks until backend connection is available.
- `tests/platform-invoiceshelf-plan.test.js`
  - Static guard that validates the plan and visible Version 8 copy reference InvoiceShelf as the back-office engine.
- `platform/server/tests/invoiceShelfMapper.test.js`
  - Unit tests for customer, estimate, invoice, and payment mapping.
- `platform/server/tests/invoiceEngine.routes.test.js`
  - Route tests with mocked InvoiceShelf client responses.

---

### Task 1: Add InvoiceShelf Configuration And Sync Schema

**Files:**
- Create: `platform/server/src/migrations/006_invoice_engine_sync.sql`
- Modify: `platform/server/.env.example`
- Test: `tests/platform-invoiceshelf-plan.test.js`

**Interfaces:**
- Produces environment variables:
  - `INVOICESHELF_BASE_URL`
  - `INVOICESHELF_API_TOKEN`
  - `INVOICESHELF_COMPANY_ID`
  - `INVOICESHELF_TIMEOUT_MS`
- Produces database columns:
  - `clients.invoiceshelf_customer_id`
  - `bids.invoiceshelf_estimate_id`
  - `invoices.invoiceshelf_invoice_id`
  - `payments.invoiceshelf_payment_id`
- Produces table `invoice_engine_events`.

- [ ] **Step 1: Write the migration**

Create `platform/server/src/migrations/006_invoice_engine_sync.sql`:

```sql
-- InvoiceShelf back-office engine sync

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS invoiceshelf_customer_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoiceshelf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiceshelf_sync_error TEXT;

ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS invoiceshelf_estimate_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoiceshelf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiceshelf_sync_error TEXT;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoiceshelf_invoice_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoiceshelf_public_url TEXT,
  ADD COLUMN IF NOT EXISTS invoiceshelf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiceshelf_sync_error TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS invoiceshelf_payment_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS invoiceshelf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoiceshelf_sync_error TEXT;

CREATE TABLE IF NOT EXISTS invoice_engine_events (
  id SERIAL PRIMARY KEY,
  local_type VARCHAR(40) NOT NULL,
  local_id INTEGER,
  remote_type VARCHAR(40),
  remote_id VARCHAR(80),
  event_type VARCHAR(40) NOT NULL,
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_engine_events_local
  ON invoice_engine_events(local_type, local_id, created_at DESC);
```

- [ ] **Step 2: Add documented env vars**

Update `platform/server/.env.example`:

```dotenv
# InvoiceShelf back-office engine
INVOICESHELF_BASE_URL=http://localhost:8080
INVOICESHELF_API_TOKEN=
INVOICESHELF_COMPANY_ID=
INVOICESHELF_TIMEOUT_MS=12000
```

- [ ] **Step 3: Add a static guard test**

Create `tests/platform-invoiceshelf-plan.test.js`:

```js
const fs = require('fs');

const plan = fs.readFileSync('docs/superpowers/plans/2026-07-20-invoiceshelf-back-office-engine.md', 'utf8');

function contains(text) {
  if (!plan.includes(text)) throw new Error(`Expected plan to include: ${text}`);
}

contains('InvoiceShelf is the back-office estimate/invoice engine');
contains('INVOICESHELF_BASE_URL');
contains('invoice_engine_events');
contains('$10,000 Preconstruction Contract');
contains('Keep existing ABQ ADU local PDF/print fallback working');

console.log('InvoiceShelf integration plan guard passed');
```

- [ ] **Step 4: Run the static guard**

Run: `node tests/platform-invoiceshelf-plan.test.js`

Expected: `InvoiceShelf integration plan guard passed`

- [ ] **Step 5: Commit**

```bash
git add platform/server/src/migrations/006_invoice_engine_sync.sql platform/server/.env.example tests/platform-invoiceshelf-plan.test.js docs/superpowers/plans/2026-07-20-invoiceshelf-back-office-engine.md
git commit -m "Plan InvoiceShelf back-office invoice engine"
```

---

### Task 2: Build The InvoiceShelf API Client

**Files:**
- Create: `platform/server/src/services/invoiceShelfClient.js`
- Test: `platform/server/tests/invoiceShelfClient.test.js`

**Interfaces:**
- Produces function `makeInvoiceShelfClient(config, fetchImpl = fetch)`.
- Produces methods:
  - `client.request(method, path, body)`
  - `client.createCustomer(payload)`
  - `client.createEstimate(payload)`
  - `client.convertEstimateToInvoice(estimateId)`
  - `client.getInvoice(invoiceId)`
  - `client.recordPayment(payload)`
- Consumes env vars from Task 1.

- [ ] **Step 1: Write client tests with mocked fetch**

Create `platform/server/tests/invoiceShelfClient.test.js`:

```js
const { makeInvoiceShelfClient } = require('../src/services/invoiceShelfClient');

async function run() {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'remote-1' } }),
      text: async () => JSON.stringify({ data: { id: 'remote-1' } }),
    };
  };

  const client = makeInvoiceShelfClient({
    baseUrl: 'https://invoice.example.test',
    token: 'token-123',
    companyId: 'company-7',
    timeoutMs: 1000,
  }, fakeFetch);

  const result = await client.createEstimate({ estimate_number: 'EST-1' });

  if (result.data.id !== 'remote-1') throw new Error('Expected normalized JSON result');
  if (calls[0].url !== 'https://invoice.example.test/api/v1/estimates') throw new Error(`Unexpected URL ${calls[0].url}`);
  if (calls[0].options.headers.Authorization !== 'Bearer token-123') throw new Error('Missing Bearer token');
  if (calls[0].options.headers['Company'] !== 'company-7') throw new Error('Missing company header');
  if (calls[0].options.method !== 'POST') throw new Error('Expected POST');
  console.log('InvoiceShelf client tests passed');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node platform/server/tests/invoiceShelfClient.test.js`

Expected: FAIL with `Cannot find module '../src/services/invoiceShelfClient'`.

- [ ] **Step 3: Implement the client**

Create `platform/server/src/services/invoiceShelfClient.js`:

```js
function cleanBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function makeInvoiceShelfError(message, details = {}) {
  const err = new Error(message);
  err.details = details;
  err.isInvoiceShelfError = true;
  return err;
}

function makeInvoiceShelfClient(config = {}, fetchImpl = global.fetch) {
  const baseUrl = cleanBaseUrl(config.baseUrl || process.env.INVOICESHELF_BASE_URL);
  const token = config.token || process.env.INVOICESHELF_API_TOKEN;
  const companyId = config.companyId || process.env.INVOICESHELF_COMPANY_ID;
  const timeoutMs = Number(config.timeoutMs || process.env.INVOICESHELF_TIMEOUT_MS || 12000);

  if (!baseUrl) throw makeInvoiceShelfError('InvoiceShelf base URL is not configured');
  if (!token) throw makeInvoiceShelfError('InvoiceShelf API token is not configured');
  if (!companyId) throw makeInvoiceShelfError('InvoiceShelf company id is not configured');
  if (typeof fetchImpl !== 'function') throw makeInvoiceShelfError('A fetch implementation is required');

  async function request(method, path, body) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const url = `${baseUrl}/api/v1${path.startsWith('/') ? path : `/${path}`}`;

    try {
      const res = await fetchImpl(url, {
        method,
        signal: controller ? controller.signal : undefined,
        headers: {
          Authorization: `Bearer ${token}`,
          Company: companyId,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: body == null ? undefined : JSON.stringify(body),
      });

      const text = await res.text();
      const parsed = text ? JSON.parse(text) : {};
      if (!res.ok) {
        throw makeInvoiceShelfError(`InvoiceShelf ${method} ${path} failed with ${res.status}`, {
          status: res.status,
          response: parsed,
        });
      }
      return parsed;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw makeInvoiceShelfError(`InvoiceShelf ${method} ${path} timed out after ${timeoutMs}ms`);
      }
      if (err.isInvoiceShelfError) throw err;
      throw makeInvoiceShelfError(`InvoiceShelf ${method} ${path} failed`, { cause: err.message });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    request,
    createCustomer: payload => request('POST', '/customers', payload),
    createEstimate: payload => request('POST', '/estimates', payload),
    convertEstimateToInvoice: estimateId => request('POST', `/estimates/${estimateId}/convert-to-invoice`),
    getInvoice: invoiceId => request('GET', `/invoices/${invoiceId}`),
    recordPayment: payload => request('POST', '/payments', payload),
  };
}

module.exports = { makeInvoiceShelfClient, makeInvoiceShelfError };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node platform/server/tests/invoiceShelfClient.test.js`

Expected: `InvoiceShelf client tests passed`

- [ ] **Step 5: Commit**

```bash
git add platform/server/src/services/invoiceShelfClient.js platform/server/tests/invoiceShelfClient.test.js
git commit -m "Add InvoiceShelf API client"
```

---

### Task 3: Map ABQ ADU Data Into InvoiceShelf Payloads

**Files:**
- Create: `platform/server/src/services/invoiceShelfMapper.js`
- Test: `platform/server/tests/invoiceShelfMapper.test.js`

**Interfaces:**
- Consumes ABQ rows from `clients`, `bids`, `bid_line_items`, `invoices`, and `payments`.
- Produces:
  - `mapClientToInvoiceShelfCustomer(client)`
  - `mapBidToInvoiceShelfEstimate({ client, bid, items, totals })`
  - `mapInvoiceToInvoiceShelfInvoice({ client, invoice })`
  - `mapPaymentToInvoiceShelfPayment({ invoice, payment })`

- [ ] **Step 1: Write mapper tests**

Create `platform/server/tests/invoiceShelfMapper.test.js`:

```js
const {
  mapClientToInvoiceShelfCustomer,
  mapBidToInvoiceShelfEstimate,
  mapInvoiceToInvoiceShelfInvoice,
  mapPaymentToInvoiceShelfPayment,
} = require('../src/services/invoiceShelfMapper');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const client = {
  id: 42,
  name: 'Julia Blog',
  email: 'julia@example.com',
  phone: '505-555-0100',
  address: '4027 Mackland Ave NE, Albuquerque, NM 87110',
};

const bid = {
  id: 9,
  bid_number: 'BID-2026-0009',
  title: 'Mackland Altura ADU',
  tax_pct: 7.625,
  valid_until: '2026-08-20',
};

const items = [
  { category: 'Construction', description: 'Altura 2BR ADU consumer build price', qty: 600, unit: 'sf', unit_cost: 285 },
  { category: 'Internal COGS', description: 'Muras SIP/PUR panel supplier comparison', qty: 1, unit: 'pkg', unit_cost: 16000, internal_only: true },
];

const customer = mapClientToInvoiceShelfCustomer(client);
assert(customer.name === 'Julia Blog', 'Customer name should map');
assert(customer.email === 'julia@example.com', 'Customer email should map');

const estimate = mapBidToInvoiceShelfEstimate({
  client,
  bid,
  items,
  totals: { total: 171000 },
});

assert(estimate.estimate_number === 'BID-2026-0009', 'Estimate number should use bid number');
assert(estimate.items.length === 1, 'Internal COGS item should not be customer-facing');
assert(estimate.items[0].name === 'Construction', 'Item name should use category');
assert(estimate.items[0].description.includes('Altura 2BR'), 'Customer-facing description should map');
assert(!JSON.stringify(estimate).includes('Muras SIP'), 'Internal supplier COGS must be excluded');

const inv = mapInvoiceToInvoiceShelfInvoice({
  client,
  invoice: { invoice_number: 'INV-2026-0001', description: '$10,000 Preconstruction Contract', amount: 10000, due_date: '2026-07-30' },
});
assert(inv.invoice_number === 'INV-2026-0001', 'Invoice number should map');
assert(inv.items[0].price === 10000, 'Preconstruction amount should map');

const payment = mapPaymentToInvoiceShelfPayment({
  invoice: { invoiceshelf_invoice_id: 'remote-invoice-1' },
  payment: { amount: 10000, method: 'check', reference: 'check 1001', paid_date: '2026-07-20' },
});
assert(payment.invoice_id === 'remote-invoice-1', 'Remote invoice id should map to payment');
assert(payment.amount === 10000, 'Payment amount should map');

console.log('InvoiceShelf mapper tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node platform/server/tests/invoiceShelfMapper.test.js`

Expected: FAIL with `Cannot find module '../src/services/invoiceShelfMapper'`.

- [ ] **Step 3: Implement mapper**

Create `platform/server/src/services/invoiceShelfMapper.js`:

```js
function centsSafeNumber(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function mapClientToInvoiceShelfCustomer(client = {}) {
  return {
    name: client.name || 'ABQ ADU Client',
    email: client.email || null,
    phone: client.phone || null,
    billing: {
      address_street_1: client.address || '',
      country_id: null,
      state: 'NM',
      city: 'Albuquerque',
    },
    notes: client.notes || '',
  };
}

function customerFacingItems(items = []) {
  return items.filter(item => !item.internal_only && !String(item.category || '').toLowerCase().includes('cogs'));
}

function mapBidToInvoiceShelfEstimate({ client, bid, items, totals }) {
  return {
    estimate_number: bid.bid_number || `BID-${bid.id}`,
    customer_name: client.name || 'ABQ ADU Client',
    expiry_date: bid.valid_until || null,
    status: 'DRAFT',
    notes: 'ABQ ADU planning estimate. Final contract depends on site review, utilities, sewer confirmation study, permitting, and engineering review.',
    tax_per_item: false,
    discount_per_item: false,
    items: customerFacingItems(items).map(item => ({
      name: item.category || 'ADU construction',
      description: item.description,
      quantity: centsSafeNumber(item.qty || 1),
      price: centsSafeNumber(item.unit_cost || 0),
      unit_name: item.unit || 'ea',
    })),
    custom_fields: {
      abq_bid_id: bid.id,
      abq_total: centsSafeNumber(totals && totals.total),
    },
  };
}

function mapInvoiceToInvoiceShelfInvoice({ client, invoice }) {
  return {
    invoice_number: invoice.invoice_number,
    customer_name: client.name || 'ABQ ADU Client',
    due_date: invoice.due_date || null,
    status: 'DRAFT',
    notes: 'ABQ ADU invoice generated from the builder platform.',
    items: [{
      name: invoice.draw_type || 'Construction draw',
      description: invoice.description || 'Construction draw',
      quantity: 1,
      price: centsSafeNumber(invoice.amount),
      unit_name: 'draw',
    }],
    custom_fields: {
      abq_invoice_id: invoice.id,
    },
  };
}

function mapPaymentToInvoiceShelfPayment({ invoice, payment }) {
  return {
    invoice_id: invoice.invoiceshelf_invoice_id,
    amount: centsSafeNumber(payment.amount),
    payment_date: payment.paid_date || new Date().toISOString().slice(0, 10),
    payment_method: payment.method || 'check',
    notes: payment.reference || '',
  };
}

module.exports = {
  mapClientToInvoiceShelfCustomer,
  mapBidToInvoiceShelfEstimate,
  mapInvoiceToInvoiceShelfInvoice,
  mapPaymentToInvoiceShelfPayment,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node platform/server/tests/invoiceShelfMapper.test.js`

Expected: `InvoiceShelf mapper tests passed`

- [ ] **Step 5: Commit**

```bash
git add platform/server/src/services/invoiceShelfMapper.js platform/server/tests/invoiceShelfMapper.test.js
git commit -m "Map ABQ ADU records to InvoiceShelf"
```

---

### Task 4: Add ABQ Invoice Engine Routes

**Files:**
- Create: `platform/server/src/routes/invoiceEngine.js`
- Modify: `platform/server/src/index.js`
- Test: `platform/server/tests/invoiceEngine.routes.test.js`

**Interfaces:**
- Consumes `makeInvoiceShelfClient()` from Task 2.
- Consumes mapper functions from Task 3.
- Produces routes:
  - `POST /api/invoice-engine/customers/:clientId/sync`
  - `POST /api/invoice-engine/bids/:bidId/estimate`
  - `POST /api/invoice-engine/estimates/:bidId/convert`
  - `POST /api/invoice-engine/invoices/:invoiceId/sync`
  - `POST /api/invoice-engine/invoices/:invoiceId/status`

- [ ] **Step 1: Write route test with mocked client**

Create `platform/server/tests/invoiceEngine.routes.test.js`:

```js
const fs = require('fs');

const routeFile = 'platform/server/src/routes/invoiceEngine.js';
const indexFile = 'platform/server/src/index.js';

function assertIncludes(file, text) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}

assertIncludes(routeFile, "router.post('/customers/:clientId/sync'");
assertIncludes(routeFile, "router.post('/bids/:bidId/estimate'");
assertIncludes(routeFile, "router.post('/estimates/:bidId/convert'");
assertIncludes(routeFile, "router.post('/invoices/:invoiceId/sync'");
assertIncludes(routeFile, "router.post('/invoices/:invoiceId/status'");
assertIncludes(indexFile, "app.use('/api/invoice-engine'");

console.log('Invoice engine route static checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node platform/server/tests/invoiceEngine.routes.test.js`

Expected: FAIL because `platform/server/src/routes/invoiceEngine.js` does not exist.

- [ ] **Step 3: Implement routes**

Create `platform/server/src/routes/invoiceEngine.js`:

```js
const router = require('express').Router();
const { pool } = require('../db');
const { computeBidTotals } = require('../services/bidCalc');
const { makeInvoiceShelfClient } = require('../services/invoiceShelfClient');
const {
  mapClientToInvoiceShelfCustomer,
  mapBidToInvoiceShelfEstimate,
  mapInvoiceToInvoiceShelfInvoice,
} = require('../services/invoiceShelfMapper');

function remoteId(result) {
  return String(result?.data?.id || result?.id || '');
}

async function event(localType, localId, eventType, message, payload = {}) {
  await pool.query(
    `INSERT INTO invoice_engine_events (local_type, local_id, event_type, message, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [localType, localId || null, eventType, message, payload]
  );
}

router.post('/customers/:clientId/sync', async (req, res) => {
  const clientRes = await pool.query('SELECT * FROM clients WHERE id=$1', [req.params.clientId]);
  if (!clientRes.rows.length) return res.status(404).json({ error: 'Client not found' });

  const client = clientRes.rows[0];
  const api = makeInvoiceShelfClient();
  try {
    const result = await api.createCustomer(mapClientToInvoiceShelfCustomer(client));
    const id = remoteId(result);
    await pool.query(
      `UPDATE clients SET invoiceshelf_customer_id=$1, invoiceshelf_last_sync_at=NOW(), invoiceshelf_sync_error=NULL WHERE id=$2`,
      [id, client.id]
    );
    await event('client', client.id, 'synced', `Client synced to InvoiceShelf customer ${id}`, result);
    res.json({ ok: true, invoiceshelf_customer_id: id, result });
  } catch (err) {
    await pool.query('UPDATE clients SET invoiceshelf_sync_error=$1 WHERE id=$2', [err.message, client.id]);
    await event('client', client.id, 'error', err.message, err.details || {});
    res.status(502).json({ error: err.message, details: err.details || {} });
  }
});

router.post('/bids/:bidId/estimate', async (req, res) => {
  const bidRes = await pool.query('SELECT * FROM bids WHERE id=$1', [req.params.bidId]);
  if (!bidRes.rows.length) return res.status(404).json({ error: 'Bid not found' });
  const bid = bidRes.rows[0];
  const clientRes = await pool.query('SELECT * FROM clients WHERE id=$1', [bid.client_id]);
  const itemRes = await pool.query('SELECT * FROM bid_line_items WHERE bid_id=$1 ORDER BY sort_order, id', [bid.id]);
  const client = clientRes.rows[0] || {};
  const totals = computeBidTotals(itemRes.rows, bid);
  const api = makeInvoiceShelfClient();

  try {
    const result = await api.createEstimate(mapBidToInvoiceShelfEstimate({ client, bid, items: itemRes.rows, totals }));
    const id = remoteId(result);
    await pool.query(
      `UPDATE bids SET invoiceshelf_estimate_id=$1, invoiceshelf_last_sync_at=NOW(), invoiceshelf_sync_error=NULL WHERE id=$2`,
      [id, bid.id]
    );
    await event('bid', bid.id, 'estimate_created', `Estimate synced to InvoiceShelf ${id}`, result);
    res.json({ ok: true, invoiceshelf_estimate_id: id, result });
  } catch (err) {
    await pool.query('UPDATE bids SET invoiceshelf_sync_error=$1 WHERE id=$2', [err.message, bid.id]);
    await event('bid', bid.id, 'error', err.message, err.details || {});
    res.status(502).json({ error: err.message, details: err.details || {} });
  }
});

router.post('/estimates/:bidId/convert', async (req, res) => {
  const bidRes = await pool.query('SELECT * FROM bids WHERE id=$1', [req.params.bidId]);
  if (!bidRes.rows.length) return res.status(404).json({ error: 'Bid not found' });
  const bid = bidRes.rows[0];
  if (!bid.invoiceshelf_estimate_id) return res.status(409).json({ error: 'Bid has not been synced to an InvoiceShelf estimate yet' });

  const api = makeInvoiceShelfClient();
  try {
    const result = await api.convertEstimateToInvoice(bid.invoiceshelf_estimate_id);
    await event('bid', bid.id, 'estimate_converted', `InvoiceShelf estimate ${bid.invoiceshelf_estimate_id} converted`, result);
    res.json({ ok: true, result });
  } catch (err) {
    await event('bid', bid.id, 'error', err.message, err.details || {});
    res.status(502).json({ error: err.message, details: err.details || {} });
  }
});

router.post('/invoices/:invoiceId/sync', async (req, res) => {
  const invRes = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.invoiceId]);
  if (!invRes.rows.length) return res.status(404).json({ error: 'Invoice not found' });
  const invoice = invRes.rows[0];
  const clientRes = await pool.query('SELECT * FROM clients WHERE id=$1', [invoice.client_id]);
  const client = clientRes.rows[0] || {};
  const api = makeInvoiceShelfClient();

  try {
    const result = await api.request('POST', '/invoices', mapInvoiceToInvoiceShelfInvoice({ client, invoice }));
    const id = remoteId(result);
    const publicUrl = result?.data?.view_url || result?.data?.public_url || null;
    await pool.query(
      `UPDATE invoices SET invoiceshelf_invoice_id=$1, invoiceshelf_public_url=$2, invoiceshelf_last_sync_at=NOW(), invoiceshelf_sync_error=NULL WHERE id=$3`,
      [id, publicUrl, invoice.id]
    );
    await event('invoice', invoice.id, 'invoice_synced', `Invoice synced to InvoiceShelf ${id}`, result);
    res.json({ ok: true, invoiceshelf_invoice_id: id, invoiceshelf_public_url: publicUrl, result });
  } catch (err) {
    await pool.query('UPDATE invoices SET invoiceshelf_sync_error=$1 WHERE id=$2', [err.message, invoice.id]);
    await event('invoice', invoice.id, 'error', err.message, err.details || {});
    res.status(502).json({ error: err.message, details: err.details || {} });
  }
});

router.post('/invoices/:invoiceId/status', async (req, res) => {
  const invRes = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.invoiceId]);
  if (!invRes.rows.length) return res.status(404).json({ error: 'Invoice not found' });
  const invoice = invRes.rows[0];
  if (!invoice.invoiceshelf_invoice_id) return res.status(409).json({ error: 'Invoice has not been synced to InvoiceShelf yet' });

  const api = makeInvoiceShelfClient();
  try {
    const result = await api.getInvoice(invoice.invoiceshelf_invoice_id);
    const status = String(result?.data?.status || invoice.status || 'draft').toLowerCase();
    const publicUrl = result?.data?.view_url || result?.data?.public_url || invoice.invoiceshelf_public_url || null;
    await pool.query('UPDATE invoices SET status=$1, invoiceshelf_public_url=$2, invoiceshelf_last_sync_at=NOW() WHERE id=$3', [status, publicUrl, invoice.id]);
    await event('invoice', invoice.id, 'status_synced', `InvoiceShelf status synced as ${status}`, result);
    res.json({ ok: true, status, invoiceshelf_public_url: publicUrl, result });
  } catch (err) {
    await event('invoice', invoice.id, 'error', err.message, err.details || {});
    res.status(502).json({ error: err.message, details: err.details || {} });
  }
});

module.exports = router;
```

- [ ] **Step 4: Register route**

Add to `platform/server/src/index.js` after the existing invoice route:

```js
app.use('/api/invoice-engine', require('./routes/invoiceEngine'));
```

- [ ] **Step 5: Run route static check**

Run: `node platform/server/tests/invoiceEngine.routes.test.js`

Expected: `Invoice engine route static checks passed`

- [ ] **Step 6: Commit**

```bash
git add platform/server/src/routes/invoiceEngine.js platform/server/src/index.js platform/server/tests/invoiceEngine.routes.test.js
git commit -m "Add InvoiceShelf invoice engine routes"
```

---

### Task 5: Update Builder UI For InvoiceShelf Sync

**Files:**
- Modify: `platform/client/src/pages/BidBuilder.jsx`
- Modify: `platform/client/src/pages/Invoices.jsx`
- Test: `tests/platform-invoiceshelf-ui.test.js`

**Interfaces:**
- Consumes routes from Task 4.
- Produces UI actions:
  - `Create InvoiceShelf Estimate`
  - `Convert Estimate`
  - `Sync InvoiceShelf Status`
  - `Open Client View`

- [ ] **Step 1: Add UI static test**

Create `tests/platform-invoiceshelf-ui.test.js`:

```js
const fs = require('fs');

const bidBuilder = fs.readFileSync('platform/client/src/pages/BidBuilder.jsx', 'utf8');
const invoices = fs.readFileSync('platform/client/src/pages/Invoices.jsx', 'utf8');

function contains(content, text, file) {
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}

contains(bidBuilder, 'Create InvoiceShelf Estimate', 'BidBuilder.jsx');
contains(bidBuilder, '/api/invoice-engine/bids/', 'BidBuilder.jsx');
contains(invoices, 'Sync InvoiceShelf Status', 'Invoices.jsx');
contains(invoices, 'Open Client View', 'Invoices.jsx');
contains(invoices, 'invoiceshelf_public_url', 'Invoices.jsx');

console.log('InvoiceShelf UI static checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/platform-invoiceshelf-ui.test.js`

Expected: FAIL because UI strings are not present yet.

- [ ] **Step 3: Add bid sync action**

In `platform/client/src/pages/BidBuilder.jsx`, add this function near existing bid actions:

```jsx
const createInvoiceShelfEstimate = async () => {
  if (!active?.id) return;
  const res = await fetch(`/api/invoice-engine/bids/${active.id}/estimate`, { method: 'POST' });
  const payload = await res.json();
  if (!res.ok) {
    alert(payload.error || 'InvoiceShelf estimate sync failed');
    return;
  }
  alert(`InvoiceShelf estimate created: ${payload.invoiceshelf_estimate_id}`);
  load();
};
```

Add this button in the active bid actions area:

```jsx
<button onClick={createInvoiceShelfEstimate} style={{ background: '#0F1F3D', color: '#FFF', border: 'none', borderRadius: 6, padding: '10px 12px', fontWeight: 700 }}>
  Create InvoiceShelf Estimate
</button>
```

- [ ] **Step 4: Add invoice status/client view actions**

In `platform/client/src/pages/Invoices.jsx`, add this function next to `downloadPdf`:

```jsx
const syncInvoiceShelfStatus = async (inv) => {
  const res = await fetch(`/api/invoice-engine/invoices/${inv.id}/status`, { method: 'POST' });
  const payload = await res.json();
  if (!res.ok) {
    alert(payload.error || 'InvoiceShelf status sync failed');
    return;
  }
  load();
};
```

Add these buttons next to the existing PDF button:

```jsx
<button onClick={() => syncInvoiceShelfStatus(inv)}
  style={{ background: 'none', border: '1px solid #0F1F3D', color: '#0F1F3D', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer', marginLeft: 6 }}>
  Sync InvoiceShelf Status
</button>
{inv.invoiceshelf_public_url && (
  <button onClick={() => window.open(inv.invoiceshelf_public_url, '_blank', 'noopener')}
    style={{ background: '#C4954A', border: '1px solid #C4954A', color: '#1C1917', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer', marginLeft: 6 }}>
    Open Client View
  </button>
)}
```

- [ ] **Step 5: Run UI static check**

Run: `node tests/platform-invoiceshelf-ui.test.js`

Expected: `InvoiceShelf UI static checks passed`

- [ ] **Step 6: Commit**

```bash
git add platform/client/src/pages/BidBuilder.jsx platform/client/src/pages/Invoices.jsx tests/platform-invoiceshelf-ui.test.js
git commit -m "Expose InvoiceShelf sync actions in builder UI"
```

---

### Task 6: Keep Static Version 8 Prototype Honest

**Files:**
- Modify: `platform.html`
- Test: `tests/platform-bid-app.test.js`

**Interfaces:**
- Consumes no backend.
- Produces visible text making clear InvoiceShelf is the future back-office engine while static preview remains local.

- [ ] **Step 1: Add static copy test**

Add to `tests/platform-bid-app.test.js`:

```js
contains('InvoiceShelf back-office engine');
contains('ABQ ADU remains the builder cockpit');
contains('Sync to InvoiceShelf');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/platform-bid-app.test.js`

Expected: FAIL until `platform.html` contains the new copy.

- [ ] **Step 3: Update static platform copy**

In `platform.html`, add a small card inside the `Estimates & Invoices` panel:

```html
<div class="estimate-print-note">
  <b>InvoiceShelf back-office engine:</b> ABQ ADU remains the builder cockpit for model, square footage, COGS, supplier bidout, and schedule. InvoiceShelf will handle professional estimate/invoice records, client views, status sync, and payment tracking behind the scenes.
</div>
```

Add a future-action button near the existing estimate actions:

```html
<button class="btn ghost" type="button" onclick="alert('Backend connection pending: this will sync the current estimate to InvoiceShelf once the invoice-engine API is connected.')">Sync to InvoiceShelf</button>
```

- [ ] **Step 4: Run static test**

Run: `node tests/platform-bid-app.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform.html tests/platform-bid-app.test.js
git commit -m "Document InvoiceShelf engine in static builder prototype"
```

---

### Task 7: Docker Sandbox And Manual Proof

**Files:**
- Create: `docs/invoiceshelf-local-sandbox.md`
- No repo vendoring of InvoiceShelf source.

**Interfaces:**
- Produces repeatable manual setup instructions.
- Consumes InvoiceShelf Docker docs and API docs.

- [ ] **Step 1: Write sandbox guide**

Create `docs/invoiceshelf-local-sandbox.md`:

```markdown
# InvoiceShelf Local Sandbox

InvoiceShelf is used as the back-office estimate/invoice engine. ABQ ADU does not vendor or modify InvoiceShelf source code.

## Sandbox Target

- Repository: https://github.com/InvoiceShelf/InvoiceShelf/tree/3.x
- Docs: https://docs.invoiceshelf.com/
- API docs: https://api-docs.invoiceshelf.com/
- License: AGPL-3.0

## Local Startup

1. Follow the InvoiceShelf Docker install guide for the selected release.
2. Create one ABQ ADU company.
3. Add ABQ ADU logo, phone `505-977-7659`, and address `131 Madison NE, Albuquerque, NM 87108`.
4. Create an API token.
5. Put the token and company id into `platform/server/.env`.

## ABQ ADU Environment

```dotenv
INVOICESHELF_BASE_URL=http://localhost:8080
INVOICESHELF_API_TOKEN=replace-with-token
INVOICESHELF_COMPANY_ID=replace-with-company-id
INVOICESHELF_TIMEOUT_MS=12000
```

## Manual Proof

1. Create or select an ABQ ADU client.
2. Create a bid with a customer-facing line item.
3. Sync the client to InvoiceShelf.
4. Sync the bid to an InvoiceShelf estimate.
5. Confirm internal COGS and supplier comparison lines are absent from the InvoiceShelf estimate.
6. Convert the estimate after customer approval.
7. Generate the ABQ ADU draw schedule.
8. Sync Invoice 1 as `$10,000 Preconstruction Contract`.
9. Open the InvoiceShelf client view.
10. Sync status back into ABQ ADU.
```

- [ ] **Step 2: Commit**

```bash
git add docs/invoiceshelf-local-sandbox.md
git commit -m "Document InvoiceShelf local sandbox"
```

---

## Testing Strategy

- Unit test the API client with mocked fetch.
- Unit test mapping to prove internal COGS and supplier margin data never appear in InvoiceShelf customer documents.
- Static route tests ensure the adapter endpoints exist.
- Existing `node tests/platform-bid-app.test.js` stays green.
- Manual sandbox test proves one full path: client -> estimate -> invoice -> client view -> status sync.

## Potential Risks And Gotchas

- **InvoiceShelf 3.x alpha risk:** Keep the adapter narrow and do not let UI code call InvoiceShelf directly. If 3.x endpoints change, only `invoiceShelfClient.js` and mapper tests should need edits.
- **AGPL risk:** Do not copy InvoiceShelf source into ABQ ADU or modify it for the first release. Run it as a separate self-hosted service.
- **API shape drift:** Confirm endpoint paths against the exact InvoiceShelf version before implementing Task 2. If `Company` header or endpoint names differ, update the client test and client together in the same task.
- **Duplicate customers:** Use `invoiceshelf_customer_id` when present. Do not create a new remote customer on every sync.
- **Internal pricing exposure:** Mapper tests must fail if internal COGS, supplier names, or margin-only lines are included in customer-facing payloads.
- **Offline job-site use:** ABQ ADU local bid, local print, and local PDF fallback stay functional even when InvoiceShelf is unreachable.

## Rollback Plan

- Disable InvoiceShelf routes by removing `app.use('/api/invoice-engine', require('./routes/invoiceEngine'));`.
- Keep all existing `/api/invoices` behavior intact.
- Leave sync columns unused; they are additive and do not affect local invoice generation.
- Revert UI buttons without deleting local bids, invoices, or payments.

