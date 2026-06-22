const router = require('express').Router();
const { pool } = require('../db');

router.get('/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, json_agg(e ORDER BY e.exception_date) AS exceptions
     FROM calendars c
     LEFT JOIN calendar_exceptions e ON e.calendar_id=c.id
     WHERE c.project_id=$1 GROUP BY c.id ORDER BY c.name`,
    [req.params.projectId]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { project_id, name, work_days, is_default } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO calendars (project_id, name, work_days, is_default)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [project_id, name, work_days || [1,2,3,4,5], is_default || false]
  );
  res.status(201).json(rows[0]);
});

router.post('/:calendarId/exceptions', async (req, res) => {
  const { exception_date, exception_type, name } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO calendar_exceptions (calendar_id, exception_date, exception_type, name)
     VALUES ($1,$2,$3,$4) ON CONFLICT (calendar_id, exception_date) DO UPDATE
       SET exception_type=$3, name=$4 RETURNING *`,
    [req.params.calendarId, exception_date, exception_type || 'non_work', name || null]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM calendars WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
