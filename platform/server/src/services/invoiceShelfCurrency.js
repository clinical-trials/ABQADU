const { readInvoiceShelfConfig } = require('./invoiceShelfMapper');

function refuse(message) {
  throw Object.assign(new Error(message), { status: 409 });
}

// Read-only validation must finish before reserving or creating a remote record.
async function assertUsdConfiguration(api, client, env = process.env) {
  const config = readInvoiceShelfConfig({
    currencyId: env.INVOICESHELF_CURRENCY_ID,
    templateName: env.INVOICESHELF_TEMPLATE_NAME,
    estimateTemplateName: env.INVOICESHELF_ESTIMATE_TEMPLATE_NAME,
  });
  const currencies = await api.request('GET', '/currencies');
  const currency = Array.isArray(currencies?.data)
    ? currencies.data.find(item => String(item.id) === String(config.currencyId)) : null;
  if (currency?.code !== 'USD' || Number(currency.precision) !== 2) {
    refuse('InvoiceShelf currency configuration must identify USD with two decimal places.');
  }
  const settings = await api.request('GET', '/company/settings?settings[]=currency');
  if (String(settings?.currency) !== String(config.currencyId)) {
    refuse('InvoiceShelf company currency must match the configured USD currency before exporting.');
  }
  if (client) {
    const id = String(client.invoiceshelf_customer_id || '');
    if (!/^\d+$/.test(id) || Number(id) < 1) refuse('Create and link an InvoiceShelf customer before exporting.');
    const remote = await api.request('GET', `/customers/${id}`);
    if (String(remote?.data?.id) !== id || String(remote?.data?.currency_id) !== String(config.currencyId)) {
      refuse('InvoiceShelf customer currency must match the configured USD currency before exporting.');
    }
  }
  return config;
}

module.exports = { assertUsdConfiguration };
