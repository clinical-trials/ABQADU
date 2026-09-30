const createRouter = require('../asyncRouter');
const { createGisReviewService, GisReviewError } = require('../services/gisReview');

function createGisReviewRouter(options = {}) {
  const router = createRouter();
  const service = options.service || createGisReviewService(options);
  const handle = action => async (req, res) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    try { res.json(await action(req)); }
    catch (error) {
      const expected = error instanceof GisReviewError;
      res.status(expected ? error.status : 503).json({ error: expected ? error.message : 'Saved GIS review data is temporarily unavailable. Reload before retrying.' });
    }
  };
  router.get('/projects/:projectId/gis-review', handle(req => service.getReview(req.params.projectId)));
  router.put('/projects/:projectId/gis-review', handle(req => service.saveReview(req.params.projectId, req.body, req.workspaceAuth.userId)));
  return router;
}

module.exports = { createGisReviewRouter };
