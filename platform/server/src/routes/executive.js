const createRouter = require('../asyncRouter');
const { calculateCashScenario, CashScenarioValidationError } = require('../services/cashScenario');
const { createPreconstructionCycleService, PreconstructionCycleError } = require('../services/preconstructionCycle');
const { createOwnerPlanService, canReadOwnerPlan, OwnerPlanError } = require('../services/ownerPlan');

function createExecutiveRouter({ getBriefing, scenario = calculateCashScenario, cycleService, ownerPlanService, env = process.env } = {}) {
  const router = createRouter();
  const briefing = getBriefing || require('../services/cfoBriefing').createCfoBriefingService({ env });
  const cycle = cycleService || createPreconstructionCycleService();
  const ownerPlan = ownerPlanService || createOwnerPlanService({ env });

  router.get('/owner-plan', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!canReadOwnerPlan(req.workspaceAuth, env)) return res.status(404).json({ error: new OwnerPlanError(404).message });
    try { res.json(await ownerPlan.getReport(req.workspaceAuth)); }
    catch (error) {
      const safeError = new OwnerPlanError(error instanceof OwnerPlanError ? error.status : 503);
      res.status(safeError.status).json({ error: safeError.message });
    }
  });

  const handleCycle = action => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try { res.json(await action(req)); }
    catch (error) {
      const expected = error instanceof PreconstructionCycleError;
      res.status(expected ? error.status : 503).json({ error: expected ? error.message : 'The preconstruction timing records are temporarily unavailable. Elapsed times remain unknown.' });
    }
  };
  router.get('/preconstruction-cycle', handleCycle(() => cycle.getReport()));
  router.put('/preconstruction-cycle/projects/:projectId', handleCycle(req => cycle.saveProject(req.params.projectId, req.body, req.workspaceAuth.userId)));

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
