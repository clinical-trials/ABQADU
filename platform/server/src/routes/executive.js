const createRouter = require('../asyncRouter');
const { calculateCashScenario, CashScenarioValidationError } = require('../services/cashScenario');

function createExecutiveRouter({ getBriefing, scenario = calculateCashScenario, env = process.env } = {}) {
  const router = createRouter();
  const briefing = getBriefing || require('../services/cfoBriefing').createCfoBriefingService({ env });

  router.get('/cfo/briefing', async (_req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try { res.json(await briefing()); }
    catch { res.status(503).json({ error: 'The company finance briefing is temporarily unavailable. Please try again.' }); }
  });

  router.post('/cfo/cash-scenario', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try { res.json(await scenario(req.body)); }
    catch (error) {
      if (error instanceof CashScenarioValidationError) return res.status(400).json({ error: error.message });
      res.status(503).json({ error: 'The cash scenario is temporarily unavailable. Please try again.' });
    }
  });

  return router;
}

module.exports = { createExecutiveRouter };
