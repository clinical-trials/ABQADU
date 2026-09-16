const router = require('../asyncRouter')();
const { pool } = require('../db');

router.post('/', async (req, res) => {
  const { name, description, start_date } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
    return res.status(400).json({ error: 'Project name must contain 1–200 characters.' });
  }
  if (description != null && typeof description !== 'string') {
    return res.status(400).json({ error: 'Project description must be text.' });
  }

  const startDate = start_date == null || start_date === '' ? null : start_date;
  if (startDate !== null) {
    const parsed = typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? new Date(`${startDate}T00:00:00.000Z`) : null;
    if (!parsed || !Number.isFinite(parsed.getTime()) || startDate.startsWith('0000-')
      || parsed.toISOString().slice(0, 10) !== startDate) {
      return res.status(400).json({ error: 'Project start_date must be a valid date in YYYY-MM-DD format.' });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO projects (name, description, start_date)
     VALUES ($1, $2, $3) RETURNING *`,
    [name.trim(), description?.trim() || null, startDate]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
