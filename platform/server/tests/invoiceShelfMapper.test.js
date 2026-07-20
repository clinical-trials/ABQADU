const {
  mapClientToInvoiceShelfCustomer,
  mapBidToInvoiceShelfEstimate,
  mapInvoiceToInvoiceShelfInvoice,
  mapPaymentToInvoiceShelfPayment,
} = require('../src/services/invoiceShelfMapper');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const client = {
  id: 42,
  name: 'Julia Blog',
  email: 'julia@example.com',
  phone: '505-555-0100',
  address: '4027 Mackland Ave NE, Albuquerque, NM 87110',
};

const bid = {
  id: 9,
  bid_number: 'BID-2026-0009',
  title: 'Mackland Altura ADU',
  tax_pct: 7.625,
  valid_until: '2026-08-20',
};

const items = [
  { category: 'Construction', description: 'Altura 2BR ADU consumer build price', qty: 600, unit: 'sf', unit_cost: 285 },
  { category: 'Internal COGS', description: 'Muras SIP/PUR panel supplier comparison', qty: 1, unit: 'pkg', unit_cost: 16000, internal_only: true },
];

const customer = mapClientToInvoiceShelfCustomer(client);
assert(customer.name === 'Julia Blog', 'Customer name should map');
assert(customer.email === 'julia@example.com', 'Customer email should map');

const estimate = mapBidToInvoiceShelfEstimate({
  client,
  bid,
  items,
  totals: { total: 171000 },
});

assert(estimate.estimate_number === 'BID-2026-0009', 'Estimate number should use bid number');
assert(estimate.items.length === 1, 'Internal COGS item should not be customer-facing');
assert(estimate.items[0].name === 'Construction', 'Item name should use category');
assert(estimate.items[0].description.includes('Altura 2BR'), 'Customer-facing description should map');
assert(!JSON.stringify(estimate).includes('Muras SIP'), 'Internal supplier COGS must be excluded');

const inv = mapInvoiceToInvoiceShelfInvoice({
  client,
  invoice: { invoice_number: 'INV-2026-0001', description: '$10,000 Preconstruction Contract', amount: 10000, due_date: '2026-07-30' },
});
assert(inv.invoice_number === 'INV-2026-0001', 'Invoice number should map');
assert(inv.items[0].price === 10000, 'Preconstruction amount should map');

const payment = mapPaymentToInvoiceShelfPayment({
  invoice: { invoiceshelf_invoice_id: 'remote-invoice-1' },
  payment: { amount: 10000, method: 'check', reference: 'check 1001', paid_date: '2026-07-20' },
});
assert(payment.invoice_id === 'remote-invoice-1', 'Remote invoice id should map to payment');
assert(payment.amount === 10000, 'Payment amount should map');

console.log('InvoiceShelf mapper tests passed');
