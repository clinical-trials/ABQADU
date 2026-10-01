import { parseReceiptDraft, validateReceiptReview } from './parseReceiptDraft';

test('suggests the grand total instead of subtotal, tax, or cash tendered', () => {
  expect(parseReceiptDraft("SAMPLE HARDWARE\n10/01/2026\nSUBTOTAL $100.00\nTAX $7.63\nGRAND TOTAL $107.63\nCASH $120.00\nCHANGE $12.37"))
    .toMatchObject({ vendor: 'SAMPLE HARDWARE', date: '2026-10-01', amount: '107.63' });
});

test('a clearly labelled grand total takes precedence over an earlier total', () => {
  expect(parseReceiptDraft('Hardware\nTOTAL 100.00\nGRAND TOTAL 107.63').amount).toBe('107.63');
});

test('subtotal and savings alone never become the amount', () => {
  const draft = parseReceiptDraft('Hardware\nSUBTOTAL $75.00\nTOTAL SAVINGS $4.00');
  expect(draft.amount).toBe('');
  expect(draft.warnings.join(' ')).toMatch(/total/i);
});

test('conflicting equally ranked totals remain blank for review', () => {
  const draft = parseReceiptDraft('Hardware\nTOTAL $20.00\nTOTAL $30.00');
  expect(draft.amount).toBe('');
  expect(draft.warnings.join(' ')).toMatch(/multiple|conflict/i);
});

test('dates use explicit calendar values without guessing missing years or invalid days', () => {
  expect(parseReceiptDraft('Hardware\n2026-10-01\nTOTAL $1,284.76')).toMatchObject({ date: '2026-10-01', amount: '1284.76' });
  expect(parseReceiptDraft('Hardware\n02/31/2026\nTOTAL 1.00').date).toBe('');
  expect(parseReceiptDraft('Hardware\n10/01/26\nTOTAL 1.00').date).toBe('');
});

test('multiple unlabeled dates remain open for review rather than picking a coupon date', () => {
  const draft = parseReceiptDraft('Hardware\n10/01/2026\nCoupon expires 10/31/2026\nTOTAL 1.00');
  expect(draft.date).toBe('');
  expect(parseReceiptDraft('Hardware\nDate: 10/01/2026\nCoupon expires 10/31/2026\nTOTAL 1.00').date).toBe('2026-10-01');
});

test('a blank manual receipt remains blank instead of introducing demo receipt data', () => {
  expect(parseReceiptDraft('')).toMatchObject({ vendor: '', date: '', amount: '' });
});

test('missing or excessive receipt text does not throw or fabricate a total', () => {
  expect(parseReceiptDraft(null)).toMatchObject({ vendor: '', date: '', amount: '' });
  expect(parseReceiptDraft('a'.repeat(20001)).amount).toBe('');
});

test.each([
  { vendor: '', date: '2026-10-01', amount: '10.00' },
  { vendor: 'x'.repeat(121), date: '2026-10-01', amount: '10.00' },
  { vendor: 'Hardware', date: '', amount: '10.00' },
  { vendor: 'Hardware', date: '2026-02-31', amount: '10.00' },
  ...['', '0', '-5', '1e3', 'Infinity', '10.001', '1000000.01', '$10', {}, true].map(amount => ({ vendor: 'Hardware', date: '2026-10-01', amount })),
])('review rejects missing or malformed accounting fields %#', draft => {
  expect(validateReceiptReview(draft).length).toBeGreaterThan(0);
});

test('a positive reviewed total accepts cents and preserves user text as text', () => {
  expect(validateReceiptReview({ vendor: '<b>Hardware</b>', date: '2026-10-01', amount: '284.76' })).toEqual([]);
});
