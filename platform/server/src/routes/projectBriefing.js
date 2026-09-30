const createRouter = require('../asyncRouter');
const { createProjectBriefingService } = require('../services/projectBriefing');

function createProjectBriefingRouter(options = {}) {
  const router = createRouter();
  const getBriefing = options.getBriefing || createProjectBriefingService(options);
  router.get('/projects/:projectId/briefing', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const briefing = await getBriefing(req.params.projectId, { trade: req.query.trade || 'general', scheduleProjectId: req.query.schedule_project_id });
      res.json(briefing);
    } catch (error) {
      const expected = [400, 404, 503].includes(error.status);
      res.status(expected ? error.status : 503).json({ error: expected ? error.message : 'Project briefing is temporarily unavailable.' });
    }
  });
  return router;
}

module.exports = { createProjectBriefingRouter };
