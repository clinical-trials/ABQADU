const router = require('express').Router();
const {
  loadCommandCenter,
  saveCommandCenter,
  resetCommandCenter,
} = require('../services/commandCenterStore');

router.get('/', async (_req, res) => {
  res.json(await loadCommandCenter());
});

router.put('/', async (req, res) => {
  res.json(await saveCommandCenter(req.body || {}));
});

router.post('/reset', async (_req, res) => {
  res.json(await resetCommandCenter());
});

router.post('/activity', async (req, res) => {
  const state = await loadCommandCenter();
  const activity = Array.isArray(state.activity) ? state.activity : [];
  const item = {
    id: `activity-${Date.now()}`,
    type: req.body?.type || 'Builder note',
    detail: req.body?.detail || 'Version 9 demo activity logged.',
    at: new Date().toISOString(),
  };
  res.status(201).json(await saveCommandCenter({
    activity: [item, ...activity].slice(0, 40),
  }));
});

module.exports = router;
