const { computeBidTotals, buildDrawSchedule, bomToLineItems } = require('../src/services/bidCalc');

test('computeBidTotals: subtotal, markup, contingency, tax, total', () => {
  const items = [
    { qty: 10, unit_cost: 100 },   // 1000
    { qty: 2,  unit_cost: 250 },   // 500
  ];
  const bid = { markup_pct: 20, contingency_pct: 5, tax_pct: 7.625 };
  const t = computeBidTotals(items, bid);

  expect(t.subtotal).toBe(1500);
  expect(t.markup).toBe(300);          // 20% of 1500
  expect(t.contingency).toBe(75);      // 5% of 1500
  expect(t.preTax).toBe(1875);
  expect(t.tax).toBe(142.97);          // 7.625% of 1875, rounded
  expect(t.total).toBe(2017.97);
});

test('computeBidTotals: empty items yields zero total', () => {
  const t = computeBidTotals([], { markup_pct: 18, tax_pct: 7.625 });
  expect(t.subtotal).toBe(0);
  expect(t.total).toBe(0);
});

test.each([[60, 60000, 160000], [100, 100000, 200000]])('a %s percent markup adds to cost rather than becoming a percentage margin', (percentage, markup, total) => {
  const result = computeBidTotals([{ qty: 1, unit_cost: 100000 }], { markup_pct: percentage, contingency_pct: 0, tax_pct: 0 });
  expect(result).toEqual({ subtotal: 100000, markup, contingency: 0, preTax: total, tax: 0, total });
});

test('missing saved markup remains zero rather than inheriting the new-bid default', () => {
  expect(computeBidTotals([{ qty: 1, unit_cost: 100000 }], {}).total).toBe(100000);
});

test('buildDrawSchedule: four credited-deposit draws sum to the quoted total', () => {
  const draws = buildDrawSchedule(100000);
  expect(draws).toHaveLength(4);
  const sum = draws.reduce((s, d) => s + d.amount, 0);
  expect(sum).toBe(100000);
  expect(draws[0].draw_type).toBe('deposit');
  expect(draws.map(draw => draw.amount)).toEqual([10000, 45000, 22500, 22500]);
  expect(draws[3].draw_type).toBe('final');
});

test('bomToLineItems: maps BOM items to bid line items', () => {
  const bom = { items: [{ category: 'Structure', label: 'Foundation/slab', qty: 576, unit: 'sf', costPerUnit: 18 }] };
  const items = bomToLineItems(bom);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ category: 'Structure', description: 'Foundation/slab', qty: 576, unit: 'sf', unit_cost: 18 });
});
