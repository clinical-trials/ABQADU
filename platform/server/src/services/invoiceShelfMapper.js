function centsSafeNumber(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function mapClientToInvoiceShelfCustomer(client = {}) {
  return {
    name: client.name || 'ABQ ADU Client',
    email: client.email || null,
    phone: client.phone || null,
    billing: {
      address_street_1: client.address || '',
      country_id: null,
      state: 'NM',
      city: 'Albuquerque',
    },
    notes: client.notes || '',
  };
}

function customerFacingItems(items = []) {
  return items.filter(item => {
    const category = String(item.category || '').toLowerCase();
    const description = String(item.description || '').toLowerCase();
    return !item.internal_only && !category.includes('cogs') && !description.includes('internal cogs');
  });
}

function mapBidToInvoiceShelfEstimate({ client = {}, bid = {}, items = [], totals = {} }) {
  return {
    estimate_number: bid.bid_number || `BID-${bid.id}`,
    customer_name: client.name || 'ABQ ADU Client',
    expiry_date: bid.valid_until || null,
    status: 'DRAFT',
    notes: 'ABQ ADU planning estimate. Final contract depends on site review, utilities, sewer confirmation study, permitting, and engineering review.',
    tax_per_item: false,
    discount_per_item: false,
    items: customerFacingItems(items).map(item => ({
      name: item.category || 'ADU construction',
      description: item.description,
      quantity: centsSafeNumber(item.qty || 1),
      price: centsSafeNumber(item.unit_cost || item.price || 0),
      unit_name: item.unit || 'ea',
    })),
    custom_fields: {
      abq_bid_id: bid.id,
      abq_total: centsSafeNumber(totals.total),
    },
  };
}

function mapInvoiceToInvoiceShelfInvoice({ client = {}, invoice = {} }) {
  return {
    invoice_number: invoice.invoice_number,
    customer_name: client.name || 'ABQ ADU Client',
    due_date: invoice.due_date || null,
    status: 'DRAFT',
    notes: 'ABQ ADU invoice generated from the builder platform.',
    items: [{
      name: invoice.draw_type || 'Construction draw',
      description: invoice.description || 'Construction draw',
      quantity: 1,
      price: centsSafeNumber(invoice.amount),
      unit_name: 'draw',
    }],
    custom_fields: {
      abq_invoice_id: invoice.id,
    },
  };
}

function mapPaymentToInvoiceShelfPayment({ invoice = {}, payment = {} }) {
  return {
    invoice_id: invoice.invoiceshelf_invoice_id,
    amount: centsSafeNumber(payment.amount),
    payment_date: payment.paid_date || new Date().toISOString().slice(0, 10),
    payment_method: payment.method || 'check',
    notes: payment.reference || '',
  };
}

module.exports = {
  mapClientToInvoiceShelfCustomer,
  mapBidToInvoiceShelfEstimate,
  mapInvoiceToInvoiceShelfInvoice,
  mapPaymentToInvoiceShelfPayment,
};
