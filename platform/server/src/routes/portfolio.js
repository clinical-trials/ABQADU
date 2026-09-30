const router = require('../asyncRouter')();
const { pool } = require('../db');

// GET portfolio — all projects with health indicators
router.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    WITH activity_summary AS (
      SELECT project_id,
        COUNT(*) AS total_activities,
        COUNT(*) FILTER (WHERE actual_finish IS NOT NULL) AS complete_activities,
        AVG(pct_complete) AS pct_complete,
        MIN(planned_start) AS project_start,
        MAX(planned_finish) AS planned_finish,
        COUNT(*) FILTER (WHERE is_critical) AS critical_count,
        COUNT(*) FILTER (
          WHERE is_critical AND planned_finish < CURRENT_DATE AND actual_finish IS NULL
        ) AS overdue_critical_count
      FROM activities
      GROUP BY project_id
    ), risk_summary AS (
      SELECT project_id,
        COUNT(*) FILTER (WHERE status='open' AND risk_score >= 15) AS high_risks
      FROM risks
      GROUP BY project_id
    )
    SELECT
      p.id, p.name, p.start_date, p.status,
      COALESCE(a.total_activities, 0) AS total_activities,
      COALESCE(a.complete_activities, 0) AS complete_activities,
      ROUND(a.pct_complete, 1) AS pct_complete, a.project_start, a.planned_finish,
      COALESCE(a.critical_count, 0) AS critical_count,
      COALESCE(r.high_risks, 0) AS high_risks,
      CASE
        WHEN a.planned_finish < CURRENT_DATE
          AND a.pct_complete < 95 THEN 'delayed'
        WHEN a.overdue_critical_count > 0 THEN 'at_risk'
        ELSE 'on_schedule'
      END AS health
    FROM projects p
    LEFT JOIN activity_summary a ON a.project_id = p.id
    LEFT JOIN risk_summary r ON r.project_id = p.id
    WHERE p.status = 'active'
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
