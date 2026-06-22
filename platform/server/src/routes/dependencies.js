const router = require('express').Router();
const { pool } = require('../db');
const { runCPM } = require('../services/cpm');
const { recalcProject } = require('../services/scheduleRecalc');

// GET all dependencies for a project
router.get('/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.* FROM dependencies d
     JOIN activities a ON a.id = d.predecessor_id
     WHERE a.project_id=$1`,
    [req.params.projectId]
  );
  res.json(rows);
});

// POST create dependency (with cycle check)
router.post('/', async (req, res) => {
  const { predecessor_id, successor_id, dep_type, lag_days } = req.body;

  // Fetch all activities + existing deps for cycle check
  const { rows: acts } = await pool.query(
    `SELECT a.id, a.duration_days FROM activities a
     JOIN activities b ON b.project_id = a.project_id
     WHERE b.id = $1`,
    [predecessor_id]
  );
  const { rows: deps } = await pool.query(
    `SELECT d.* FROM dependencies d
     JOIN activities a ON a.id = d.predecessor_id
     WHERE a.project_id = (SELECT project_id FROM activities WHERE id=$1)`,
    [predecessor_id]
  );

  // Test for cycle by running CPM with the proposed dependency added
  try {
    runCPM(acts, [...deps, { predecessor_id, successor_id, dep_type: dep_type || 'FS', lag_days: lag_days || 0 }]);
  } catch {
    return res.status(400).json({ error: 'This dependency would create a cycle' });
  }

  const { rows } = await pool.query(
    `INSERT INTO dependencies (predecessor_id, successor_id, dep_type, lag_days)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [predecessor_id, successor_id, dep_type || 'FS', lag_days || 0]
  );

  const { rows: actRow } = await pool.query(
    'SELECT project_id FROM activities WHERE id=$1', [predecessor_id]
  );
  if (actRow.length) await recalcProject(actRow[0].project_id);

  res.status(201).json(rows[0]);
});

// PUT update dependency
router.put('/:id', async (req, res) => {
  const { dep_type, lag_days } = req.body;
  const { rows } = await pool.query(
    'UPDATE dependencies SET dep_type=$1, lag_days=$2 WHERE id=$3 RETURNING *',
    [dep_type, lag_days, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const { rows: actRow } = await pool.query(
    'SELECT project_id FROM activities WHERE id=$1', [rows[0].predecessor_id]
  );
  if (actRow.length) await recalcProject(actRow[0].project_id);
  res.json(rows[0]);
});

// DELETE dependency
router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `DELETE FROM dependencies WHERE id=$1
     RETURNING predecessor_id`, [req.params.id]
  );
  if (rows.length) {
    const { rows: actRow } = await pool.query(
      'SELECT project_id FROM activities WHERE id=$1', [rows[0].predecessor_id]
    );
    if (actRow.length) await recalcProject(actRow[0].project_id);
  }
  res.status(204).end();
});

module.exports = router;
