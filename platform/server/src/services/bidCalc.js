// Bid total calculations — subtotal, markup, contingency, tax, grand total

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

// Standard ADU draw schedule from a bid total
function buildDrawSchedule(total) {
  return [
    { draw_type: 'deposit',  description: 'Deposit / mobilization (20%)',        pct: 0.20 },
    { draw_type: 'progress', description: 'Foundation & framing complete (30%)', pct: 0.30 },
    { draw_type: 'progress', description: 'Dry-in, MEP rough-in complete (25%)', pct: 0.25 },
    { draw_type: 'progress', description: 'Finishes & fixtures complete (15%)',  pct: 0.15 },
    { draw_type: 'final',    description: 'Final / certificate of occupancy (10%)', pct: 0.10 },
  ].map(d => ({
    draw_type: d.draw_type,
    description: d.description,
    amount: round2(total * d.pct),
  }));
}

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

module.exports = { computeBidTotals, buildDrawSchedule, bomToLineItems, round2 };
