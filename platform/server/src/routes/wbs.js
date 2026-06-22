const router = require('express').Router();
const { pool } = require('../db');

// GET all WBS nodes for a project
router.get('/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM wbs_nodes WHERE project_id=$1 ORDER BY sort_order',
    [req.params.projectId]
  );
  res.json(rows);
});

// POST create WBS node
router.post('/', async (req, res) => {
  const { project_id, parent_id, name, wbs_code, sort_order } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO wbs_nodes (project_id, parent_id, name, wbs_code, sort_order)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [project_id, parent_id || null, name, wbs_code || null, sort_order || 0]
  );
  res.status(201).json(rows[0]);
});

// PUT update WBS node
router.put('/:id', async (req, res) => {
  const { name, wbs_code, sort_order, parent_id } = req.body;
  const { rows } = await pool.query(
    `UPDATE wbs_nodes SET name=$1, wbs_code=$2, sort_order=$3, parent_id=$4
     WHERE id=$5 RETURNING *`,
    [name, wbs_code, sort_order, parent_id || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// DELETE WBS node
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM wbs_nodes WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
