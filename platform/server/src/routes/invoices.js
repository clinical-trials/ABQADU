const router = require('express').Router();
const puppeteer = require('puppeteer');
const { pool } = require('../db');
const { computeBidTotals, buildDrawSchedule } = require('../services/bidCalc');

async function paidTotal(invoiceId) {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(amount),0)::numeric AS paid FROM payments WHERE invoice_id=$1',
    [invoiceId]
  );
  return parseFloat(rows[0].paid);
}

async function nextInvoiceNumber() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM invoices');
  const seq = String(rows[0].n + 1).padStart(4, '0');
  return `INV-${new Date().getFullYear()}-${seq}`;
}

// List invoices (optionally by client/project/bid) with paid + balance
router.get('/', async (req, res) => {
  const { client_id, project_id, bid_id } = req.query;
  const conds = [];
  const params = [];
  if (client_id)  { params.push(client_id);  conds.push(`i.client_id=$${params.length}`); }
  if (project_id) { params.push(project_id); conds.push(`i.project_id=$${params.length}`); }
  if (bid_id)     { params.push(bid_id);     conds.push(`i.bid_id=$${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT i.*, c.name AS client_name,
       COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0) AS paid,
       (i.amount - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0)) AS balance
     FROM invoices i LEFT JOIN clients c ON c.id=i.client_id
     ${where} ORDER BY i.created_at DESC`, params
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address
     FROM invoices i LEFT JOIN clients c ON c.id=i.client_id WHERE i.id=$1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const payRes = await pool.query(
    'SELECT * FROM payments WHERE invoice_id=$1 ORDER BY paid_date', [req.params.id]
  );
  const inv = rows[0];
  const paid = await paidTotal(inv.id);
  res.json({ ...inv, payments: payRes.rows, paid, balance: parseFloat(inv.amount) - paid });
});

// Create a single invoice
router.post('/', async (req, res) => {
  const { bid_id, client_id, project_id, draw_type, description,
          amount, issued_date, due_date } = req.body;
  const invoice_number = await nextInvoiceNumber();
  const { rows } = await pool.query(
    `INSERT INTO invoices (bid_id, client_id, project_id, invoice_number,
       draw_type, description, amount, issued_date, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [bid_id || null, client_id || null, project_id || null, invoice_number,
     draw_type || 'progress', description || null, amount || 0,
     issued_date || null, due_date || null]
  );
  res.status(201).json(rows[0]);
});

// Generate the full draw schedule from an accepted bid
router.post('/from-bid/:bidId', async (req, res) => {
  const bidRes = await pool.query('SELECT * FROM bids WHERE id=$1', [req.params.bidId]);
  if (!bidRes.rows.length) return res.status(404).json({ error: 'Bid not found' });
  const bid = bidRes.rows[0];
  const itemsRes = await pool.query('SELECT * FROM bid_line_items WHERE bid_id=$1', [bid.id]);
  const { total } = computeBidTotals(itemsRes.rows, bid);
  const draws = buildDrawSchedule(total);

  const created = [];
  for (const d of draws) {
    const invoice_number = await nextInvoiceNumber();
    const { rows } = await pool.query(
      `INSERT INTO invoices (bid_id, client_id, project_id, invoice_number,
         draw_type, description, amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft') RETURNING *`,
      [bid.id, bid.client_id, bid.project_id, invoice_number,
       d.draw_type, d.description, d.amount]
    );
    created.push(rows[0]);
  }
  res.status(201).json(created);
});

router.put('/:id', async (req, res) => {
  const { draw_type, description, amount, status, issued_date, due_date } = req.body;
  const { rows } = await pool.query(
    `UPDATE invoices SET draw_type=COALESCE($1,draw_type), description=COALESCE($2,description),
       amount=COALESCE($3,amount), status=COALESCE($4,status),
       issued_date=$5, due_date=$6 WHERE id=$7 RETURNING *`,
    [draw_type, description, amount, status, issued_date || null, due_date || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM invoices WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// Record a payment; auto-marks invoice paid when balance hits zero
router.post('/:id/payments', async (req, res) => {
  const { amount, method, reference, paid_date } = req.body;
  const invRes = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
  if (!invRes.rows.length) return res.status(404).json({ error: 'Invoice not found' });

  const { rows } = await pool.query(
    `INSERT INTO payments (invoice_id, amount, method, reference, paid_date)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, amount, method || null, reference || null, paid_date || new Date()]
  );

  const paid = await paidTotal(req.params.id);
  if (paid >= parseFloat(invRes.rows[0].amount)) {
    await pool.query("UPDATE invoices SET status='paid' WHERE id=$1", [req.params.id]);
  }
  res.status(201).json(rows[0]);
});

// Generate invoice PDF
router.post('/:id/pdf', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, c.name AS client_name, c.email AS client_email, c.address AS client_address
     FROM invoices i LEFT JOIN clients c ON c.id=i.client_id WHERE i.id=$1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const inv = rows[0];
  const paid = await paidTotal(inv.id);
  const balance = parseFloat(inv.amount) - paid;
  const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { font-family:'Helvetica Neue',sans-serif; color:#1C1917; margin:0; padding:40px 56px; font-size:13px; }
  .header { border-bottom:3px solid #C4954A; padding-bottom:20px; margin-bottom:28px; display:flex; justify-content:space-between; align-items:flex-end; }
  .logo { font-size:24px; font-weight:900; } .logo span { color:#C4954A; }
  .meta { text-align:right; font-size:11px; color:#78716C; } .meta strong { color:#1C1917; font-size:16px; }
  .party { font-size:12px; margin-bottom:24px; } .party h3 { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#C4954A; margin:0 0 6px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { background:#F5F0E8; padding:8px 10px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; color:#78716C; }
  td { padding:10px; border-bottom:1px solid #EFE9DE; } .r { text-align:right; }
  .summary { margin-top:24px; margin-left:auto; width:280px; }
  .summary tr td { border:none; padding:6px 0; }
  .summary .due td { border-top:2px solid #1C1917; padding-top:10px; font-size:18px; font-weight:900; }
  .due .amt { color:#B85C38; }
  .pill { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; }
  .pill.paid { background:#D1FAE5; color:#065F46; } .pill.due { background:#FEF3C7; color:#92400E; }
  footer { margin-top:48px; padding-top:16px; border-top:1px solid #EFE9DE; font-size:10px; color:#A8A29E; display:flex; justify-content:space-between; }
  </style></head><body>
  <div class="header">
    <div><div class="logo">ABQ <span>ADU</span></div>
      <div style="font-size:13px;color:#78716C;margin-top:4px;">Invoice</div></div>
    <div class="meta"><strong>${inv.invoice_number}</strong>
      <div>Issued ${inv.issued_date || new Date().toLocaleDateString('en-US')}</div>
      ${inv.due_date ? `<div>Due ${inv.due_date}</div>` : ''}
      <div style="margin-top:6px;"><span class="pill ${balance <= 0 ? 'paid' : 'due'}">${balance <= 0 ? 'PAID' : 'BALANCE DUE'}</span></div></div>
  </div>
  <div class="party"><h3>Bill To</h3>
    <div><strong>${inv.client_name || '—'}</strong></div>
    ${inv.client_address ? `<div>${inv.client_address}</div>` : ''}
    ${inv.client_email ? `<div>${inv.client_email}</div>` : ''}</div>
  <table><thead><tr><th>Description</th><th>Draw</th><th class="r">Amount</th></tr></thead><tbody>
    <tr><td>${inv.description || 'Construction draw'}</td><td>${inv.draw_type}</td><td class="r">${fmt(inv.amount)}</td></tr>
  </tbody></table>
  <table class="summary">
    <tr><td>Invoice total</td><td class="r">${fmt(inv.amount)}</td></tr>
    <tr><td>Paid to date</td><td class="r">${fmt(paid)}</td></tr>
    <tr class="due"><td>Balance Due</td><td class="r amt">${fmt(Math.max(0, balance))}</td></tr>
  </table>
  <footer><span>ABQ ADU — Albuquerque, NM · Payable upon receipt</span><span>${inv.invoice_number}</span></footer>
  </body></html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'Letter', margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await browser.close();
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${inv.invoice_number}.pdf"` });
  res.send(pdf);
});

module.exports = router;
