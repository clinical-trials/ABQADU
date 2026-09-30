const { calculateCashScenario, CashScenarioValidationError } = require('../src/services/cashScenario');

const now = new Date('2026-10-01T00:30:00.000Z');
const inputs = overrides => ({ opening_cash: '100.01', weekly_inflow: '0.10', weekly_outflow: '0.03', collection_delay_weeks: 0, ...overrides });
const calculate = body => calculateCashScenario(body, { now });

test('uses exact cents for all thirteen end-of-week balances without mutating the inputs', () => {
  const body = Object.freeze(inputs());
  const result = calculate(body);
  expect(result).toMatchObject({ generated_at: now.toISOString(), as_of: '2026-09-30', currency: 'USD',
    assumptions: { opening_cash_cents: 10001, weekly_inflow_cents: 10, weekly_outflow_cents: 3, collection_delay_weeks: 0 },
    lowest_cash_cents: 10008, ending_cash_cents: 10092, first_negative_week: null, receipts_after_horizon_cents: 0 });
  expect(result.weeks).toHaveLength(13);
  expect(result.weeks[0]).toEqual({ week: 1, start_date: '2026-09-30', end_date: '2026-10-06', inflow_cents: 10, outflow_cents: 3, closing_cash_cents: 10008 });
  expect(result.weeks.map(week => week.closing_cash_cents)).toEqual(Array.from({ length: 13 }, (_, index) => 10001 + (index + 1) * 7));
  expect(result.basis).toMatch(/user.*inputs/i);
  expect(result.basis).toMatch(/end.of.week/i);
  expect(result.basis).toMatch(/not saved/i);
});

test.each([1, 2, 3, 4])('%i weeks of collection delay shifts receipts beyond the horizon without shifting costs', delay => {
  const result = calculate(inputs({ opening_cash: '0', weekly_inflow: '100', weekly_outflow: '25', collection_delay_weeks: delay }));
  expect(result.weeks.map(week => week.inflow_cents)).toEqual(Array.from({ length: 13 }, (_, index) => index < delay ? 0 : 10000));
  expect(result.weeks.every(week => week.outflow_cents === 2500)).toBe(true);
  expect(result.receipts_after_horizon_cents).toBe(delay * 10000);
  expect(result.weeks.reduce((sum, week) => sum + week.inflow_cents, 0) + result.receipts_after_horizon_cents).toBe(130000);
  expect(result.ending_cash_cents).toBe((13 - delay) * 10000 - 13 * 2500);
  expect(result.lowest_cash_cents).toBe(-delay * 2500);
  expect(result.first_negative_week).toBe(1);
});

test('explicit zero assumptions are valid and zero balance is not a negative week', () => {
  const result = calculate(inputs({ opening_cash: '0.00', weekly_inflow: '0', weekly_outflow: '0', collection_delay_weeks: 4 }));
  expect(result.weeks.every(week => week.closing_cash_cents === 0)).toBe(true);
  expect(result).toMatchObject({ ending_cash_cents: 0, lowest_cash_cents: 0, first_negative_week: null, receipts_after_horizon_cents: 0 });
});

test('first negative week follows a zero balance and projections can be negative', () => {
  const result = calculate(inputs({ opening_cash: '20', weekly_inflow: '0', weekly_outflow: '10' }));
  expect(result.weeks.slice(0, 3).map(week => week.closing_cash_cents)).toEqual([1000, 0, -1000]);
  expect(result).toMatchObject({ first_negative_week: 3, ending_cash_cents: -11000, lowest_cash_cents: -11000 });
});

test('maximum accepted values and their thirteen-week sums remain exact safe integers', () => {
  const result = calculate(inputs({ opening_cash: '100000000.00', weekly_inflow: '100000000.00', weekly_outflow: '0' }));
  expect(result.ending_cash_cents).toBe(140000000000);
  expect(result.weeks.every(week => Number.isSafeInteger(week.closing_cash_cents))).toBe(true);
});

test.each(['opening_cash', 'weekly_inflow', 'weekly_outflow'])('%s requires a bounded explicit dollar string', field => {
  for (const value of [undefined, null, '', ' ', ' 1.00', '1.00 ', '-1', '-0', '+1', '1.001', '.50', '1.', '1e3', 'Infinity', 'NaN', '$1', '1,000', '100000000.01', 1, true, [], ['1.00'], {}]) {
    expect(() => calculate(inputs({ [field]: value }))).toThrow(CashScenarioValidationError);
  }
});

test.each([undefined, null, '', '0', -1, 5, 0.5, NaN, Infinity, false, []])('invalid collection delay %j is rejected', collection_delay_weeks => {
  expect(() => calculate(inputs({ collection_delay_weeks }))).toThrow(CashScenarioValidationError);
});

test.each([undefined, null, [], 'scenario', 4, {}])('missing or nonobject request %j is rejected', body => {
  expect(() => calculate(body)).toThrow(CashScenarioValidationError);
});

test('unknown fields cannot silently introduce unmodeled assumptions', () => {
  expect(() => calculate(inputs({ starting_bank_balance: '5000' }))).toThrow(CashScenarioValidationError);
});

test.each([
  ['2027-01-01T06:30:00Z', '2026-12-31', '2027-01-06', '2027-01-07'],
  ['2027-03-13T19:00:00Z', '2027-03-13', '2027-03-19', '2027-03-20'],
  ['2026-10-31T18:00:00Z', '2026-10-31', '2026-11-06', '2026-11-07'],
])('calendar weeks follow Albuquerque dates across year and DST boundaries: %s', (timestamp, first, end, second) => {
  const result = calculateCashScenario(inputs(), { now: new Date(timestamp) });
  expect(result.as_of).toBe(first);
  expect(result.weeks[0]).toMatchObject({ start_date: first, end_date: end });
  expect(result.weeks[1].start_date).toBe(second);
  for (let index = 1; index < result.weeks.length; index += 1) {
    expect(Date.parse(result.weeks[index].start_date) - Date.parse(result.weeks[index - 1].start_date)).toBe(7 * 86400000);
  }
});
