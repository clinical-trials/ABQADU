const router = require('express').Router();
const { pool } = require('../db');

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
  const { name, email, phone, address, lead_source, status, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE clients SET name=COALESCE($1,name), email=$2, phone=$3, address=$4,
       lead_source=$5, status=COALESCE($6,status), notes=$7 WHERE id=$8 RETURNING *`,
    [name, email, phone, address, lead_source, status, notes, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
