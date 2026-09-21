const router = require('../asyncRouter')();
const puppeteer = require('puppeteer');
const { pool } = require('../db');
const { computeBidTotals, bomToLineItems } = require('../services/bidCalc');
const { generateBOM } = require('../services/bomGenerator');

async function transaction(work) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

function requestedTerms(body, bid) {
  return {
    title: body.title ?? bid.title,
    status: body.status ?? bid.status,
    markup_pct: body.markup_pct ?? bid.markup_pct,
    tax_pct: body.tax_pct ?? bid.tax_pct,
    contingency_pct: body.contingency_pct ?? bid.contingency_pct,
    notes: body.notes === undefined ? bid.notes : body.notes,
    valid_until: body.valid_until === undefined ? bid.valid_until : body.valid_until || null,
    client_id: body.client_id ?? bid.client_id,
  };
}

const nullable = value => value == null || value === '' ? null : value;
const numeric = value => nullable(value) == null ? null : Number.isFinite(Number(value)) ? Number(value) : `invalid:${String(value)}`;
const day = value => value ? (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10) : null;
function canonicalTerms(value) {
  return [value.title, numeric(value.client_id), numeric(value.markup_pct), numeric(value.tax_pct),
    numeric(value.contingency_pct), nullable(value.notes), day(value.valid_until)];
}
function canonicalItems(items) {
  return items.map((item, index) => item && [nullable(item.category), item.description,
    numeric(item.qty === undefined ? 1 : item.qty), nullable(item.unit === undefined ? 'ea' : item.unit),
    numeric(item.unit_cost === undefined ? 0 : item.unit_cost), numeric(item.sort_order ?? index)]);
}

async function changeBid(req, res, change) {
  const result = await transaction(async db => {
    const { rows } = await db.query('SELECT * FROM bids WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!rows.length) return { status: 404, body: { error: 'Not found' } };
    const bid = rows[0];
    if (bid.invoiceshelf_estimate_id || bid.invoiceshelf_sync_error != null) {
      if (req.method === 'PUT') {
        const body = req.body || {};
        const next = requestedTerms(body, bid);
        const items = (await db.query('SELECT * FROM bid_line_items WHERE bid_id=$1 ORDER BY sort_order, id', [bid.id])).rows;
        const unchangedTerms = JSON.stringify(canonicalTerms(next)) === JSON.stringify(canonicalTerms(bid));
        const unchangedItems = body.items === undefined || (Array.isArray(body.items)
          && JSON.stringify(canonicalItems(body.items)) === JSON.stringify(canonicalItems(items)));
        if (unchangedTerms && unchangedItems) {
          // The editor saves before PDF/export actions. Preserve item identities
          // and the export snapshot for a no-op; lifecycle status is local only.
          if (next.status !== bid.status) await db.query('UPDATE bids SET status=$1,updated_at=NOW() WHERE id=$2', [next.status, bid.id]);
          return { status: 200, body: await loadBid(bid.id, db) };
        }
      }
      return { status: 409, body: { error: 'This bid has a pending or linked InvoiceShelf estimate. Reconcile it before editing or deleting.' } };
    }
    return { status: req.method === 'DELETE' ? 204 : 200, body: await change(db, bid) };
  });
  if (result.status === 204) return res.status(204).end();
  return res.status(result.status).json(result.body);
}

async function insertItems(db, bidId, items) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await db.query(
      `INSERT INTO bid_line_items (bid_id, category, description, qty, unit, unit_cost, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [bidId, item.category || null, item.description, item.qty ?? 1,
       item.unit || 'ea', item.unit_cost ?? 0, item.sort_order ?? i]
    );
  }
}

async function loadBid(id, db = pool) {
  const bidRes = await db.query(
    `SELECT b.*, c.name AS client_name, c.email AS client_email,
            c.phone AS client_phone, c.address AS client_address
     FROM bids b LEFT JOIN clients c ON c.id=b.client_id WHERE b.id=$1`,
    [id]
  );
  if (!bidRes.rows.length) return null;
  const itemsRes = await db.query(
    'SELECT * FROM bid_line_items WHERE bid_id=$1 ORDER BY sort_order, id', [id]
  );
  const bid = bidRes.rows[0];
  const items = itemsRes.rows;
  return { ...bid, items, totals: computeBidTotals(items, bid) };
}

async function nextBidNumber(db = pool) {
  const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM bids");
  const seq = String(rows[0].n + 1).padStart(4, '0');
  return `BID-${new Date().getFullYear()}-${seq}`;
}

// List bids
router.get('/', async (req, res) => {
  const { client_id } = req.query;
  const where = client_id ? 'WHERE b.client_id=$1' : '';
  const params = client_id ? [client_id] : [];
  const { rows } = await pool.query(
    `SELECT b.*, c.name AS client_name FROM bids b
     LEFT JOIN clients c ON c.id=b.client_id ${where}
     ORDER BY b.created_at DESC`, params
  );
  res.json(rows);
});

// Get one bid with line items + totals
router.get('/:id', async (req, res) => {
  const bid = await loadBid(req.params.id);
  if (!bid) return res.status(404).json({ error: 'Not found' });
  res.json(bid);
});

// Create bid
router.post('/', async (req, res) => {
  const { client_id, project_id, design_id, title, markup_pct,
          tax_pct, contingency_pct, notes, valid_until, items } = req.body;
  const bid = await transaction(async db => {
    const bid_number = await nextBidNumber(db);
    const { rows } = await db.query(
      `INSERT INTO bids (client_id, project_id, design_id, bid_number, title,
         markup_pct, tax_pct, contingency_pct, notes, valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [client_id || null, project_id || null, design_id || null, bid_number,
       title || 'ADU Estimate', markup_pct ?? 18.0, tax_pct ?? 7.625,
       contingency_pct ?? 5.0, notes || null, valid_until || null]
    );
    if (Array.isArray(items)) await insertItems(db, rows[0].id, items);
    return loadBid(rows[0].id, db);
  });
  res.status(201).json(bid);
});

// Create a bid from a design's BOM
router.post('/from-design/:designId', async (req, res) => {
  const designRes = await pool.query('SELECT * FROM designs WHERE id=$1', [req.params.designId]);
  if (!designRes.rows.length) return res.status(404).json({ error: 'Design not found' });
  const design = designRes.rows[0];
  const bom = generateBOM(design.rooms);
  const items = bomToLineItems(bom);
  const { client_id, project_id } = req.body;
  const bid = await transaction(async db => {
    const bid_number = await nextBidNumber(db);
    const { rows } = await db.query(
      `INSERT INTO bids (client_id, project_id, design_id, bid_number, title, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [client_id || null, project_id || null, design.id, bid_number,
       `${design.name} — Estimate`, `Auto-generated from floor plan (${bom.totalSf} sf)`]
    );
    await insertItems(db, rows[0].id, items);
    return loadBid(rows[0].id, db);
  });
  res.status(201).json(bid);
});

// Update bid (header fields + full line item replace)
router.put('/:id', async (req, res) => {
  return changeBid(req, res, async (db, bid) => {
    const body = req.body || {};
    const next = requestedTerms(body, bid);
    await db.query(
      `UPDATE bids SET title=$1, status=$2, markup_pct=$3, tax_pct=$4,
         contingency_pct=$5, notes=$6, valid_until=$7, client_id=$8, updated_at=NOW()
       WHERE id=$9`,
      [next.title, next.status, next.markup_pct, next.tax_pct, next.contingency_pct,
       next.notes, next.valid_until, next.client_id, bid.id]
    );
    if (Array.isArray(body.items)) {
      await db.query('DELETE FROM bid_line_items WHERE bid_id=$1', [bid.id]);
      await insertItems(db, bid.id, body.items);
    }
    return loadBid(bid.id, db);
  });
});

router.delete('/:id', async (req, res) => {
  return changeBid(req, res, (db, bid) => db.query('DELETE FROM bids WHERE id=$1', [bid.id]));
});

// Generate branded PDF proposal
router.post('/:id/pdf', async (req, res) => {
  const bid = await loadBid(req.params.id);
  if (!bid) return res.status(404).json({ error: 'Not found' });
  const t = bid.totals;
  const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { font-family: 'Helvetica Neue', sans-serif; color:#1C1917; margin:0; padding:40px 56px; font-size:13px; }
  .header { border-bottom:3px solid #C4954A; padding-bottom:20px; margin-bottom:28px; display:flex; justify-content:space-between; align-items:flex-end; }
  .logo { font-size:24px; font-weight:900; color:#1C1917; } .logo span { color:#C4954A; }
  .meta { text-align:right; font-size:11px; color:#78716C; }
  .meta strong { color:#1C1917; font-size:14px; }
  .parties { display:flex; justify-content:space-between; margin-bottom:24px; gap:40px; }
  .party { font-size:12px; } .party h3 { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#C4954A; margin:0 0 6px; }
  h2 { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#C4954A; margin:24px 0 10px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { background:#F5F0E8; padding:8px 10px; text-align:left; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#78716C; }
  th.r, td.r { text-align:right; }
  td { padding:8px 10px; border-bottom:1px solid #EFE9DE; }
  .cat { font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#A8A29E; padding-top:14px; }
  .totals { margin-top:20px; margin-left:auto; width:300px; }
  .totals tr td { border:none; padding:5px 0; }
  .totals .grand td { border-top:2px solid #1C1917; padding-top:10px; font-size:18px; font-weight:900; }
  .grand .amt { color:#C4954A; }
  footer { margin-top:48px; padding-top:16px; border-top:1px solid #EFE9DE; font-size:10px; color:#A8A29E; display:flex; justify-content:space-between; }
  </style></head><body>
  <div class="header">
    <div><div class="logo">ABQ <span>ADU</span></div>
      <div style="font-size:13px;color:#78716C;margin-top:4px;">Construction Estimate</div></div>
    <div class="meta"><strong>${bid.bid_number}</strong>
      <div>${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
      ${bid.valid_until ? `<div>Valid until ${bid.valid_until}</div>` : ''}</div>
  </div>
  <div class="parties">
    <div class="party"><h3>Prepared For</h3>
      <div><strong>${bid.client_name || '—'}</strong></div>
      ${bid.client_address ? `<div>${bid.client_address}</div>` : ''}
      ${bid.client_email ? `<div>${bid.client_email}</div>` : ''}
      ${bid.client_phone ? `<div>${bid.client_phone}</div>` : ''}</div>
    <div class="party" style="text-align:right;"><h3>Project</h3>
      <div><strong>${bid.title}</strong></div></div>
  </div>
  <h2>Scope &amp; Line Items</h2>
  <table><thead><tr><th>Description</th><th class="r">Qty</th><th>Unit</th><th class="r">Unit Cost</th><th class="r">Total</th></tr></thead><tbody>
  ${(() => {
    let lastCat = null; let html = '';
    bid.items.forEach(i => {
      if (i.category !== lastCat) { html += `<tr><td colspan="5" class="cat">${i.category || 'General'}</td></tr>`; lastCat = i.category; }
      const lineTotal = parseFloat(i.qty) * parseFloat(i.unit_cost);
      html += `<tr><td>${i.description}</td><td class="r">${Number(i.qty).toLocaleString()}</td><td>${i.unit}</td><td class="r">${fmt(i.unit_cost)}</td><td class="r">${fmt(lineTotal)}</td></tr>`;
    });
    return html;
  })()}
  </tbody></table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="r">${fmt(t.subtotal)}</td></tr>
    <tr><td>Overhead &amp; profit (${bid.markup_pct}%)</td><td class="r">${fmt(t.markup)}</td></tr>
    <tr><td>Contingency (${bid.contingency_pct}%)</td><td class="r">${fmt(t.contingency)}</td></tr>
    <tr><td>NM gross receipts tax (${bid.tax_pct}%)</td><td class="r">${fmt(t.tax)}</td></tr>
    <tr class="grand"><td>Total Estimate</td><td class="r amt">${fmt(t.total)}</td></tr>
  </table>
  ${bid.notes ? `<h2>Notes</h2><div style="font-size:12px;color:#57534E;">${bid.notes}</div>` : ''}
  <footer><span>ABQ ADU — Albuquerque, NM · Licensed &amp; Insured</span><span>${bid.bid_number}</span></footer>
  </body></html>`;

  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'Letter', margin: { top: '0', bottom: '0', left: '0', right: '0' } });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${bid.bid_number}.pdf"` });
    res.send(pdf);
  } catch (err) {
    console.error('[pdf] bid export failed:', err.message);
    res.status(503).json({ error: 'PDF export is unavailable on this server (headless Chromium not installed). Install Chromium/puppeteer deps to enable.' });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
