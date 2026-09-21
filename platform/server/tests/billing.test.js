const express = require('express');
const request = require('supertest');
const { cents, ledgerInvoice, validateConfig, createBillingService } = require('../src/services/billing');

test.each([null, undefined, '', '-1', 0, '1.001', 'Infinity', '1e3', '99999999999'])('invalid money %s is rejected without rounding', value => {
  expect(() => cents(value)).toThrow();
});
test('currency conversion uses exact cents', () => {
  expect(cents('12345.67')).toBe(1234567);
  expect(cents('0.01')).toBe(1);
  expect(cents('0', true)).toBe(0);
});
test('ledger status cannot trust a saved or remote paid label', () => {
  expect(ledgerInvoice({ amount: '100.00', status: 'paid', paid: '20.00' })).toMatchObject({ status: 'sent', paid: 20, balance: 80 });
  expect(ledgerInvoice({ amount: '100.00', status: 'draft', paid: '100.00' }).status).toBe('paid');
  expect(ledgerInvoice({ amount: '0.00', status: 'draft', paid: '0.00' }).status).toBe('draft');
});
test('Stripe configuration requires the webhook and matching explicit mode', () => {
  const valid = { secretKey: 'sk_test_fixture', webhookSecret: 'whsec_fixture', mode: 'test', successUrl: 'https://example.test/return', cancelUrl: 'http://localhost:4000/invoices' };
  expect(validateConfig(valid)).toBe(valid);
  expect(() => validateConfig({ ...valid, webhookSecret: '' })).toThrow(/setup is incomplete/);
  expect(() => validateConfig({ ...valid, secretKey: 'sk_live_fixture' })).toThrow(/must match/);
  expect(() => validateConfig({ ...valid, cancelUrl: 'http://example.test/invoices' })).toThrow(/HTTPS/);
});
test('unconfigured checkout fails before a database or provider request', async () => {
  const pool = { connect: jest.fn() };
  const service = createBillingService({ pool, config: {} });
  await expect(service.createCheckout(1, {})).rejects.toMatchObject({ status: 503 });
  expect(pool.connect).not.toHaveBeenCalled();
});
test('obsolete arbitrary checkout endpoint returns a refusal without a provider call', async () => {
  const app = express();
  app.use(express.json());
  app.use('/integrations', require('../src/routes/productionIntegrations'));
  const result = await request(app).post('/integrations/stripe/checkout').send({ amount: 1 });
  expect(result.status).toBe(410);
  expect(result.body.error).toMatch(/stored invoice/);
});
