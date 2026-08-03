const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, '..', 'src', 'index.js');
const routeFile = path.join(__dirname, '..', 'src', 'routes', 'productionIntegrations.js');
const serviceFile = path.join(__dirname, '..', 'src', 'services', 'productionIntegrations.js');

function assertIncludes(file, text) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}

test('production integration routes are registered', () => {
  assertIncludes(indexFile, "app.use('/api/integrations'");
  assertIncludes(routeFile, "router.get('/status'");
  assertIncludes(routeFile, "router.post('/sms/send'");
  assertIncludes(routeFile, "router.post('/stripe/checkout'");
  assertIncludes(routeFile, "router.post('/ocr/receipt'");
  assertIncludes(routeFile, "router.get('/clerk/status'");
});

test('receipt parser extracts vendor date total and likely category', () => {
  const { parseReceiptText } = require('../src/services/productionIntegrations');
  const parsed = parseReceiptText(`LOWE'S HOME IMPROVEMENT
08/03/2026
Drywall mud and house wrap
TOTAL $284.76`);

  expect(parsed.vendor).toBe("LOWE'S HOME IMPROVEMENT");
  expect(parsed.date).toBe('2026-08-03');
  expect(parsed.total).toBe(284.76);
  expect(parsed.category).toBe('Materials');
});

test('integration status reports configured and missing providers', () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_demo';
  process.env.STRIPE_SUCCESS_URL = 'https://example.com/success';
  process.env.STRIPE_CANCEL_URL = 'https://example.com/cancel';
  delete process.env.TWILIO_ACCOUNT_SID;
  jest.resetModules();
  const { getIntegrationStatus } = require('../src/services/productionIntegrations');
  const status = getIntegrationStatus();

  expect(status.stripe.configured).toBe(true);
  expect(status.twilio.configured).toBe(false);
  expect(status.clerk.required_env).toContain('CLERK_PUBLISHABLE_KEY');
});
