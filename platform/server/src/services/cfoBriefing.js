const fs = require('node:fs/promises');
const { storePath } = require('./commandCenterStore');

const TIME_ZONE = 'America/Denver';
const QUERY_TIMEOUT_MS = 5000;
const MAX_RECORDS = 5000;
const LEDGER_QUERY = `
WITH payment_classification AS (
  SELECT p.invoice_id, p.amount,
    (p.amount IS NULL OR p.amount <= 0 OR p.paid_date IS NULL OR p.paid_date > $1::date) AS invalid,
    (p.provider = 'stripe' AND a.livemode IS FALSE AND a.currency = 'usd'
      AND a.invoice_id = p.invoice_id AND a.state = 'paid'
      AND a.amount_cents = p.amount * 100 AND LEFT(p.provider_payment_id, 3) = 'pi_') IS TRUE AS known_test,
    CASE
      WHEN p.provider = 'stripe' THEN
        a.id IS NOT NULL AND a.livemode IS TRUE AND a.currency = 'usd'
        AND a.invoice_id = p.invoice_id AND a.state = 'paid'
        AND a.amount_cents = p.amount * 100 AND LEFT(p.provider_payment_id, 3) = 'pi_'
      WHEN p.provider IS NOT NULL OR p.stripe_checkout_session_id IS NOT NULL OR p.provider_payment_id IS NOT NULL THEN FALSE
      WHEN p.manual_request_key IS NOT NULL THEN TRUE
      ELSE COALESCE(LOWER(p.method), '') IN ('check', 'cash', 'ach')
    END IS TRUE AS resolved
  FROM payments p
  LEFT JOIN stripe_checkout_attempts a ON a.stripe_session_id = p.stripe_checkout_session_id
), payment_totals AS (
  SELECT p.invoice_id, SUM(p.amount) AS paid,
    SUM(CASE WHEN NOT p.invalid AND p.resolved THEN p.amount ELSE 0 END) AS recorded_paid,
    SUM(CASE WHEN NOT p.invalid AND p.known_test THEN p.amount ELSE 0 END) AS known_test_paid,
    COUNT(*) AS payment_count,
    COUNT(*) FILTER (WHERE p.invalid) AS invalid_payment_count,
    COUNT(*) FILTER (WHERE NOT p.resolved AND NOT p.known_test) AS unresolved_payment_count
  FROM payment_classification p GROUP BY p.invoice_id
)
SELECT i.id, i.invoice_number, i.status, i.amount::text AS amount,
  i.issued_date::text AS issued_date, i.due_date::text AS due_date, c.name AS client_name,
  COALESCE(p.paid, 0)::text AS paid,
  COALESCE(p.recorded_paid, 0)::text AS recorded_paid,
  COALESCE(p.known_test_paid, 0)::text AS known_test_paid,
  COALESCE(p.payment_count, 0)::text AS payment_count,
  COALESCE(p.invalid_payment_count, 0)::text AS invalid_payment_count,
  COALESCE(p.unresolved_payment_count, 0)::text AS unresolved_payment_count
FROM invoices i
LEFT JOIN clients c ON c.id = i.client_id
LEFT JOIN payment_totals p ON p.invoice_id = i.id
ORDER BY i.id LIMIT 5001`;

const text = (value, maximum = 160) => typeof value === 'string' ? value.trim().slice(0, maximum) : '';
function amountCents(value) {
  if (!['string', 'number'].includes(typeof value)) return null;
  const source = String(value);
  if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(source)) return null;
  const [whole, fraction = ''] = source.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}
const count = value => /^(0|[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const sum = values => {
  const value = values.reduce((total, item) => total + BigInt(item), 0n);
  const bound = BigInt(Number.MAX_SAFE_INTEGER);
  return value >= -bound && value <= bound ? Number(value) : null;
};
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
const denverDate = now => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const dollars = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);

function unavailableJobs() {
  return { status: 'unavailable', count: null, priced_count: null, bid_total_cents: null, profit_low_cents: null, profit_high_cents: null, items: [], message: 'Saved job estimates are unavailable. No zero-cost or profit assumption has been made.' };
}
function summarizeJobs(state) {
  if (!state || !Array.isArray(state.projects) || state.projects.length > MAX_RECORDS) throw new Error('Invalid job source.');
  const seen = new Set();
  const items = state.projects.map(project => {
    if (!project || typeof project.id !== 'string' || !project.id || seen.has(project.id)) throw new Error('Invalid job identity.');
    seen.add(project.id);
    const bid = amountCents(project.bid_total), low = amountCents(project.cogs_low), high = amountCents(project.cogs_high);
    const issues = [];
    if (bid === null || bid <= 0) issues.push('A positive customer price is missing or invalid.');
    if (low === null || high === null) issues.push('The estimated cost range is missing or invalid.');
    else if (high < low) issues.push('The high cost estimate is below the low estimate.');
    const valid = issues.length === 0;
    return {
      id: project.id, name: text(project.name || project.client) || 'Unnamed saved job', status: valid ? 'estimated' : 'needs_review',
      bid_total_cents: bid, cogs_low_cents: low, cogs_high_cents: high,
      profit_low_cents: valid ? bid - high : null, profit_high_cents: valid ? bid - low : null,
      margin_low_pct: valid ? Math.round((bid - high) / bid * 10000) / 100 : null,
      draft_count: Array.isArray(project.invoice_drafts) ? project.invoice_drafts.length : 0, issues,
    };
  });
  const priced = items.filter(item => item.status === 'estimated');
  const covered = priced.length > 0 || items.length === 0;
  const totals = {
    bid_total_cents: covered ? sum(priced.map(item => item.bid_total_cents)) : null,
    profit_low_cents: covered ? sum(priced.map(item => item.profit_low_cents)) : null,
    profit_high_cents: covered ? sum(priced.map(item => item.profit_high_cents)) : null,
  };
  return { status: priced.length === items.length && Object.values(totals).every(value => value !== null) ? 'available' : 'partial', count: items.length, priced_count: priced.length, ...totals, items,
    message: `Estimate totals cover ${priced.length} of ${items.length} saved jobs with valid price and cost ranges. Gross profit is an estimate before overhead and tax adjustments, not realized profit. Receipt drafts and supplier allowances are not added again as paid costs.` };
}

const agingDefinitions = [['current', 'Not yet overdue'], ['1_30', '1–30 days overdue'], ['31_60', '31–60 days overdue'], ['61_90', '61–90 days overdue'], ['over_90', 'Over 90 days overdue'], ['undated', 'Due date needs review']];
function unavailableLedger() {
  return { status: 'unavailable', invoice_count: null, issued_count: null, draft_count: null, issued_balance_cents: null, overdue_balance_cents: null, draft_total_cents: null, recorded_payments_cents: null, known_test_payments_cents: null, needs_review_count: null, due_date_missing_count: null, overdue_invoices: [], aging: [], message: 'The billing ledger is unavailable. Balances and recorded payments remain unknown.' };
}
function summarizeLedger(rows, today) {
  if (!Array.isArray(rows) || rows.length > MAX_RECORDS) throw new Error('Invalid ledger source.');
  const seen = new Set(), reviews = new Set();
  const aging = agingDefinitions.map(([id, label]) => ({ id, label, balance_cents: 0, count: 0 }));
  const overdue = [], issuedBalances = [], draftTotals = [], recordedPayments = [], testPayments = [];
  let issuedCount = 0, draftCount = 0, missingDates = 0, excluded = 0, invalidPaymentRows = 0, knownDueCount = 0, unknownStatus = false;
  for (const row of rows) {
    if (!row || !Number.isInteger(row.id) || row.id <= 0 || seen.has(row.id)) throw new Error('Invalid invoice identity.');
    seen.add(row.id);
    const issued = ['sent', 'overdue', 'paid'].includes(row.status), draft = row.status === 'draft';
    if (issued) issuedCount += 1;
    else if (draft) draftCount += 1;
    else { unknownStatus = true; reviews.add(row.id); }
    const amount = amountCents(row.amount), paid = amountCents(row.paid), recorded = amountCents(row.recorded_paid), test = amountCents(row.known_test_paid);
    const paymentCount = count(row.payment_count), invalidPayments = count(row.invalid_payment_count), unresolved = count(row.unresolved_payment_count);
    const validPayments = paid !== null && recorded !== null && test !== null && paymentCount !== null && invalidPayments === 0 && unresolved !== null
      && sum([recorded, test]) !== null && recorded + test <= paid && (paymentCount !== 0 || paid === 0);
    if (validPayments) { recordedPayments.push(recorded); testPayments.push(test); }
    else { invalidPaymentRows += 1; reviews.add(row.id); }
    const financeValid = (issued || draft) && amount !== null && validPayments && paid <= amount
      && unresolved === 0 && test === 0 && (row.status !== 'paid' || amount > 0 && paid >= amount)
      && !(issued && amount === 0);
    if (!financeValid) { reviews.add(row.id); excluded += 1; continue; }
    if (draft) {
      draftTotals.push(amount);
      if (paid > 0) reviews.add(row.id);
      continue;
    }
    const issuedDate = calendarDate(row.issued_date), dueDate = calendarDate(row.due_date);
    if (!issuedDate || !dueDate) reviews.add(row.id);
    if (issuedDate && issuedDate > today) { reviews.add(row.id); excluded += 1; continue; }
    const balance = amount - paid;
    issuedBalances.push(balance);
    if (balance <= 0) continue;
    if (!dueDate) missingDates += 1;
    else knownDueCount += 1;
    const days = dueDate ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${dueDate}T12:00:00Z`)) / 86400000) : null;
    const key = days === null ? 'undated' : days <= 0 ? 'current' : days <= 30 ? '1_30' : days <= 60 ? '31_60' : days <= 90 ? '61_90' : 'over_90';
    const bucket = aging.find(item => item.id === key);
    bucket.balance_cents = bucket.balance_cents === null ? null : sum([bucket.balance_cents, balance]);
    bucket.count += 1;
    if (days > 0) overdue.push({ id: row.id, number: text(row.invoice_number, 80) || `Invoice ${row.id}`, client: text(row.client_name) || 'Client not recorded', due_date: dueDate, balance_cents: balance, days_overdue: days });
  }
  const eligibleIssued = issuedBalances.length > 0 || issuedCount === 0 && !unknownStatus;
  const overdueKnown = eligibleIssued && !(missingDates > 0 && knownDueCount === 0);
  const paymentKnown = recordedPayments.length > 0 || rows.length === 0;
  const summary = {
    invoice_count: rows.length, issued_count: issuedCount, draft_count: draftCount,
    issued_balance_cents: eligibleIssued ? sum(issuedBalances) : null,
    overdue_balance_cents: overdueKnown ? sum(overdue.map(item => item.balance_cents)) : null,
    draft_total_cents: draftTotals.length || draftCount === 0 && !unknownStatus ? sum(draftTotals) : null,
    recorded_payments_cents: paymentKnown ? sum(recordedPayments) : null,
    known_test_payments_cents: paymentKnown ? sum(testPayments) : null,
  };
  const partial = reviews.size > 0 || Object.values(summary).some(value => value === null) || aging.some(row => row.balance_cents === null);
  if (!eligibleIssued) for (const bucket of aging) bucket.balance_cents = null;
  overdue.sort((a, b) => b.days_overdue - a.days_overdue || b.balance_cents - a.balance_cents || a.id - b.id);
  return { status: partial ? 'partial' : 'available', ...summary, needs_review_count: reviews.size, due_date_missing_count: missingDates, overdue_invoices: overdue.slice(0, 50), aging,
    message: `Balances cover eligible invoices marked sent, overdue or paid, using recorded payments. ${excluded} invoices are excluded from collection totals because their terms or payment provenance need review; known Stripe test and unresolved payments never support collection recommendations. Recorded payments are validated non-test ledger entries, including manual entries, not reconciled bank cash. ${invalidPaymentRows ? `${invalidPaymentRows} invalid payment histories are excluded. ` : ''}${missingDates ? `${missingDates} positive balances have no valid due date and cannot be aged. ` : ''}Drafts and InvoiceShelf labels do not establish revenue or payment. Dates describe the current saved ledger, not a historical accounting close.` };
}

const gaps = () => [
  { id: 'bank_cash', title: 'Bank cash is not connected', detail: 'No reconciled opening balance, bank transactions, Stripe settlements or restricted-cash records are available. Use reviewed inputs for a cash scenario.', href: '/executive#cash-scenario' },
  { id: 'payables', title: 'Supplier bills and committed payables are missing', detail: 'Quotes, receipt drafts and cost estimates do not establish supplier balances, payment terms or amounts already paid.', href: '/command-center#office-tools' },
  { id: 'payroll_overhead', title: 'Payroll and overhead need reviewed inputs', detail: 'There is no payroll, benefits, overhead or debt-payment ledger. Job gross-margin estimates cannot establish company net profit or cash runway.', href: '/executive#cash-scenario' },
  { id: 'tax_refunds', title: 'Taxes, refunds and settlement adjustments are incomplete', detail: 'The app has no tax-liability, credit-note, refund, chargeback or payment-fee ledger. Recorded payments are gross ledger entries.', href: '/invoices' },
  { id: 'receipt_review', title: 'Receipt and mileage records need accounting review', detail: 'Saved receipts may be OCR drafts or starter examples and have no reconciled or paid flag. Legacy records without a project ID cannot be assigned by display name.', href: '/command-center#office-tools' },
  { id: 'job_mapping', title: 'Job estimates and invoice totals have different scopes', detail: 'Imported invoices carry explicit Command Center source IDs. Schedule connections or matching client names do not prove financial ownership; estimates and invoice balances must not be added together as revenue.', href: '/invoices' },
];

function createCfoBriefingService({
  readState = async () => JSON.parse(await fs.readFile(storePath, 'utf8')),
  query = (sql, values) => require('../db').pool.query({ text: sql, values, query_timeout: QUERY_TIMEOUT_MS }),
  now = () => new Date(),
} = {}) {
  return async function getCfoBriefing() {
    const generated = now(), asOf = denverDate(generated);
    let timer;
    const ledgerRead = Promise.race([
      Promise.resolve().then(() => query(LEDGER_QUERY, [asOf])),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Ledger unavailable.')), QUERY_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
    const [saved, ledgerReadResult] = await Promise.allSettled([Promise.resolve().then(readState), ledgerRead]);
    let jobs = unavailableJobs(), ledger = unavailableLedger(), updatedAt = null;
    if (saved.status === 'fulfilled') {
      try { jobs = summarizeJobs(saved.value); updatedAt = typeof saved.value.updated_at === 'string' && Number.isFinite(Date.parse(saved.value.updated_at)) ? saved.value.updated_at : null; }
      catch { /* Invalid or oversized sources remain unknown. */ }
    }
    if (ledgerReadResult.status === 'fulfilled') {
      try { ledger = summarizeLedger(ledgerReadResult.value?.rows, asOf); }
      catch { /* Never turn a corrupt response into a zero-balance ledger. */ }
    }
    const decisions = [];
    const add = (id, priority, title, detail, href) => decisions.push({ id, priority, title, detail, href });
    if (ledger.status === 'unavailable') add('restore_ledger', 'high', 'Restore the billing ledger', 'Invoice balances are unknown until the saved billing records can be read.', '/invoices');
    else {
      if (ledger.needs_review_count) add('review_ledger', 'high', 'Review invoice and payment exceptions', `${ledger.needs_review_count} invoices need review before relying on their terms or payment history.`, '/invoices');
      if (ledger.overdue_invoices.length) add('review_overdue', 'high', 'Review overdue invoice balances', `${ledger.overdue_invoices.length}${ledger.overdue_invoices.length === 50 ? ' or more' : ''} eligible overdue invoices are listed. Confirm terms and payment records before following up.`, '/invoices');
      if (ledger.due_date_missing_count) add('confirm_due_dates', 'medium', 'Confirm missing invoice due dates', `${ledger.due_date_missing_count} positive balances cannot be aged.`, '/invoices');
    }
    if (jobs.status === 'unavailable') add('restore_jobs', 'medium', 'Restore saved job estimates', 'Job pricing and margin estimates are unknown until the saved workspace can be read.', '/command-center#office-tools');
    else {
      const missing = jobs.count - jobs.priced_count;
      if (missing) add('complete_estimates', 'high', 'Complete the saved price and cost ranges', `${missing} jobs cannot support a reliable gross-profit estimate.`, '/command-center#office-tools');
      const low = jobs.items.filter(job => job.profit_low_cents !== null && job.profit_low_cents <= 0);
      if (low.length) add('review_margin', 'high', 'Review jobs with no estimated profit cushion', `${low.length} jobs have a zero or negative gross-profit floor before overhead and tax adjustments.`, '/command-center#office-tools');
    }
    add('cash_inputs', 'medium', 'Build a cash scenario from reviewed inputs', 'Enter available cash and expected inflows and outflows; invoice balances alone cannot establish cash runway.', '/executive#cash-scenario');
    const ledgerSpeech = ledger.issued_balance_cents === null ? 'Collectible invoice balances need review or are unavailable.' : `Eligible recorded invoice balances total ${dollars(ledger.issued_balance_cents)}.`;
    const jobSpeech = jobs.priced_count === null ? 'Saved job estimates are unavailable.' : `${jobs.priced_count} saved jobs have usable price and cost estimates.`;
    return {
      generated_at: generated.toISOString(), as_of: asOf, currency: 'USD',
      sources: { jobs: { status: jobs.status, message: jobs.message, updated_at: updatedAt }, ledger: { status: ledger.status, message: ledger.message } },
      cash: { status: 'unknown', message: 'Bank cash and reconciled cash flow are not connected. Recorded payments and estimated margins do not establish the bank balance.' },
      ledger, jobs, decisions, data_gaps: gaps(),
      narration: `${jobSpeech} ${ledgerSpeech} Bank cash is unknown. ${decisions[0].title}. This report uses saved records and estimates; no money, messages or accounting records have been changed.`,
    };
  };
}

module.exports = { createCfoBriefingService };
