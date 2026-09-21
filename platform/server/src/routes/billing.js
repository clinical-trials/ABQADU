const billing = require('../services/billing');

function billingHandler(handler) {
  return async (req, res, next) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof billing.BillingError) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };
}
function createBillingRouter(service = billing) {
  const router = require('express').Router();
  router.post('/command-center/:projectId/import', billingHandler(async (req, res) => {
    res.json({ invoices: await service.importDrafts(req.params.projectId) });
  }));
  router.post('/invoices/:id/checkout', billingHandler(async (req, res) => {
    res.json(await service.createCheckout(req.params.id, req.body));
  }));
  router.stripeWebhook = billingHandler(async (req, res) => {
    res.json(await service.handleWebhook(req.body, req.headers['stripe-signature']));
  });
  return router;
}
module.exports = createBillingRouter();
module.exports.createBillingRouter = createBillingRouter;
module.exports.billingHandler = billingHandler;
