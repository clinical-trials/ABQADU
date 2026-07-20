function cleanBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function makeInvoiceShelfError(message, details = {}) {
  const err = new Error(message);
  err.details = details;
  err.isInvoiceShelfError = true;
  return err;
}

function makeInvoiceShelfClient(config = {}, fetchImpl = global.fetch) {
  const baseUrl = cleanBaseUrl(config.baseUrl || process.env.INVOICESHELF_BASE_URL);
  const token = config.token || process.env.INVOICESHELF_API_TOKEN;
  const companyId = config.companyId || process.env.INVOICESHELF_COMPANY_ID;
  const timeoutMs = Number(config.timeoutMs || process.env.INVOICESHELF_TIMEOUT_MS || 12000);

  if (!baseUrl) throw makeInvoiceShelfError('InvoiceShelf base URL is not configured');
  if (!token) throw makeInvoiceShelfError('InvoiceShelf API token is not configured');
  if (!companyId) throw makeInvoiceShelfError('InvoiceShelf company id is not configured');
  if (typeof fetchImpl !== 'function') throw makeInvoiceShelfError('A fetch implementation is required');

  async function request(method, path, body) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const url = `${baseUrl}/api/v1${path.startsWith('/') ? path : `/${path}`}`;

    try {
      const res = await fetchImpl(url, {
        method,
        signal: controller ? controller.signal : undefined,
        headers: {
          Authorization: `Bearer ${token}`,
          Company: companyId,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: body == null ? undefined : JSON.stringify(body),
      });

      const text = await res.text();
      const parsed = text ? JSON.parse(text) : {};
      if (!res.ok) {
        throw makeInvoiceShelfError(`InvoiceShelf ${method} ${path} failed with ${res.status}`, {
          status: res.status,
          response: parsed,
        });
      }
      return parsed;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw makeInvoiceShelfError(`InvoiceShelf ${method} ${path} timed out after ${timeoutMs}ms`);
      }
      if (err.isInvoiceShelfError) throw err;
      throw makeInvoiceShelfError(`InvoiceShelf ${method} ${path} failed`, { cause: err.message });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    request,
    createCustomer: payload => request('POST', '/customers', payload),
    createEstimate: payload => request('POST', '/estimates', payload),
    convertEstimateToInvoice: estimateId => request('POST', `/estimates/${estimateId}/convert-to-invoice`),
    getInvoice: invoiceId => request('GET', `/invoices/${invoiceId}`),
    recordPayment: payload => request('POST', '/payments', payload),
  };
}

module.exports = { makeInvoiceShelfClient, makeInvoiceShelfError };
