// Bid total calculations — subtotal, markup, contingency, tax, grand total
// Creation default only: saved bids continue to use their own percentage.
const DEFAULT_BID_MARKUP_PCT = 60;
const { buildFourInvoiceSchedule } = require('./drawSchedule');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// items: [{ qty, unit_cost }]
// bid:   { markup_pct, contingency_pct, tax_pct }
function computeBidTotals(items, bid) {
  const subtotal = (items || []).reduce(
    (sum, i) => sum + (parseFloat(i.qty || 0) * parseFloat(i.unit_cost || 0)),
    0
  );

  const markupPct = parseFloat(bid?.markup_pct || 0);
  const contingencyPct = parseFloat(bid?.contingency_pct || 0);
  const taxPct = parseFloat(bid?.tax_pct || 0);

  const markup = subtotal * (markupPct / 100);
  const contingency = subtotal * (contingencyPct / 100);
  const preTax = subtotal + markup + contingency;
  const tax = preTax * (taxPct / 100);
  const total = preTax + tax;

  return {
    subtotal: round2(subtotal),
    markup: round2(markup),
    contingency: round2(contingency),
    preTax: round2(preTax),
    tax: round2(tax),
    total: round2(total),
  };
}

// New schedules credit preconstruction toward the quoted total.
const buildDrawSchedule = buildFourInvoiceSchedule;

// Convert a design BOM into bid line items
function bomToLineItems(bom) {
  if (!bom || !bom.items) return [];
  return bom.items.map((item, i) => ({
    category: item.category || 'General',
    description: item.label,
    qty: item.qty || 1,
    unit: item.unit || 'ea',
    unit_cost: item.costPerUnit || 0,
    sort_order: i,
  }));
}

module.exports = { DEFAULT_BID_MARKUP_PCT, computeBidTotals, buildDrawSchedule, bomToLineItems, round2 };
