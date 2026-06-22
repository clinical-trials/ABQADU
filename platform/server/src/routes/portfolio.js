const router = require('express').Router();
const { pool } = require('../db');

// GET portfolio — all projects with health indicators
router.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id, p.name, p.start_date, p.status,
      COUNT(a.id) AS total_activities,
      COUNT(a.id) FILTER (WHERE a.actual_finish IS NOT NULL) AS complete_activities,
      ROUND(AVG(a.pct_complete), 1) AS pct_complete,
      MIN(a.planned_start) AS project_start,
      MAX(a.planned_finish) AS planned_finish,
      COUNT(a.id) FILTER (WHERE a.is_critical) AS critical_count,
      COUNT(r.id) FILTER (WHERE r.status='open' AND r.risk_score >= 15) AS high_risks,
      -- Health: delayed if any critical activity has actual > planned
      CASE
        WHEN MAX(a.planned_finish) < CURRENT_DATE
          AND AVG(a.pct_complete) < 95 THEN 'delayed'
        WHEN COUNT(a.id) FILTER (
          WHERE a.is_critical AND a.planned_finish < CURRENT_DATE
          AND a.actual_finish IS NULL
        ) > 0 THEN 'at_risk'
        ELSE 'on_schedule'
      END AS health
    FROM projects p
    LEFT JOIN activities a ON a.project_id = p.id
    LEFT JOIN risks r ON r.project_id = p.id
    WHERE p.status = 'active'
    GROUP BY p.id
    ORDER BY p.name
  `);
  res.json(rows);
});

// GET single project detail for portfolio drill-down
router.get('/:projectId', async (req, res) => {
  const [projRes, actRes, riskRes] = await Promise.all([
    pool.query('SELECT * FROM projects WHERE id=$1', [req.params.projectId]),
    pool.query(
      `SELECT id, name, planned_start, planned_finish, pct_complete, is_critical, total_float
       FROM activities WHERE project_id=$1 ORDER BY sort_order`,
      [req.params.projectId]
    ),
    pool.query(
      `SELECT id, title, probability, impact, risk_score, status
       FROM risks WHERE project_id=$1 ORDER BY risk_score DESC NULLS LAST LIMIT 5`,
      [req.params.projectId]
    ),
  ]);
  if (!projRes.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({
    project: projRes.rows[0],
    activities: actRes.rows,
    top_risks: riskRes.rows,
  });
});

module.exports = router;
