const router = require('express').Router();
const { pool } = require('../db');

router.get('/activity/:activityId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, r.name AS resource_name, r.trade, r.cost_per_unit
     FROM assignments a JOIN resources r ON r.id=a.resource_id
     WHERE a.activity_id=$1`,
    [req.params.activityId]
  );
  res.json(rows);
});

// Resource histogram — demand per day for a project
router.get('/histogram/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       r.id AS resource_id, r.name, r.max_units_per_day,
       a.planned_start, a.planned_finish,
       asn.units
     FROM assignments asn
     JOIN activities a ON a.id = asn.activity_id
     JOIN resources r ON r.id = asn.resource_id
     WHERE a.project_id=$1 AND a.planned_start IS NOT NULL
     ORDER BY r.name, a.planned_start`,
    [req.params.projectId]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { activity_id, resource_id, units, budgeted_cost } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO assignments (activity_id, resource_id, units, budgeted_cost)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (activity_id, resource_id) DO UPDATE
       SET units=$3, budgeted_cost=$4
     RETURNING *`,
    [activity_id, resource_id, units || 1, budgeted_cost || null]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM assignments WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
