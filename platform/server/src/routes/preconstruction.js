const createRouter = require('../asyncRouter');
const { createPreconstructionAgreementService, PreconstructionError } = require('../services/preconstructionAgreement');

function createPreconstructionRouter(options = {}) {
  const router = createRouter();
  const service = options.service || createPreconstructionAgreementService(options);
  const handle = action => async (req, res) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    try { await action(req, res); }
    catch (error) {
      const expected = error instanceof PreconstructionError;
      res.status(expected ? error.status : 503).json({ error: expected ? error.message : 'The agreement draft is temporarily unavailable. Reload the saved revision before retrying.' });
    }
  };
  router.get('/', handle(async (_req, res) => res.json(await service.listProjects())));
  router.get('/projects/:projectId', handle(async (req, res) => res.json(await service.getAgreement(req.params.projectId))));
  router.put('/projects/:projectId', handle(async (req, res) => res.json(await service.saveAgreement(req.params.projectId, req.body, req.workspaceAuth.userId))));
  router.get('/projects/:projectId/versions/:version/packet.pdf', handle(async (req, res) => {
    const { pdf, agreement } = await service.generatePacket(req.params.projectId, req.params.version, req.workspaceAuth.userId);
    res.set({
      'Content-Type': 'application/pdf', 'X-Agreement-Version': agreement.version,
      'Content-Disposition': `inline; filename="abq-adu-preconstruction-${agreement.version}-draft.pdf"`,
    });
    res.send(pdf);
  }));
  return router;
}

module.exports = { createPreconstructionRouter };
