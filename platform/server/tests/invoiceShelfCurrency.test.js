const { assertUsdConfiguration } = require('../src/services/invoiceShelfCurrency');

const env = { INVOICESHELF_CURRENCY_ID: '7', INVOICESHELF_TEMPLATE_NAME: 'invoice1' };
const client = { invoiceshelf_customer_id: '91' };
function provider(overrides = {}) {
  const responses = {
    '/currencies': { data: [{ id: 7, code: 'USD', precision: 2 }] },
    '/company/settings?settings[]=currency': { currency: '7' },
    '/customers/91': { data: { id: 91, currency_id: 7 } },
    ...overrides,
  };
  return { request: jest.fn(async (method, path) => {
    if (method !== 'GET' || !(path in responses)) throw new Error('Unexpected provider mutation or endpoint');
    return responses[path];
  }) };
}

test('verifies currency precision, company currency, and the existing customer before export', async () => {
  const api = provider();
  await expect(assertUsdConfiguration(api, client, env)).resolves.toEqual({ currencyId: 7, templateName: 'invoice1' });
  expect(api.request.mock.calls).toContainEqual(['GET', '/customers/91']);
});

test('new customers need verified USD company currency without reading a nonexistent customer', async () => {
  const api = provider({ '/currencies': { data: [{ id: '7', code: 'USD', precision: '2' }] } });
  await expect(assertUsdConfiguration(api, undefined, env)).resolves.toMatchObject({ currencyId: 7 });
  expect(api.request.mock.calls.some(([,path]) => path.startsWith('/customers/'))).toBe(false);
});

test.each([
  { '/currencies': { data: [{ id: 7, code: 'EUR', precision: 2 }] } },
  { '/currencies': { data: [{ id: 7, code: 'USD', precision: 0 }] } },
  { '/currencies': { data: [] } },
  { '/company/settings?settings[]=currency': { currency: '8' } },
  { '/company/settings?settings[]=currency': {} },
  { '/customers/91': { data: { id: 91, currency_id: 8 } } },
  { '/customers/91': { data: { id: 92, currency_id: 7 } } },
  { '/customers/91': {} },
])('unknown or mismatched provider currency prevents export', async overrides => {
  await expect(assertUsdConfiguration(provider(overrides), client, env)).rejects.toMatchObject({ status: 409 });
});

test('missing local currency/template configuration is rejected before contacting the provider', async () => {
  const api = provider();
  await expect(assertUsdConfiguration(api, client, {})).rejects.toMatchObject({ status: 409 });
  expect(api.request).not.toHaveBeenCalled();
});
