const router = require('express').Router();
const { pool } = require('../db');

router.get('/:projectId', async (req, res) => {
  const { date } = req.query;
  let query = `SELECT ft.*, r.name AS resource_name, a.name AS activity_name
               FROM field_tasks ft
               LEFT JOIN resources r ON r.id=ft.resource_id
               LEFT JOIN activities a ON a.id=ft.activity_id
               WHERE ft.project_id=$1`;
  const vals = [req.params.projectId];
  if (date) { query += ` AND ft.task_date=$2`; vals.push(date); }
  query += ' ORDER BY ft.task_date, r.name';
  const { rows } = await pool.query(query, vals);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { activity_id, project_id, resource_id, task_date, title, description } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO field_tasks (activity_id, project_id, resource_id, task_date, title, description)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [activity_id || null, project_id, resource_id || null, task_date, title, description || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { status, notes, confirmed_at } = req.body;
  const { rows } = await pool.query(
    `UPDATE field_tasks SET status=$1, notes=$2, confirmed_at=$3 WHERE id=$4 RETURNING *`,
    [status, notes || null, confirmed_at || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM field_tasks WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
