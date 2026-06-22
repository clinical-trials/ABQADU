const router = require('express').Router();
const { recalcProject } = require('../services/scheduleRecalc');
const { pool } = require('../db');

// POST /api/schedule/recalculate/:projectId
router.post('/recalculate/:projectId', async (req, res) => {
  try {
    await recalcProject(req.params.projectId);
    const { rows } = await pool.query(
      'SELECT * FROM activities WHERE project_id=$1 ORDER BY sort_order',
      [req.params.projectId]
    );
    res.json({ ok: true, activities: rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
