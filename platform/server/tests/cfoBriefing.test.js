const { createCfoBriefingService } = require('../src/services/cfoBriefing');

const now = new Date('2026-10-01T00:30:00Z'); // September 30 in Albuquerque.
const job = (id = 'job-a', overrides = {}) => ({ id, client: 'Fixture job', bid_total: '100000.01', cogs_low: '60000.01', cogs_high: '70000.01', invoice_drafts: [], ...overrides });
const invoice = (id = 1, overrides = {}) => ({ id, invoice_number: `INV-${id}`, client_name: 'Fixture client', amount: '100.10', status: 'sent', issued_date: '2026-08-01', due_date: '2026-09-20', paid: '25.05', recorded_paid: '25.05', known_test_paid: '0', payment_count: '1', invalid_payment_count: '0', unresolved_payment_count: '0', ...overrides });
function setup({ state = { projects: [job()] }, rows = [invoice()], ...options } = {}) {
  const readState = jest.fn(async () => state);
  const query = jest.fn(async () => ({ rows }));
  return { readState, query, report: createCfoBriefingService({ readState, query, now: () => now, ...options }) };
}

test('the weekly preconstruction KPI is unknown without recorded milestones, not a zero-hour win', async () => {
  const { report, readState } = setup();
  const result = await report();
  expect(result.preconstruction_cycle).toMatchObject({ status: 'available', target: { deposit_cents: 1000000, goal_hours: 20, stretch_hours: 15 }, current_week: { count: 0, median_hours: null } });
  expect(result.narration).toContain(result.preconstruction_cycle.narration);
  expect(readState).toHaveBeenCalledTimes(1);
});

test('corrupt milestone history does not erase the rest of the CFO review or invent weekly results', async () => {
  const result = await setup({ state: { projects: [job()], preconstruction_cycles: 'invalid' } }).report();
  expect(result.jobs.count).toBe(1);
  expect(result.ledger.issued_balance_cents).toBe(7505);
  expect(result.preconstruction_cycle).toMatchObject({ status: 'unavailable' });
  expect(result.preconstruction_cycle.current_week).toBeUndefined();
  expect(result.narration).toMatch(/preconstruction.*unavailable/i);
});

test('the report calculates exact cents, Denver aging and estimate ranges without claiming bank cash', async () => {
  const { report, query } = setup();
  const result = await report();
  expect(result).toMatchObject({ generated_at: now.toISOString(), as_of: '2026-09-30', currency: 'USD', cash: { status: 'unknown' } });
  expect(result.ledger).toMatchObject({ status: 'available', invoice_count: 1, issued_count: 1, draft_count: 0, issued_balance_cents: 7505, overdue_balance_cents: 7505, recorded_payments_cents: 2505, known_test_payments_cents: 0, needs_review_count: 0 });
  expect(result.ledger.overdue_invoices[0]).toMatchObject({ id: 1, number: 'INV-1', balance_cents: 7505, days_overdue: 10 });
  expect(result.ledger.aging.find(row => row.id === '1_30')).toMatchObject({ balance_cents: 7505, count: 1 });
  expect(result.jobs.items[0]).toMatchObject({ status: 'estimated', bid_total_cents: 10000001, profit_low_cents: 3000000, profit_high_cents: 4000000 });
  expect(result.jobs.items[0].margin_low_pct).toBeCloseTo(30, 2);
  expect(result.jobs.message).toMatch(/overhead|tax/i);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toMatch(/^\s*WITH\s/i);
  expect(query.mock.calls[0][0]).toMatch(/GROUP BY p\.invoice_id/i);
  expect(query.mock.calls[0][1]).toEqual(['2026-09-30']);
});

test('a successfully read empty ledger is zero while two saved jobs remain useful', async () => {
  const result = await setup({ rows: [], state: { projects: [job(), job('job-b')] } }).report();
  expect(result.ledger).toMatchObject({ status: 'available', invoice_count: 0, issued_balance_cents: 0, recorded_payments_cents: 0 });
  expect(result.jobs).toMatchObject({ count: 2, priced_count: 2, bid_total_cents: 20000002, profit_low_cents: 6000000 });
  expect(result.cash.status).toBe('unknown');
});

test('drafts and remote paid labels never establish collectible invoices or recorded payments', async () => {
  const result = await setup({ rows: [invoice(1, { status: 'draft', amount: '200', paid: '0', recorded_paid: '0', payment_count: '0', invoiceshelf_remote_status: 'paid' })], state: { projects: [job('job-a', { invoice_drafts: [{ amount: 10000, status: 'Paid' }] })] } }).report();
  expect(result.ledger).toMatchObject({ issued_count: 0, draft_count: 1, issued_balance_cents: 0, overdue_balance_cents: 0, draft_total_cents: 20000, recorded_payments_cents: 0 });
  expect(result.jobs.items[0].draft_count).toBe(1);
  expect(result.ledger.overdue_invoices).toEqual([]);
});

test('Stripe test and unresolved online provenance are excluded from collection recommendations', async () => {
  const result = await setup({ rows: [
    invoice(1, { paid: '25', recorded_paid: '0', known_test_paid: '25' }),
    invoice(2, { paid: '25', recorded_paid: '0', unresolved_payment_count: '1' }),
    invoice(3),
  ] }).report();
  expect(result.ledger).toMatchObject({ status: 'partial', issued_balance_cents: 7505, overdue_balance_cents: 7505, recorded_payments_cents: 2505, known_test_payments_cents: 2500, needs_review_count: 2 });
  expect(result.ledger.overdue_invoices.map(row => row.id)).toEqual([3]);
  expect(result.ledger.message).toMatch(/test|unresolved/i);
});

test('all excluded issued invoices return unknown collectible totals instead of a false zero', async () => {
  const result = await setup({ rows: [invoice(1, { known_test_paid: '25.05', recorded_paid: '0' })] }).report();
  expect(result.ledger.issued_balance_cents).toBeNull();
  expect(result.ledger.overdue_balance_cents).toBeNull();
  expect(result.ledger.overdue_invoices).toEqual([]);
});

test.each([
  { amount: '-1' }, { amount: 'bad' }, { amount: '1.001' }, { status: 'void' },
  { paid: '-1', recorded_paid: '-1', invalid_payment_count: '1' },
  { paid: '101', recorded_paid: '101' }, { status: 'paid', paid: '0', recorded_paid: '0' },
  { invalid_payment_count: '1' },
])('corrupt ledger data is flagged and cannot appear as a collection amount: %j', async changes => {
  const result = await setup({ rows: [invoice(1, changes)] }).report();
  expect(result.ledger.needs_review_count).toBe(1);
  expect(result.ledger.overdue_invoices).toEqual([]);
  expect(result.ledger.issued_balance_cents).toBeNull();
});

test('missing or corrupt due dates stay unaged and are flagged instead of overdue', async () => {
  const result = await setup({ rows: [invoice(1, { due_date: null }), invoice(2, { due_date: '2026-02-30' })] }).report();
  expect(result.ledger).toMatchObject({ due_date_missing_count: 2, needs_review_count: 2, issued_balance_cents: 15010, overdue_balance_cents: null });
  expect(result.ledger.overdue_invoices).toEqual([]);
  expect(result.ledger.aging.find(row => row.id === 'undated')).toMatchObject({ balance_cents: 15010, count: 2 });
});

test('aging boundaries use calendar days and do not count future due dates as late', async () => {
  const dates = ['2026-10-01', '2026-09-30', '2026-09-29', '2026-08-31', '2026-08-30', '2026-08-01', '2026-07-31', '2026-07-02', '2026-07-01'];
  const result = await setup({ rows: dates.map((due_date, index) => invoice(index + 1, { due_date, paid: '0', recorded_paid: '0', payment_count: '0' })) }).report();
  expect(result.ledger.aging.map(row => [row.id, row.count])).toEqual([['current', 2], ['1_30', 2], ['31_60', 2], ['61_90', 2], ['over_90', 1], ['undated', 0]]);
});

test('missing or invalid job estimates remain unknown and receipt drafts do not change estimated COGS', async () => {
  const result = await setup({ state: { projects: [job(), job('job-b', { cogs_high: undefined }), job('job-c', { cogs_low: -1 }), job('job-d', { cogs_low: 80000, cogs_high: 70000 })], receipts: [{ project_id: 'job-a', amount: 999999 }], estimate_sections: [{ project_id: 'job-a', subtotal: 999999 }] } }).report();
  expect(result.jobs).toMatchObject({ status: 'partial', count: 4, priced_count: 1, bid_total_cents: 10000001, profit_low_cents: 3000000 });
  expect(result.jobs.items[1]).toMatchObject({ status: 'needs_review', cogs_high_cents: null, profit_low_cents: null, margin_low_pct: null });
  expect(result.jobs.items[0].cogs_high_cents).toBe(7000001);
});

test('an entirely unpriced job portfolio cannot look like zero costs or zero profit', async () => {
  const result = await setup({ state: { projects: [{ id: 'new-job' }] } }).report();
  expect(result.jobs).toMatchObject({ count: 1, priced_count: 0, bid_total_cents: null, profit_low_cents: null, profit_high_cents: null });
});

test('each source can fail independently without zeroing its balances or leaking infrastructure details', async () => {
  const noLedger = await setup({ query: async () => { throw new Error('private database host'); } }).report();
  expect(noLedger.sources.ledger.status).toBe('unavailable');
  expect(noLedger.ledger).toMatchObject({ status: 'unavailable', invoice_count: null, issued_balance_cents: null, recorded_payments_cents: null });
  expect(noLedger.jobs.count).toBe(1);
  const noJobs = await setup({ readState: async () => { throw new Error('private file path'); } }).report();
  expect(noJobs.jobs).toMatchObject({ status: 'unavailable', count: null, bid_total_cents: null });
  expect(noJobs.ledger.invoice_count).toBe(1);
  expect(JSON.stringify([noLedger, noJobs])).not.toMatch(/private database|private file/);
});

test('malformed source shapes cannot masquerade as an empty ledger or portfolio', async () => {
  const result = await setup({ state: {}, query: async () => ({ broken: true }) }).report();
  expect(result.jobs.count).toBeNull();
  expect(result.ledger.invoice_count).toBeNull();
});

test('report links remain internal and missing bank/AP/payroll inputs are explicit', async () => {
  const result = await setup().report();
  for (const row of [...result.decisions, ...result.data_gaps]) expect(['/invoices', '/command-center#office-tools', '/executive#cash-scenario']).toContain(row.href);
  expect(result.data_gaps.map(row => row.id)).toEqual(expect.arrayContaining(['bank_cash', 'payables', 'payroll_overhead']));
  expect(result.narration.split(/\s+/).length).toBeLessThan(130);
});

test('signed profit aggregation stays exact when intermediate totals exceed safe Number precision', async () => {
  const result = await setup({ state: { projects: [
    job('positive-a', { bid_total: '90071992547409.89', cogs_low: 0, cogs_high: 0 }),
    job('positive-b', { bid_total: '90071992547409.88', cogs_low: 0, cogs_high: 0 }),
    job('negative', { bid_total: '0.01', cogs_low: '90071992547409.90', cogs_high: '90071992547409.90' }),
  ] } }).report();
  expect(result.jobs.profit_low_cents).toBe(9007199254740988);
  expect(result.jobs.profit_high_cents).toBe(9007199254740988);
  expect(result.jobs.bid_total_cents).toBeNull();
  expect(result.jobs.status).toBe('partial');
});

test('the default state reader never creates starter data when its file is missing', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-cfo-read-'));
  const previous = process.env.COMMAND_CENTER_STORE_PATH;
  const absent = path.join(directory, 'missing', 'state.json');
  process.env.COMMAND_CENTER_STORE_PATH = absent;
  jest.resetModules();
  try {
    const service = require('../src/services/cfoBriefing').createCfoBriefingService({ query: async () => ({ rows: [] }), now: () => now });
    const result = await service();
    expect(result.jobs.status).toBe('unavailable');
    expect(result.ledger.invoice_count).toBe(0);
    expect(fs.existsSync(path.dirname(absent))).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
    else process.env.COMMAND_CENTER_STORE_PATH = previous;
    jest.resetModules();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a stalled SQL read is bounded and returns available estimates with unknown ledger balances', async () => {
  jest.useFakeTimers();
  try {
    const { report } = setup({ query: () => new Promise(() => {}) });
    const pending = report();
    await jest.advanceTimersByTimeAsync(5000);
    const result = await pending;
    expect(result.jobs.priced_count).toBe(1);
    expect(result.ledger.issued_balance_cents).toBeNull();
    expect(result.sources.ledger.status).toBe('unavailable');
  } finally { jest.useRealTimers(); }
});

test('duplicate invoice identities and oversized result sets are unavailable rather than double counted', async () => {
  expect((await setup({ rows: [invoice(), invoice()] }).report()).ledger.status).toBe('unavailable');
  expect((await setup({ rows: Array.from({ length: 5001 }, (_, index) => invoice(index + 1)) }).report()).ledger.invoice_count).toBeNull();
});
