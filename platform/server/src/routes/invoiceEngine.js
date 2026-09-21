const router = require('../asyncRouter')();
const { pool } = require('../db');
const { computeBidTotals } = require('../services/bidCalc');
const { makeInvoiceShelfClient } = require('../services/invoiceShelfClient');
const { createRemoteOnce, readRemoteInvoiceStatus } = require('../services/invoiceShelfCreation');
const { assertUsdConfiguration } = require('../services/invoiceShelfCurrency');
const {
  mapClientToInvoiceShelfCustomer,
  mapBidToInvoiceShelfEstimate,
  mapInvoiceToInvoiceShelfInvoice,
} = require('../services/invoiceShelfMapper');

async function event(localType, localId, eventType, message, payload = {}) {
  await pool.query(
    `INSERT INTO invoice_engine_events (local_type, local_id, event_type, message, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [localType, localId || null, eventType, message, payload]
  );
}

router.post('/customers/:clientId/sync', async (req, res) => {
  const clientRes = await pool.query('SELECT *,xmin::text AS row_version FROM clients WHERE id=$1', [req.params.clientId]);
  if (!clientRes.rows.length) return res.status(404).json({ error: 'Client not found' });

  const client = clientRes.rows[0];
  try {
    const api = makeInvoiceShelfClient();
    const config = await assertUsdConfiguration(api);
    const mapped = mapClientToInvoiceShelfCustomer(client,config);
    const {id,result,existing} = await createRemoteOnce({table:'clients',idColumn:'invoiceshelf_customer_id',record:client,
      create:()=>api.createCustomer(mapped),
      save:(remote)=>pool.query('UPDATE clients SET invoiceshelf_customer_id=$1, invoiceshelf_last_sync_at=NOW(), invoiceshelf_sync_error=NULL WHERE id=$2',[remote,client.id])});
    if (!existing) await event('client', client.id, 'synced', `Client synced to InvoiceShelf customer ${id}`, result);
    res.json({ ok: true, invoiceshelf_customer_id: id, result });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

router.post('/bids/:bidId/estimate', async (req, res) => {
  const bidRes = await pool.query('SELECT *,xmin::text AS row_version FROM bids WHERE id=$1', [req.params.bidId]);
  if (!bidRes.rows.length) return res.status(404).json({ error: 'Bid not found' });
  const bid = bidRes.rows[0];
  const clientRes = await pool.query('SELECT * FROM clients WHERE id=$1', [bid.client_id]);
  const itemRes = await pool.query('SELECT * FROM bid_line_items WHERE bid_id=$1 ORDER BY sort_order, id', [bid.id]);
  const client = clientRes.rows[0] || {};
  const totals = computeBidTotals(itemRes.rows, bid);
  try {
    if (!client.invoiceshelf_customer_id) return res.status(409).json({error:'Create the InvoiceShelf customer from Clients first.'});
    const api = makeInvoiceShelfClient();
    const config = await assertUsdConfiguration(api,client);
    const mapped = mapBidToInvoiceShelfEstimate({ client, bid, items:itemRes.rows, totals, config });
    const {id,result,existing} = await createRemoteOnce({table:'bids',idColumn:'invoiceshelf_estimate_id',record:bid,
      create:()=>api.createEstimate(mapped),
      save:(remote)=>pool.query('UPDATE bids SET invoiceshelf_estimate_id=$1, invoiceshelf_last_sync_at=NOW(), invoiceshelf_sync_error=NULL WHERE id=$2',[remote,bid.id])});
    if (!existing) await event('bid', bid.id, 'estimate_created', `Estimate synced to InvoiceShelf ${id}`, result);
    res.json({ ok: true, invoiceshelf_estimate_id: id, result });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
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
  const invRes = await pool.query('SELECT *,xmin::text AS row_version FROM invoices WHERE id=$1', [req.params.invoiceId]);
  if (!invRes.rows.length) return res.status(404).json({ error: 'Invoice not found' });
  const invoice = invRes.rows[0];
  const clientRes = await pool.query('SELECT * FROM clients WHERE id=$1', [invoice.client_id]);
  const client = clientRes.rows[0] || {};
  try {
    if (!client.invoiceshelf_customer_id) return res.status(409).json({error:'Create the InvoiceShelf customer from Clients first.'});
    const api = makeInvoiceShelfClient();
    const config = await assertUsdConfiguration(api,client);
    const mapped = mapInvoiceToInvoiceShelfInvoice({client,invoice,config});
    const {id,result,existing} = await createRemoteOnce({table:'invoices',idColumn:'invoiceshelf_invoice_id',record:invoice,
      create:()=>api.request('POST','/invoices',mapped),
      save:(remote,payload)=>pool.query('UPDATE invoices SET invoiceshelf_invoice_id=$1, invoiceshelf_public_url=$2, invoiceshelf_last_sync_at=NOW(), invoiceshelf_sync_error=NULL WHERE id=$3',[remote,payload?.data?.view_url || payload?.data?.public_url || null,invoice.id])});
    const publicUrl = result?.data?.view_url || result?.data?.public_url || invoice.invoiceshelf_public_url || null;
    if (!existing) await event('invoice', invoice.id, 'invoice_synced', `Invoice synced to InvoiceShelf ${id}`, result);
    res.json({ ok: true, invoiceshelf_invoice_id: id, invoiceshelf_public_url: publicUrl, result });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
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
    const status = readRemoteInvoiceStatus(result);
    const publicUrl = result?.data?.view_url || result?.data?.public_url || invoice.invoiceshelf_public_url || null;
    await pool.query('UPDATE invoices SET invoiceshelf_remote_status=$1, invoiceshelf_public_url=$2, invoiceshelf_last_sync_at=NOW() WHERE id=$3', [status, publicUrl, invoice.id]);
    await event('invoice', invoice.id, 'status_synced', `InvoiceShelf status synced as ${status}`, result);
    res.json({ ok: true, status, invoiceshelf_public_url: publicUrl, result });
  } catch (err) {
    await event('invoice', invoice.id, 'error', err.message, err.details || {});
    res.status(502).json({ error: err.message, details: err.details || {} });
  }
});

module.exports = router;
