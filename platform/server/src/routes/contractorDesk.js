const createRouter = require('../asyncRouter');
const { inboundStatus, createBidRequest, createWeatherHold, cancelWeatherHold, reviewSms, receiveSms } = require('../services/contractorDesk');

function respondToError(error, res) {
  const status = [400, 403, 404, 409, 503].includes(error.status) ? error.status : 503;
  res.status(status).json({ error: error.status ? error.message : 'Contractor desk is temporarily unavailable. Please try again.' });
}

function createContractorDeskRouter({ env = process.env } = {}) {
  const router = createRouter();
  router.get('/status', (_req, res) => res.json(inboundStatus(env)));
  router.post('/bid-requests', async (req, res) => {
    try { res.status(201).json(await createBidRequest(req.body, env)); }
    catch (error) { respondToError(error, res); }
  });
  router.post('/weather-holds', async (req, res) => {
    try { res.status(201).json(await createWeatherHold(req.body)); }
    catch (error) { respondToError(error, res); }
  });
  router.post('/weather-holds/:id/cancel', async (req, res) => {
    try { res.json(await cancelWeatherHold(req.params.id)); }
    catch (error) { respondToError(error, res); }
  });
  router.post('/sms/:id/review', async (req, res) => {
    try { res.json(await reviewSms(req.params.id, req.body)); }
    catch (error) { respondToError(error, res); }
  });
  return router;
}

function createSmsInboundHandler({ env = process.env } = {}) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!req.is('application/x-www-form-urlencoded')) {
        return res.status(400).json({ error: 'Expected a form-encoded Twilio message.' });
      }
      await receiveSms(req.body, req.get('X-Twilio-Signature'), env);
      // Empty TwiML acknowledges delivery without sending an automatic reply.
      res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
    } catch (error) { respondToError(error, res); }
  };
}

module.exports = { createContractorDeskRouter, createSmsInboundHandler };
