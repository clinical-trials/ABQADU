const router = require('express').Router();
const { pool } = require('../db');
const { generateDesignBrief, analyzeCompliance, generatePermitNarrative } = require('../services/claudeDesign');

async function getRoomsFromBody(req) {
  if (req.body.rooms) return req.body.rooms;
  if (req.body.design_id) {
    const r = await pool.query('SELECT rooms FROM designs WHERE id=$1', [req.body.design_id]);
    return r.rows[0]?.rooms || [];
  }
  return [];
}

router.post('/brief', async (req, res) => {
  const rooms = await getRoomsFromBody(req);
  const { template_name, project } = req.body;
  const text = await generateDesignBrief(rooms, template_name, project);
  res.json({ text });
});

router.post('/compliance', async (req, res) => {
  const rooms = await getRoomsFromBody(req);
  const totalSqft = rooms.reduce((s, r) => s + (r.w / 12) * (r.h / 12), 0);
  const text = await analyzeCompliance(rooms, totalSqft);
  res.json({ text });
});

router.post('/permit-narrative', async (req, res) => {
  const rooms = await getRoomsFromBody(req);
  const { template_name, project } = req.body;
  const text = await generatePermitNarrative(rooms, template_name, project);
  res.json({ text });
});

module.exports = router;
