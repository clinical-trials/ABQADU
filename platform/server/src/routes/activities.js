const router = require('express').Router();
const { pool } = require('../db');
const { recalcProject } = require('../services/scheduleRecalc');

// GET all activities for a project (with baseline if requested)
router.get('/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, ba.planned_start AS bl_start, ba.planned_finish AS bl_finish
     FROM activities a
     LEFT JOIN baseline_activities ba
       ON ba.activity_id = a.id
      AND ba.baseline_id = (
        SELECT id FROM baselines WHERE project_id=a.project_id ORDER BY created_at DESC LIMIT 1
      )
     WHERE a.project_id=$1
     ORDER BY a.sort_order`,
    [req.params.projectId]
  );
  res.json(rows);
});

// POST create activity
router.post('/', async (req, res) => {
  const { project_id, wbs_id, name, activity_type, duration_days,
          planned_start, calendar_id, sort_order } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO activities
       (project_id, wbs_id, name, activity_type, duration_days, planned_start, calendar_id, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [project_id, wbs_id || null, name, activity_type || 'task_dependent',
     duration_days || 1, planned_start || null, calendar_id || null, sort_order || 0]
  );
  await recalcProject(project_id);
  res.status(201).json(rows[0]);
});

// PUT update activity
router.put('/:id', async (req, res) => {
  const fields = ['name','activity_type','duration_days','planned_start',
                  'planned_finish','actual_start','actual_finish','pct_complete',
                  'calendar_id','sort_order','wbs_id'];
  const updates = [];
  const vals = [];
  let i = 1;
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f}=$${i++}`);
      vals.push(req.body[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  vals.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE activities SET ${updates.join(',')} WHERE id=$${i} RETURNING *`, vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  await recalcProject(rows[0].project_id);
  res.json(rows[0]);
});

// DELETE activity
router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'DELETE FROM activities WHERE id=$1 RETURNING project_id', [req.params.id]
  );
  if (rows.length) await recalcProject(rows[0].project_id);
  res.status(204).end();
});

module.exports = router;
