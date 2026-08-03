const router = require('express').Router();
const {
  getIntegrationStatus,
  postStripeCheckout,
  sendSms,
  ocrSpaceReceipt,
  verifyClerkShape,
} = require('../services/productionIntegrations');
const { loadCommandCenter, saveCommandCenter } = require('../services/commandCenterStore');

function sendError(res, err) {
  res.status(err.status || 500).json({
    error: err.message,
    details: err.details || {},
  });
}

router.get('/status', (_req, res) => {
  res.json(getIntegrationStatus());
});

router.get('/clerk/status', (req, res) => {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const decoded = verifyClerkShape(bearer);
  res.json({
    ...getIntegrationStatus().clerk,
    token_present: Boolean(bearer),
    token_shape_valid: Boolean(decoded),
    subject: decoded?.sub || null,
  });
});

router.post('/sms/send', async (req, res) => {
  try {
    const result = await sendSms(req.body || {});
    const state = await loadCommandCenter();
    await saveCommandCenter({
      activity: [{
        id: `activity-${Date.now()}`,
        type: 'SMS sent',
        detail: `SMS sent to ${req.body.to}`,
        at: new Date().toISOString(),
      }, ...(state.activity || [])].slice(0, 40),
    });
    res.status(201).json({ ok: true, sid: result.sid, status: result.status });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/stripe/checkout', async (req, res) => {
  try {
    const session = await postStripeCheckout(req.body || {});
    res.status(201).json({
      ok: true,
      id: session.id,
      url: session.url,
      payment_status: session.payment_status,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/ocr/receipt', async (req, res) => {
  try {
    const parsed = await ocrSpaceReceipt(req.body || {});
    const state = await loadCommandCenter();
    const receipt = {
      id: `receipt-${Date.now()}`,
      vendor: parsed.vendor,
      project: req.body.project || 'Unassigned',
      amount: parsed.total,
      category: parsed.category,
      note: `OCR confidence: ${parsed.confidence}. Review before tax/accounting export.`,
      date: parsed.date,
    };
    await saveCommandCenter({
      receipts: [receipt, ...(state.receipts || [])],
      activity: [{
        id: `activity-${Date.now()}-ocr`,
        type: 'Receipt OCR',
        detail: `Receipt parsed for ${receipt.vendor}: $${receipt.amount}`,
        at: new Date().toISOString(),
      }, ...(state.activity || [])].slice(0, 40),
    });
    res.status(201).json({ ok: true, parsed, receipt });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
