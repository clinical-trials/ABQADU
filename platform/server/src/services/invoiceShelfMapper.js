function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function remoteId(value, label) {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1) {
    invalid(`InvoiceShelf ${label} must be a valid positive identifier.`, 409);
  }
  return Number(text);
}

function readInvoiceShelfConfig(config = {
  currencyId: process.env.INVOICESHELF_CURRENCY_ID,
  templateName: process.env.INVOICESHELF_TEMPLATE_NAME,
  estimateTemplateName: process.env.INVOICESHELF_ESTIMATE_TEMPLATE_NAME,
}) {
  const currencyId = remoteId(config.currencyId, 'USD currency ID');
  const templateName = String(config.templateName || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(templateName)) {
    invalid('Configure an installed InvoiceShelf template name before exporting.', 409);
  }
  const estimateTemplateName = String(config.estimateTemplateName || '').trim();
  if (estimateTemplateName && !/^[A-Za-z0-9_-]{1,100}$/.test(estimateTemplateName)) {
    invalid('Configure an installed InvoiceShelf estimate template name before exporting.', 409);
  }
  return { currencyId, templateName, ...(estimateTemplateName ? { estimateTemplateName } : {}) };
}

// InvoiceShelf accepts integer minor units, including line prices and payments.
function minorUnits(value) {
  const text = String(value ?? '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) invalid('Amount must be a positive USD amount with at most two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents < 1 || cents > 999999999999) invalid('Amount is outside the supported InvoiceShelf range.');
  return cents;
}

function dateOnly(value = new Date()) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) invalid('Document date is invalid.');
    value = value.toISOString().slice(0, 10);
  }
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) ? value.slice(0, 10) : '';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!date || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) invalid('Document date is invalid.');
  return date;
}

function documentNumber(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255) invalid('A valid document number is required.');
  return value.trim();
}

function documentFields(client, amount, config, type = 'invoice') {
  const parsed = readInvoiceShelfConfig(config);
  const { currencyId } = parsed;
  const templateName = type === 'estimate' ? parsed.estimateTemplateName : parsed.templateName;
  if (!templateName) invalid('Configure an installed InvoiceShelf estimate template name before exporting.', 409);
  return {
    customer_id: remoteId(client.invoiceshelf_customer_id, 'customer ID'),
    currency_id: currencyId, exchange_rate: 1, template_name: templateName,
    discount_type: 'fixed', discount: 0, discount_val: 0,
    sub_total: amount, total: amount, tax: 0, taxes: [], tax_included: false,
  };
}

function quotedItem(name, description, amount) {
  return { name, description, quantity: 1, price: amount, total: amount,
    discount_type: 'fixed', discount: 0, discount_val: 0, tax: 0, taxes: [] };
}

function mapClientToInvoiceShelfCustomer(client = {}, config) {
  const { currencyId } = readInvoiceShelfConfig(config);
  return {
    name: client.name || 'ABQ ADU Client',
    email: client.email || null,
    phone: client.phone || null,
    currency_id: currencyId,
    billing: {
      address_street_1: client.address || '',
      country_id: null,
      state: 'NM',
      city: 'Albuquerque',
    },
  };
}

function customerFacingItems(items = []) {
  return items.filter(item => {
    const category = String(item.category || '').toLowerCase();
    const description = String(item.description || '').toLowerCase();
    return !item.internal_only && !category.includes('cogs') && !description.includes('internal cogs');
  });
}

function mapBidToInvoiceShelfEstimate({ client = {}, bid = {}, items = [], totals = {}, config }) {
  const amount = minorUnits(totals.total);
  const visible = customerFacingItems(items);
  const description = visible.map(item => item.description).filter(Boolean).join('; ') || 'Quoted ADU construction';
  // One quoted total keeps the approved customer price, including adjustments,
  // without exposing unit costs, margin calculations, or internal supplier lines.
  return {
    ...documentFields(client, amount, config, 'estimate'),
    estimate_number: documentNumber(bid.bid_number),
    estimate_date: dateOnly(bid.created_at || undefined),
    expiry_date: bid.valid_until ? dateOnly(bid.valid_until) : null,
    notes: 'Quoted customer total includes the adjustments and applicable tax in the saved estimate. Final contract depends on site review, utilities, permitting, and engineering review.',
    items: [quotedItem(visible.length === 1 ? visible[0].category || 'Quoted construction' : 'Quoted construction', description, amount)],
  };
}

function mapInvoiceToInvoiceShelfInvoice({ client = {}, invoice = {}, config }) {
  const amount = minorUnits(invoice.amount);
  return {
    ...documentFields(client, amount, config),
    invoice_number: documentNumber(invoice.invoice_number),
    invoice_date: dateOnly(invoice.issued_date || invoice.created_at || undefined),
    due_date: invoice.due_date ? dateOnly(invoice.due_date) : null,
    notes: 'Saved customer draw amount, including any applicable adjustments and tax. Payment status is maintained in the ABQ ADU ledger.',
    items: [quotedItem(invoice.draw_type || 'Construction draw', invoice.description || 'Construction draw', amount)],
  };
}

function mapPaymentToInvoiceShelfPayment({ invoice = {}, payment = {} }) {
  return {
    invoice_id: remoteId(invoice.invoiceshelf_invoice_id, 'invoice ID'),
    amount: minorUnits(payment.amount),
    payment_date: dateOnly(payment.paid_date || undefined),
    payment_method: payment.method || 'check',
    notes: payment.reference || '',
  };
}

module.exports = {
  readInvoiceShelfConfig,
  mapClientToInvoiceShelfCustomer,
  mapBidToInvoiceShelfEstimate,
  mapInvoiceToInvoiceShelfInvoice,
  mapPaymentToInvoiceShelfPayment,
};
