const router = require('../asyncRouter')();
const { pool } = require('../db');

async function changeClient(req, res, change) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query('SELECT * FROM clients WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const client = rows[0];
    if (client.invoiceshelf_customer_id || client.invoiceshelf_sync_error != null) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'This client has a pending or linked InvoiceShelf record. Reconcile it before editing or deleting.' });
    }
    const result = await change(db, client);
    await db.query('COMMIT');
    if (req.method === 'DELETE') return res.status(204).end();
    return res.json(result);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM bids b WHERE b.client_id=c.id) AS bid_count
     FROM clients c ORDER BY c.created_at DESC`
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM clients WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { name, email, phone, address, lead_source, status, notes } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO clients (name, email, phone, address, lead_source, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, email || null, phone || null, address || null,
     lead_source || null, status || 'lead', notes || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  return changeClient(req, res, async (db, client) => {
    const body = req.body || {};
    const field = name => body[name] === undefined ? client[name] : body[name];
    const { rows } = await db.query(
      `UPDATE clients SET name=$1, email=$2, phone=$3, address=$4,
         lead_source=$5, status=$6, notes=$7 WHERE id=$8 RETURNING *`,
      [body.name ?? client.name, field('email'), field('phone'), field('address'),
       field('lead_source'), body.status ?? client.status, field('notes'), client.id]
    );
    return rows[0];
  });
});

router.delete('/:id', async (req, res) => {
  return changeClient(req, res, (db, client) => db.query('DELETE FROM clients WHERE id=$1', [client.id]));
});

module.exports = router;
