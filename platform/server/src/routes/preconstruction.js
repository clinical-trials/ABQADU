const createRouter = require('../asyncRouter');
const { createPreconstructionAgreementService, PreconstructionError } = require('../services/preconstructionAgreement');
const { createPreconstructionDemoService } = require('../services/preconstructionDemo');

function createPreconstructionRouter(options = {}) {
  const router = createRouter();
  const service = options.service || createPreconstructionAgreementService(options);
  const demoService = options.demoService || createPreconstructionDemoService(options);
  const handle = action => async (req, res) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    try { await action(req, res); }
    catch (error) {
      if (req.aborted || res.destroyed) return;
      const expected = error instanceof PreconstructionError;
      res.status(expected ? error.status : 503).json({ error: expected ? error.message : 'The agreement draft is temporarily unavailable. Reload the saved revision before retrying.' });
    }
  };
  router.get('/template', handle(async (_req, res) => res.json(demoService.getTemplate())));
  router.get('/demo', handle(async (_req, res) => res.json(demoService.getDemo())));
  router.post('/demo/packet.pdf', handle(async (req, res) => {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', onAbort);
    res.once('close', onClose);
    try {
      const { pdf } = await demoService.generatePacket(req.body, { signal: controller.signal });
      if (controller.signal.aborted || res.destroyed) return;
      res.set({
        'Content-Type': 'application/pdf', 'X-Preconstruction-Demo': 'true',
        'Content-Disposition': 'inline; filename="abq-adu-preconstruction-demo.pdf"',
      });
      res.send(pdf);
    } finally {
      req.removeListener('aborted', onAbort);
      res.removeListener('close', onClose);
    }
  }));
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
