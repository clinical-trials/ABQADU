const { buildFourInvoiceSchedule } = require('../src/services/drawSchedule');

test('the preconstruction deposit is credited before the remaining 50/25/25 installments', () => {
  const draws = buildFourInvoiceSchedule(100000);
  expect(draws.map(draw => draw.amount)).toEqual([10000, 45000, 22500, 22500]);
  expect(draws.map(draw => draw.draw_type)).toEqual(['deposit', 'progress', 'progress', 'final']);
  expect(draws.map(draw => draw.suggested_send_day)).toEqual([0, 14, 45, 75]);
  expect(draws[0].description).toMatch(/credited/i);
  expect(draws[1].description).toMatch(/50%.*remaining/i);
  expect(draws[2].description).toMatch(/25%.*remaining/i);
  expect(draws[3].description).toMatch(/25%.*remaining/i);
});

test.each([
  ['100000.01', [10000, 45000.01, 22500, 22500], 10000001],
  ['100000.03', [10000, 45000.02, 22500.01, 22500], 10000003],
  ['10000.04', [10000, 0.02, 0.01, 0.01], 1000004],
  ['9999999999.99', [10000, 4999995000, 2499997500, 2499997499.99], 999999999999],
])('exact cents for total %s produce four positive invoices with the final remainder', (total, amounts, totalCents) => {
  const draws = buildFourInvoiceSchedule(total);
  expect(draws.map(draw => draw.amount)).toEqual(amounts);
  expect(draws.every(draw => draw.amount > 0)).toBe(true);
  expect(draws.reduce((sum, draw) => sum + Math.round(draw.amount * 100), 0)).toBe(totalCents);
});

test.each([undefined, null, '', ' ', {}, [], NaN, Infinity, -1, 0, 9999, 10000, 10000.01, 10000.02, 10000.03,
  '10000.001', '1e5', '$100,000', '10000000000.00'])('invalid or insufficient total %s cannot produce an invoice schedule', total => {
  expect(() => buildFourInvoiceSchedule(total)).toThrow();
  try { buildFourInvoiceSchedule(total); } catch (error) { expect(error.status).toBe(400); }
});
