const router = require('express').Router();
const { pool } = require('../db');
const { generateDelayForecast, analyzeRisks, generateWeeklyBriefing } = require('../services/claudeScheduler');

router.post('/forecast', async (req, res) => {
  const { project_id } = req.body;
  const [projRes, actRes] = await Promise.all([
    pool.query('SELECT * FROM projects WHERE id=$1', [project_id]),
    pool.query('SELECT * FROM activities WHERE project_id=$1', [project_id]),
  ]);
  if (!projRes.rows.length) return res.status(404).json({ error: 'Not found' });
  const summary = await generateDelayForecast(projRes.rows[0], actRes.rows);
  res.json({ summary });
});

router.post('/risks', async (req, res) => {
  const { project_id } = req.body;
  const [projRes, riskRes] = await Promise.all([
    pool.query('SELECT * FROM projects WHERE id=$1', [project_id]),
    pool.query('SELECT * FROM risks WHERE project_id=$1 ORDER BY risk_score DESC', [project_id]),
  ]);
  if (!projRes.rows.length) return res.status(404).json({ error: 'Not found' });
  const analysis = await analyzeRisks(projRes.rows[0], riskRes.rows);
  res.json({ analysis });
});

router.post('/briefing', async (req, res) => {
  const { project_id } = req.body;
  const [projRes, actRes, ftRes] = await Promise.all([
    pool.query('SELECT * FROM projects WHERE id=$1', [project_id]),
    pool.query('SELECT * FROM activities WHERE project_id=$1', [project_id]),
    pool.query(
      `SELECT ft.*, r.name AS resource_name FROM field_tasks ft
       LEFT JOIN resources r ON r.id=ft.resource_id WHERE ft.project_id=$1`,
      [project_id]
    ),
  ]);
  if (!projRes.rows.length) return res.status(404).json({ error: 'Not found' });
  const briefing = await generateWeeklyBriefing(projRes.rows[0], actRes.rows, ftRes.rows);
  res.json({ briefing });
});

module.exports = router;
