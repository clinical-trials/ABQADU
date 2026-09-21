const {
  mapClientToInvoiceShelfCustomer, mapBidToInvoiceShelfEstimate,
  mapInvoiceToInvoiceShelfInvoice, mapPaymentToInvoiceShelfPayment,
} = require('../src/services/invoiceShelfMapper');

const config = { currencyId: 7, templateName: 'invoice1', estimateTemplateName: 'estimate2' };
const client = { id: 42, name: 'Julia Blog', email: 'julia@example.test',
  phone: '505-555-0100', address: '4027 Mackland Ave NE', invoiceshelf_customer_id: '91' };
const invoice = { id: 12, invoice_number: 'INV-2026-0001', description: 'Preconstruction contract',
  amount: '10000.25', issued_date: '2026-09-21', due_date: '2026-10-01' };

test('customers explicitly use the configured USD currency instead of provider defaults', () => {
  expect(mapClientToInvoiceShelfCustomer(client, config)).toMatchObject({
    name: 'Julia Blog', email: 'julia@example.test', currency_id: 7,
  });
});

test('invoice payload supplies linked customer, required fields, and exact integer cents', () => {
  const result = mapInvoiceToInvoiceShelfInvoice({ client, invoice, config });
  expect(result).toMatchObject({ invoice_number: 'INV-2026-0001', invoice_date: '2026-09-21',
    due_date: '2026-10-01', customer_id: 91, currency_id: 7, exchange_rate: 1,
    template_name: 'invoice1', discount: 0, discount_val: 0, sub_total: 1000025, total: 1000025, tax: 0,
    items: [{ name: 'Construction draw', description: 'Preconstruction contract', quantity: 1, price: 1000025, total: 1000025 }] });
  expect(result).not.toHaveProperty('custom_fields');
});

test('the quoted estimate preserves markup, contingency, and tax within its customer total', () => {
  const result = mapBidToInvoiceShelfEstimate({ client, config,
    bid: { id: 9, bid_number: 'BID-0009', created_at: '2026-09-21T12:00:00Z', valid_until: '2026-10-15' },
    items: [
      { category: 'Construction', description: 'Altura 2BR ADU', qty: 600, unit_cost: 285 },
      { category: 'Internal COGS', description: 'Muras SIP supplier comparison', qty: 1, unit_cost: 16000, internal_only: true },
      { category: 'Private', description: 'Internal COGS labor assumptions', qty: 1, unit_cost: 900 },
    ], totals: { subtotal: 187900, markup: 33822, contingency: 9395, tax: 17623.38, total: 248740.38 },
  });
  expect(result).toMatchObject({ customer_id: 91, currency_id: 7, estimate_number: 'BID-0009',
    estimate_date: '2026-09-21', expiry_date: '2026-10-15', sub_total: 24874038, total: 24874038, tax: 0,
    template_name: 'estimate2' });
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ quantity: 1, price: 24874038, total: 24874038 });
  expect(result.items[0].description).toContain('Altura 2BR ADU');
  expect(JSON.stringify(result)).not.toMatch(/Muras|COGS|supplier|33822|17623\.38/);
});

test('estimates require their own installed template instead of reusing an invoice template', () => {
  expect(() => mapBidToInvoiceShelfEstimate({ client, config: { currencyId: 7, templateName: 'invoice1' },
    bid: { bid_number: 'BID-0009' }, totals: { total: 100 } })).toThrow(/estimate.*template/i);
});

test.each([undefined, null, '', NaN, Infinity, -1, 0, '1.001', 'abc', '10000000000.00'])('invalid money %p cannot become a provider invoice', amount => {
  expect(() => mapInvoiceToInvoiceShelfInvoice({ client, invoice: { ...invoice, amount }, config })).toThrow(/amount/i);
});

test.each([
  { currencyId: 0, templateName: 'invoice1' },
  { currencyId: 'unknown', templateName: 'invoice1' },
  { currencyId: 7, templateName: '' },
])('incomplete provider configuration is rejected before creating a reservation', config => {
  expect(() => mapInvoiceToInvoiceShelfInvoice({ client, invoice, config })).toThrow(/InvoiceShelf/);
});

test('unlinked customers, missing invoice numbers, and invalid dates fail before remote creation', () => {
  expect(() => mapInvoiceToInvoiceShelfInvoice({ client: {}, invoice, config })).toThrow(/customer/i);
  expect(() => mapInvoiceToInvoiceShelfInvoice({ client, invoice: { ...invoice, invoice_number: '' }, config })).toThrow(/number/i);
  expect(() => mapInvoiceToInvoiceShelfInvoice({ client, invoice: { ...invoice, due_date: '2026-02-30' }, config })).toThrow(/date/i);
});

test('payment amounts also use exact minor units and the mapped invoice identity', () => {
  expect(mapPaymentToInvoiceShelfPayment({ invoice: { invoiceshelf_invoice_id: '51' },
    payment: { amount: '0.29', paid_date: '2026-09-21', method: 'check', reference: '1001' } })).toMatchObject({
    invoice_id: 51, amount: 29, payment_date: '2026-09-21',
  });
});
