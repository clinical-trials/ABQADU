import {
  ESTIMATE_TRADES, createEstimate, createLine, getTradeItems,
  suggestTrades, calculateEstimate, buildBidPayload,
} from './quickEstimate';

const priced = (changes = {}) => ({
  ...createEstimate(), title: 'Backyard concrete', tax_pct: '7.625',
  items: [createLine({ description: 'Concrete installation', qty: '10', unit_cost: '100' })],
  ...changes,
});

test('unentered tax never becomes a zero-tax quote', () => {
  const draft = priced({ tax_pct: '' });
  expect(calculateEstimate(draft)).toMatchObject({
    subtotal: 1000, markup: 600, contingency: 50, preTax: 1650,
    tax: null, total: null, ready: false,
  });
  expect(() => buildBidPayload(draft)).toThrow(/tax/i);
  expect(calculateEstimate({ ...draft, tax_pct: '0' })).toMatchObject({ total: 1650, ready: true });
});

test('unknown quantities and costs remain unknown while explicit zero cost is valid', () => {
  const draft = priced({ items: [
    createLine({ description: 'Included work', unit_cost: '0' }),
    createLine({ description: 'Undetermined material', qty: '', unit_cost: '10' }),
    createLine({ description: 'Unquoted labor', unit_cost: '' }),
  ] });
  expect(calculateEstimate(draft)).toMatchObject({ subtotal: 0, unpricedCount: 2, total: null, ready: false });
  expect(calculateEstimate({ ...draft, items: draft.items.slice(0, 1) })).toMatchObject({ total: 0, ready: true });
});

test('aggregate calculations match bid rounding rather than rounding individual rows or allowances early', () => {
  const result = calculateEstimate(priced({
    markup_pct: '60', contingency_pct: '5', tax_pct: '7.625',
    items: [
      createLine({ description: 'First supply', qty: '0.33', unit_cost: '0.05' }),
      createLine({ description: 'Second supply', qty: '0.33', unit_cost: '0.05' }),
    ],
  }));
  // Raw subtotal .033, markup .0198, contingency .00165,
  // pre-tax .05445, tax .0041518125, total .0586018125.
  expect(result).toMatchObject({ subtotal: 0.03, markup: 0.02, contingency: 0, preTax: 0.05, tax: 0, total: 0.06, ready: true });
});

test('100 percent markup doubles costs before contingency and tax', () => {
  expect(calculateEstimate(priced({ markup_pct: '100', contingency_pct: '0', tax_pct: '0' })))
    .toMatchObject({ subtotal: 1000, markup: 1000, total: 2000, ready: true });
});

test.each(['1e3', 'Infinity', '-1', '1,000', '0x10', true, [], {}, NaN, Infinity])(
  'rejects malformed cost %p without numeric coercion', value => {
    const result = calculateEstimate(priced({ items: [createLine({ description: 'Material', unit_cost: value })] }));
    expect(result.ready).toBe(false);
    expect(result.total).toBeNull();
    expect(result.errors.join(' ')).toMatch(/cost/i);
  },
);

test.each([
  ['qty', '0'], ['qty', '0.001'], ['qty', '1000000.01'],
  ['unit_cost', '1.001'], ['unit_cost', '1000000.01'],
])('rejects line %s outside quantity/cost database precision or range: %s', (key, value) => {
  expect(calculateEstimate(priced({ items: [createLine({ description: 'Work', unit_cost: '1', [key]: value })] })).ready).toBe(false);
});

test.each([
  ['markup_pct', '1000'], ['markup_pct', '60.001'], ['markup_pct', ''],
  ['contingency_pct', '100.01'], ['contingency_pct', '5.001'],
  ['tax_pct', '100'], ['tax_pct', '7.6251'], ['tax_pct', '-1'],
])('rejects invalid %s: %s', (key, value) => {
  const result = calculateEstimate(priced({ [key]: value }));
  expect(result.ready).toBe(false);
  expect(result.total).toBeNull();
  expect(result.errors.length).toBeGreaterThan(0);
});

test('accepted numeric values survive payload conversion without default tax or markup substitution', () => {
  const draft = priced({ markup_pct: 0, contingency_pct: 0, tax_pct: 0, client_id: '12' });
  expect(buildBidPayload(draft)).toEqual({
    title: 'Backyard concrete', client_id: '12', project_id: null,
    markup_pct: 0, contingency_pct: 0, tax_pct: 0, notes: '',
    items: [{ category: 'Materials', description: 'Concrete installation', qty: 10, unit: 'ea', unit_cost: 100, sort_order: 0 }],
  });
});

test.each(['abc', '0', '-3', '1.2', '1e2', {}, true, '2147483648', '9007199254740993'])('rejects invalid client identity %p', client_id => {
  expect(calculateEstimate(priced({ client_id })).ready).toBe(false);
  expect(() => buildBidPayload(priced({ client_id }))).toThrow(/client/i);
});

test('empty estimates and blank descriptions cannot become bids', () => {
  for (const draft of [createEstimate(), priced({ title: ' ' }), priced({ items: [] }), priced({ items: [createLine({ unit_cost: '10' })] })]) {
    expect(calculateEstimate(draft).ready).toBe(false);
    expect(() => buildBidPayload(draft)).toThrow();
  }
});

test('missing array entries cannot bypass line validation', () => {
  const items = new Array(2);
  items[1] = createLine({ description: 'Quoted labor', unit_cost: '20' });
  expect(calculateEstimate(priced({ items })).ready).toBe(false);
  expect(() => buildBidPayload(priced({ items }))).toThrow(/line 1/i);
});

test('valid quote text remains text, including markup-looking homeowner notes', () => {
  const draft = priced({ title: '<b>Paint</b>', scope: '<script>alert(1)</script>' });
  expect(buildBidPayload(draft)).toMatchObject({ title: '<b>Paint</b>', notes: '<script>alert(1)</script>', client_id: null });
});

test.each([
  { title: 't'.repeat(201) }, { scope: 'n'.repeat(5001) },
  { items: Array.from({ length: 101 }, () => createLine({ description: 'Work', unit_cost: '1' })) },
  { items: [createLine({ description: 'd'.repeat(301), unit_cost: '1' })] },
  { items: [createLine({ description: 'Work', unit: 'u'.repeat(21), unit_cost: '1' })] },
  { items: [createLine({ description: 'Work', category: 'c'.repeat(81), unit_cost: '1' })] },
  { items: [null] }, { items: {} }, { scope: {} },
])('rejects oversized or malformed estimate fields %#', change => {
  expect(calculateEstimate(priced(change)).ready).toBe(false);
});

test('amounts too large for downstream invoice storage cannot be submitted', () => {
  const result = calculateEstimate(priced({ items: [createLine({ description: 'Work', qty: '1000000', unit_cost: '1000000' })] }));
  expect(result.ready).toBe(false);
  expect(result.total).toBeNull();
  expect(result.errors.join(' ')).toMatch(/maximum|large|limit/i);
});

test('trade templates are independent fresh rows without fabricated prices', () => {
  for (const trade of ESTIMATE_TRADES) {
    const first = getTradeItems(trade.id);
    const second = getTradeItems(trade.id);
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.length).toBeLessThanOrEqual(6);
    expect(first.every(item => item.description && item.unit && item.qty === '' && item.unit_cost === '')).toBe(true);
    expect(first.every((item, index) => item.id !== second[index].id)).toBe(true);
    first[0].unit_cost = '123';
    expect(second[0].unit_cost).toBe('');
  }
  expect(getTradeItems('unknown')).toEqual([]);
});

test('scope suggestions recognize common trades without irrelevant substring matches', () => {
  expect(suggestTrades('Replace windows, repair stucco, and pour a concrete walkway.')).toEqual(['concrete', 'stucco', 'windows']);
  expect(suggestTrades('Clean house and do yardwork')).toEqual(['yardwork', 'cleaning']);
  expect(suggestTrades('Shadowbox measurement and windowless art')).toEqual([]);
  expect(suggestTrades(null)).toEqual([]);
});

test('environment filters keep indoor work separate while retaining shared trades', () => {
  const tradesFor = environment => ESTIMATE_TRADES.filter(trade => trade.environment === environment || trade.environment === 'both').map(trade => trade.id);
  const outdoor = tradesFor('outdoor');
  const indoor = tradesFor('indoor');
  for (const id of ['concrete', 'stucco', 'yardwork', 'sitework', 'utilities', 'drainage', 'fencing', 'pavers', 'roofing', 'decks']) {
    expect(outdoor).toContain(id);
    expect(indoor).not.toContain(id);
  }
  for (const id of ['kitchen', 'bathroom', 'cleaning']) {
    expect(indoor).toContain(id);
    expect(outdoor).not.toContain(id);
  }
  for (const id of ['adu', 'windows', 'painting', 'other']) {
    expect(indoor).toContain(id);
    expect(outdoor).toContain(id);
  }
});

test.each([
  ['sitework', ['cu yd', 'day', 'hr'], /excavation/i, /hauling/i],
  ['utilities', ['allowance', 'linear ft'], /water/i, /electrical/i, /sewer/i, /locat/i, /restor/i],
  ['drainage', ['linear ft', 'ea', 'cu yd', 'hr'], /trench/i, /pipe/i, /catch basin/i],
  ['fencing', ['ea', 'linear ft', 'hr'], /posts/i, /panels/i, /gates/i],
  ['pavers', ['cu yd', 'sq ft', 'hr'], /base/i, /bedding/i, /pavers/i],
  ['roofing', ['sq ft', 'linear ft', 'hr', 'load'], /slope area/i, /flashing/i, /disposal/i],
  ['decks', ['sq ft', 'allowance', 'hr'], /foundation/i, /cover/i, /deck/i],
])('%s supplies a distinct outdoor scope with suitable measurement units and no assumed price', (id, units, ...scopes) => {
  const items = getTradeItems(id);
  const descriptions = items.map(item => item.description).join('\n');
  expect(items.length).toBeGreaterThanOrEqual(3);
  expect(items.every(item => item.qty === '' && item.unit_cost === '')).toBe(true);
  for (const unit of units) expect(items.some(item => item.unit === unit)).toBe(true);
  for (const scope of scopes) expect(descriptions).toMatch(scope);
  expect(calculateEstimate(priced({ items })).ready).toBe(false);
  expect(() => buildBidPayload(priced({ items }))).toThrow(/quantity|cost/i);
});

test.each([
  ['Excavate the site and provide sitework, grading, and haul-off.', ['sitework']],
  ['Review water service, electrical service and sewer connections.', ['utilities']],
  ['Install a French drain and catch basins for drainage.', ['drainage']],
  ['Replace fence posts, fencing panels and gates.', ['fencing']],
  ['Lay patio pavers and hardscape paths.', ['pavers']],
  ['Repair roof flashing and replace roofing.', ['roofing']],
  ['Build a covered deck and portal.', ['decks']],
  ['Pavers, fencing, drainage and a deck need review.', ['drainage', 'fencing', 'pavers', 'decks']],
])('outdoor scope suggestions recognize %s', (scope, expected) => {
  expect(suggestTrades(scope)).toEqual(expected);
});

test('outdoor scope suggestions avoid unrelated substrings and preserve the existing concrete starter', () => {
  expect(suggestTrades('A waterproof bookshelf, ungraded homework, safeguard policy, and deckle paper.')).toEqual([]);
  expect(getTradeItems('concrete').map(({ category, description, unit }) => ({ category, description, unit }))).toEqual([
    { category: 'Labor', description: 'Excavation and subgrade preparation', unit: 'hr' },
    { category: 'Materials', description: 'Forms, base, and reinforcement', unit: 'allowance' },
    { category: 'Materials', description: 'Concrete supply and delivery', unit: 'cu yd' },
    { category: 'Labor', description: 'Concrete placement and finishing', unit: 'hr' },
    { category: 'Equipment', description: 'Equipment rental and cleanup', unit: 'day' },
  ]);
});
