const router = require('express').Router();
const { pool } = require('../db');

// GET baselines for project
router.get('/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM baselines WHERE project_id=$1 ORDER BY created_at DESC',
    [req.params.projectId]
  );
  res.json(rows);
});

// POST save baseline snapshot
router.post('/', async (req, res) => {
  const { project_id, name } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [bl] } = await client.query(
      'INSERT INTO baselines (project_id, name) VALUES ($1,$2) RETURNING *',
      [project_id, name]
    );
    // Snapshot all current activities
    await client.query(
      `INSERT INTO baseline_activities
         (baseline_id, activity_id, planned_start, planned_finish, duration_days, total_float)
       SELECT $1, id, planned_start, planned_finish, duration_days, total_float
       FROM activities WHERE project_id=$2`,
      [bl.id, project_id]
    );
    await client.query('COMMIT');
    res.status(201).json(bl);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET compare baseline vs current (returns SV and SPI per activity)
router.get('/:baselineId/compare', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       a.id, a.name,
       a.planned_start  AS current_start,
       a.planned_finish AS current_finish,
       a.pct_complete,
       a.is_critical,
       ba.planned_start  AS bl_start,
       ba.planned_finish AS bl_finish,
       ba.duration_days  AS bl_duration,
       a.duration_days   AS current_duration,
       -- SV in days (negative = behind schedule)
       (a.planned_finish::date - ba.planned_finish::date) AS sv_days,
       -- SPI: ratio of planned durations (< 1 = behind)
       CASE WHEN ba.duration_days > 0
            THEN ROUND(a.duration_days::numeric / ba.duration_days, 2)
            ELSE NULL END AS spi
     FROM baseline_activities ba
     JOIN activities a ON a.id = ba.activity_id
     WHERE ba.baseline_id=$1
     ORDER BY a.sort_order`,
    [req.params.baselineId]
  );
  res.json(rows);
});

// DELETE baseline
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM baselines WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
