const router = require('express').Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  const projectId = req.query.project_id;
  const { rows } = await pool.query(
    `SELECT * FROM resources WHERE project_id=$1 OR project_id IS NULL ORDER BY name`,
    [projectId || null]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { project_id, name, trade, resource_type, max_units_per_day, cost_per_unit } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO resources (project_id, name, trade, resource_type, max_units_per_day, cost_per_unit)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [project_id || null, name, trade || null, resource_type || 'labor',
     max_units_per_day || 1, cost_per_unit || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { name, trade, resource_type, max_units_per_day, cost_per_unit } = req.body;
  const { rows } = await pool.query(
    `UPDATE resources SET name=$1, trade=$2, resource_type=$3,
       max_units_per_day=$4, cost_per_unit=$5 WHERE id=$6 RETURNING *`,
    [name, trade, resource_type, max_units_per_day, cost_per_unit, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM resources WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
