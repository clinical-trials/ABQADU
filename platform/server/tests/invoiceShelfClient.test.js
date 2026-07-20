const { makeInvoiceShelfClient } = require('../src/services/invoiceShelfClient');

async function run() {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { id: 'remote-1' } }),
    };
  };

  const client = makeInvoiceShelfClient({
    baseUrl: 'https://invoice.example.test',
    token: 'token-123',
    companyId: 'company-7',
    timeoutMs: 1000,
  }, fakeFetch);

  const result = await client.createEstimate({ estimate_number: 'EST-1' });

  if (result.data.id !== 'remote-1') throw new Error('Expected normalized JSON result');
  if (calls[0].url !== 'https://invoice.example.test/api/v1/estimates') throw new Error(`Unexpected URL ${calls[0].url}`);
  if (calls[0].options.headers.Authorization !== 'Bearer token-123') throw new Error('Missing Bearer token');
  if (calls[0].options.headers.Company !== 'company-7') throw new Error('Missing company header');
  if (calls[0].options.method !== 'POST') throw new Error('Expected POST');

  console.log('InvoiceShelf client tests passed');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
