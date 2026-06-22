const router = require('express').Router();
const { pool } = require('../db');

router.get('/:projectId', async (req, res) => {
  const { activity_id, risk_id, field_task_id } = req.query;
  let where = 'WHERE c.project_id=$1';
  const vals = [req.params.projectId];
  let i = 2;
  if (activity_id)   { where += ` AND c.activity_id=$${i++}`;   vals.push(activity_id); }
  if (risk_id)       { where += ` AND c.risk_id=$${i++}`;       vals.push(risk_id); }
  if (field_task_id) { where += ` AND c.field_task_id=$${i++}`; vals.push(field_task_id); }
  const { rows } = await pool.query(
    `SELECT c.* FROM comments c ${where} ORDER BY c.created_at ASC`, vals
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { project_id, activity_id, risk_id, field_task_id, author_name, body } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO comments (project_id, activity_id, risk_id, field_task_id, author_name, body)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [project_id, activity_id || null, risk_id || null,
     field_task_id || null, author_name, body]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM comments WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
