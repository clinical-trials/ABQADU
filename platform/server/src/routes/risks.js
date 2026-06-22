const router = require('express').Router();
const { pool } = require('../db');

router.get('/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, res.name AS owner_name
     FROM risks r LEFT JOIN resources res ON res.id=r.owner_id
     WHERE r.project_id=$1 ORDER BY r.risk_score DESC NULLS LAST`,
    [req.params.projectId]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { project_id, title, description, category,
          probability, impact, owner_id, mitigation_plan } = req.body;
  const score = (probability || 0) * (impact || 0);
  const { rows } = await pool.query(
    `INSERT INTO risks
       (project_id, title, description, category, probability, impact, risk_score, owner_id, mitigation_plan)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [project_id, title, description || null, category || null,
     probability || null, impact || null, score || null,
     owner_id || null, mitigation_plan || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { title, description, category, probability, impact,
          status, owner_id, mitigation_plan } = req.body;
  const score = (probability || 0) * (impact || 0);
  const { rows } = await pool.query(
    `UPDATE risks SET title=$1, description=$2, category=$3, probability=$4,
       impact=$5, risk_score=$6, status=$7, owner_id=$8, mitigation_plan=$9,
       updated_at=NOW() WHERE id=$10 RETURNING *`,
    [title, description, category, probability, impact,
     score, status, owner_id || null, mitigation_plan, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM risks WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
