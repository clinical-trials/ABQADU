import { MEASUREMENT_TYPES, calculateOutdoorQuantity } from './outdoorEstimate';

test.each([
  ['area', { length: '12', width: '20' }, 240, 'sq ft'],
  ['concrete', { length: '10', width: '12', depth: '4' }, 1.49, 'cu yd'],
  ['excavation', { length: '9', width: '9', depth: '3' }, 9, 'cu yd'],
  ['wall', { length: '40', height: '9', openings: '30' }, 330, 'sq ft'],
  ['fence', { length: '100', openings: '12' }, 88, 'linear ft'],
])('%s converts measured dimensions into a usable bid quantity', (type, inputs, quantity, unit) => {
  const result = calculateOutdoorQuantity(type, inputs);
  expect(result).toMatchObject({ ready: true, quantity, unit, errors: [] });
  expect(result.description).toMatch(/0% waste/);
  expect(result.description.length).toBeLessThanOrEqual(300);
  expect(result.formula).toContain(String(quantity));
});

test('concrete thickness is inches while excavation depth is feet', () => {
  expect(calculateOutdoorQuantity('concrete', { length: '9', width: '9', depth: '3' }).quantity).toBe(0.75);
  expect(calculateOutdoorQuantity('excavation', { length: '9', width: '9', depth: '3' }).quantity).toBe(9);
});

test('wall openings are deducted before explicit waste is added', () => {
  const result = calculateOutdoorQuantity('wall', { length: '40', height: '9', openings: '30', waste_pct: '5' });
  expect(result).toMatchObject({ ready: true, quantity: 346.5, unit: 'sq ft' });
  expect(result.description).toContain('40 ft');
  expect(result.description).toContain('9 ft');
  expect(result.description).toContain('30 sq ft');
  expect(result.description).toContain('5% waste');
});

test('fence gate deduction uses linear feet before waste', () => {
  const result = calculateOutdoorQuantity('fence', { length: '100', openings: '12', waste_pct: '10' });
  expect(result).toMatchObject({ ready: true, quantity: 96.8, unit: 'linear ft' });
  expect(result.description).toContain('12 ft');
  expect(result.description).toContain('10% waste');
});

test('blank optional openings and waste mean no deduction or allowance', () => {
  expect(calculateOutdoorQuantity('wall', { length: '10', height: '8', openings: '', waste_pct: '' }))
    .toMatchObject({ ready: true, quantity: 80 });
  expect(calculateOutdoorQuantity('fence', { length: '10' }))
    .toMatchObject({ ready: true, quantity: 10 });
});

test('quantities round up only once after the complete measured calculation', () => {
  expect(calculateOutdoorQuantity('area', { length: '0.33', width: '0.33', waste_pct: '10' }).quantity).toBe(0.12);
  expect(calculateOutdoorQuantity('area', { length: '0.3', width: '0.3' }).quantity).toBe(0.09);
  expect(calculateOutdoorQuantity('fence', { length: '0.29', waste_pct: '0' }).quantity).toBe(0.29);
  expect(calculateOutdoorQuantity('concrete', { length: '0.01', width: '0.01', depth: '0.01' }).quantity).toBe(0.01);
});

test.each([
  ['area', { length: '10' }],
  ['concrete', { length: '10', width: '12' }],
  ['excavation', { length: '10', width: '12', depth: '' }],
  ['wall', { length: '10', height: '' }],
  ['fence', { length: '' }],
])('%s requires measured dimensions rather than filling design defaults', (type, inputs) => {
  const result = calculateOutdoorQuantity(type, inputs);
  expect(result).toMatchObject({ ready: false, quantity: null });
  expect(result.errors.length).toBeGreaterThan(0);
});

test.each(['-1', '0', '1e2', 'Infinity', 'NaN', '1,000', '0x10', '1.001', '1000000.01', true, {}, [], 12])(
  'rejects invalid dimension %p without coercion', length => {
    expect(calculateOutdoorQuantity('area', { length, width: '5' })).toMatchObject({ ready: false, quantity: null });
  },
);

test.each(['-1', '100.01', '5.001', '1e2', {}, false])('rejects invalid waste percentage %p', waste_pct => {
  expect(calculateOutdoorQuantity('fence', { length: '10', waste_pct })).toMatchObject({ ready: false, quantity: null });
});

test('explicit zero waste and the 100 percent waste boundary are supported', () => {
  expect(calculateOutdoorQuantity('area', { length: '10', width: '10', waste_pct: '0' }).quantity).toBe(100);
  expect(calculateOutdoorQuantity('area', { length: '10', width: '10', waste_pct: '100' }).quantity).toBe(200);
});

test.each([
  ['wall', { length: '10', height: '8', openings: '80' }],
  ['wall', { length: '10', height: '8', openings: '81' }],
  ['fence', { length: '12', openings: '12' }],
  ['fence', { length: '12', openings: '13' }],
  ['wall', { length: '10', height: '8', openings: '-5' }],
])('rejects zero or negative effective measurements: %s', (type, inputs) => {
  expect(calculateOutdoorQuantity(type, inputs)).toMatchObject({ ready: false, quantity: null });
});

test('large measurements cannot overflow the bid quantity limit', () => {
  expect(calculateOutdoorQuantity('area', { length: '1000000', width: '1000000', waste_pct: '100' }))
    .toMatchObject({ ready: false, quantity: null });
  expect(calculateOutdoorQuantity('fence', { length: '1000000' }))
    .toMatchObject({ ready: true, quantity: 1000000 });
  expect(calculateOutdoorQuantity('fence', { length: '1000000', waste_pct: '0.01' }))
    .toMatchObject({ ready: false, quantity: null });
});

test.each(['unknown', '__proto__', null, {}, undefined])('unknown type %p returns a readable validation error', type => {
  expect(calculateOutdoorQuantity(type, { length: '10' })).toMatchObject({ ready: false, quantity: null });
  expect(calculateOutdoorQuantity(type, {}).errors.join(' ')).toMatch(/measurement type/i);
});

test.each([undefined, null, [], '10', false])('malformed inputs %p cannot produce a quantity', inputs => {
  expect(calculateOutdoorQuantity('area', inputs)).toMatchObject({ ready: false, quantity: null });
});

test('measurements retain useful context without mutating the input or metadata', () => {
  const inputs = Object.freeze({ length: '10.00', width: '12.00', depth: '4.00', waste_pct: '12.34' });
  const before = JSON.stringify(MEASUREMENT_TYPES);
  const result = calculateOutdoorQuantity('concrete', inputs);
  expect(inputs).toEqual({ length: '10.00', width: '12.00', depth: '4.00', waste_pct: '12.34' });
  expect(JSON.stringify(MEASUREMENT_TYPES)).toBe(before);
  expect(result.description).toContain('4 in');
  expect(result.description).toContain('12.34% waste');
  expect(result.description).toMatch(/rounded up/);
  expect(result.formula).toContain('27');
  expect(result.description.length).toBeLessThanOrEqual(300);
});
