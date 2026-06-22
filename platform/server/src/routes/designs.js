const router = require('express').Router();
const { pool } = require('../db');
const { generateBOM } = require('../services/bomGenerator');

// GET /api/designs/templates
router.get('/templates', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM design_templates ORDER BY sqft'
  );
  res.json(result.rows);
});

// GET /api/designs/templates/:id
router.get('/templates/:id', async (req, res) => {
  const tplRes = await pool.query(
    'SELECT * FROM design_templates WHERE id=$1', [req.params.id]
  );
  if (!tplRes.rows.length) return res.status(404).json({ error: 'Not found' });

  const designRes = await pool.query(
    'SELECT * FROM designs WHERE template_id=$1 AND project_id IS NULL LIMIT 1',
    [req.params.id]
  );
  res.json({ template: tplRes.rows[0], design: designRes.rows[0] || null });
});

// GET /api/designs?project_id=X
router.get('/', async (req, res) => {
  const { project_id } = req.query;
  const where = project_id ? 'WHERE project_id=$1' : '';
  const params = project_id ? [project_id] : [];
  const result = await pool.query(
    `SELECT d.*, t.name AS template_name FROM designs d
     LEFT JOIN design_templates t ON t.id=d.template_id
     ${where} ORDER BY d.updated_at DESC`,
    params
  );
  res.json(result.rows);
});

// POST /api/designs
router.post('/', async (req, res) => {
  const { project_id, template_id, name, rooms, notes } = req.body;
  const total_sqft = (rooms || []).reduce((sum, r) => {
    const GRID = 12;
    return sum + ((r.w || 0) / GRID) * ((r.h || 0) / GRID);
  }, 0);

  const result = await pool.query(
    `INSERT INTO designs (project_id, template_id, name, rooms, total_sqft, notes, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     RETURNING *`,
    [project_id || null, template_id || null, name || 'Floor Plan', JSON.stringify(rooms || []), total_sqft, notes || null]
  );
  res.status(201).json(result.rows[0]);
});

// PUT /api/designs/:id
router.put('/:id', async (req, res) => {
  const { name, rooms, notes } = req.body;
  const total_sqft = (rooms || []).reduce((sum, r) => {
    const GRID = 12;
    return sum + ((r.w || 0) / GRID) * ((r.h || 0) / GRID);
  }, 0);

  const result = await pool.query(
    `UPDATE designs SET name=COALESCE($1,name), rooms=COALESCE($2,rooms),
     total_sqft=$3, notes=COALESCE($4,notes), updated_at=NOW()
     WHERE id=$5 RETURNING *`,
    [name, rooms ? JSON.stringify(rooms) : null, total_sqft, notes, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

// DELETE /api/designs/:id
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM designs WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// POST /api/designs/:id/bom  — generate bill of materials from saved design
router.post('/:id/bom', async (req, res) => {
  const designRes = await pool.query('SELECT * FROM designs WHERE id=$1', [req.params.id]);
  if (!designRes.rows.length) return res.status(404).json({ error: 'Not found' });
  const rooms = designRes.rows[0].rooms;
  const bom = generateBOM(rooms);
  res.json(bom);
});

// POST /api/designs/bom  — generate BOM from rooms payload (without saving)
router.post('/bom', async (req, res) => {
  const { rooms } = req.body;
  const bom = generateBOM(rooms || []);
  res.json(bom);
});

module.exports = router;
