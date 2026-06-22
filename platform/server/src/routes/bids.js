const router = require('express').Router();
const puppeteer = require('puppeteer');
const { pool } = require('../db');
const { computeBidTotals, bomToLineItems } = require('../services/bidCalc');
const { generateBOM } = require('../services/bomGenerator');

async function loadBid(id) {
  const bidRes = await pool.query(
    `SELECT b.*, c.name AS client_name, c.email AS client_email,
            c.phone AS client_phone, c.address AS client_address
     FROM bids b LEFT JOIN clients c ON c.id=b.client_id WHERE b.id=$1`,
    [id]
  );
  if (!bidRes.rows.length) return null;
  const itemsRes = await pool.query(
    'SELECT * FROM bid_line_items WHERE bid_id=$1 ORDER BY sort_order, id', [id]
  );
  const bid = bidRes.rows[0];
  const items = itemsRes.rows;
  return { ...bid, items, totals: computeBidTotals(items, bid) };
}

async function nextBidNumber() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM bids");
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
  const bid_number = await nextBidNumber();

  const { rows } = await pool.query(
    `INSERT INTO bids (client_id, project_id, design_id, bid_number, title,
       markup_pct, tax_pct, contingency_pct, notes, valid_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [client_id || null, project_id || null, design_id || null, bid_number,
     title || 'ADU Estimate', markup_pct ?? 18.0, tax_pct ?? 7.625,
     contingency_pct ?? 5.0, notes || null, valid_until || null]
  );
  const bid = rows[0];

  if (Array.isArray(items) && items.length) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await pool.query(
        `INSERT INTO bid_line_items (bid_id, category, description, qty, unit, unit_cost, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [bid.id, it.category || null, it.description, it.qty ?? 1,
         it.unit || 'ea', it.unit_cost ?? 0, it.sort_order ?? i]
      );
    }
  }
  res.status(201).json(await loadBid(bid.id));
});

// Create a bid from a design's BOM
router.post('/from-design/:designId', async (req, res) => {
  const designRes = await pool.query('SELECT * FROM designs WHERE id=$1', [req.params.designId]);
  if (!designRes.rows.length) return res.status(404).json({ error: 'Design not found' });
  const design = designRes.rows[0];
  const bom = generateBOM(design.rooms);
  const items = bomToLineItems(bom);
  const bid_number = await nextBidNumber();

  const { client_id, project_id } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO bids (client_id, project_id, design_id, bid_number, title, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [client_id || null, project_id || null, design.id, bid_number,
     `${design.name} — Estimate`, `Auto-generated from floor plan (${bom.totalSf} sf)`]
  );
  const bid = rows[0];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await pool.query(
      `INSERT INTO bid_line_items (bid_id, category, description, qty, unit, unit_cost, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [bid.id, it.category, it.description, it.qty, it.unit, it.unit_cost, it.sort_order]
    );
  }
  res.status(201).json(await loadBid(bid.id));
});

// Update bid (header fields + full line item replace)
router.put('/:id', async (req, res) => {
  const { title, status, markup_pct, tax_pct, contingency_pct,
          notes, valid_until, client_id, items } = req.body;
  await pool.query(
    `UPDATE bids SET title=COALESCE($1,title), status=COALESCE($2,status),
       markup_pct=COALESCE($3,markup_pct), tax_pct=COALESCE($4,tax_pct),
       contingency_pct=COALESCE($5,contingency_pct), notes=$6,
       valid_until=$7, client_id=COALESCE($8,client_id), updated_at=NOW()
     WHERE id=$9`,
    [title, status, markup_pct, tax_pct, contingency_pct, notes,
     valid_until || null, client_id, req.params.id]
  );

  if (Array.isArray(items)) {
    await pool.query('DELETE FROM bid_line_items WHERE bid_id=$1', [req.params.id]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await pool.query(
        `INSERT INTO bid_line_items (bid_id, category, description, qty, unit, unit_cost, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, it.category || null, it.description, it.qty ?? 1,
         it.unit || 'ea', it.unit_cost ?? 0, it.sort_order ?? i]
      );
    }
  }
  const bid = await loadBid(req.params.id);
  if (!bid) return res.status(404).json({ error: 'Not found' });
  res.json(bid);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM bids WHERE id=$1', [req.params.id]);
  res.status(204).end();
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

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'Letter', margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await browser.close();
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${bid.bid_number}.pdf"` });
  res.send(pdf);
});

module.exports = router;
