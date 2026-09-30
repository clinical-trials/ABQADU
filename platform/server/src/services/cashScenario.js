const TIME_ZONE = 'America/Denver';
const MAX_MONEY_CENTS = 10000000000;
const FIELDS = ['opening_cash', 'weekly_inflow', 'weekly_outflow', 'collection_delay_weeks'];
const LABELS = { opening_cash: 'Opening cash', weekly_inflow: 'Weekly inflow', weekly_outflow: 'Weekly outflow' };

class CashScenarioValidationError extends Error {
  constructor(message) { super(message); this.name = 'CashScenarioValidationError'; this.status = 400; }
}
const invalid = message => { throw new CashScenarioValidationError(message); };

function dollarCents(value, field) {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) {
    invalid(`${LABELS[field]} must be an explicit dollar amount with at most two decimal places, between $0 and $100,000,000.`);
  }
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents > MAX_MONEY_CENTS) invalid(`${LABELS[field]} cannot exceed $100,000,000.`);
  return cents;
}

function localDate(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(value => value.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function plusDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function calculateCashScenario(body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Enter opening cash, weekly inflow, weekly outflow and a collection delay.');
  if (Object.keys(body).some(key => !FIELDS.includes(key))) invalid('Only opening cash, weekly inflow, weekly outflow and collection delay are supported.');
  const opening_cash_cents = dollarCents(body.opening_cash, 'opening_cash');
  const weekly_inflow_cents = dollarCents(body.weekly_inflow, 'weekly_inflow');
  const weekly_outflow_cents = dollarCents(body.weekly_outflow, 'weekly_outflow');
  const delay = body.collection_delay_weeks;
  if (!Number.isInteger(delay) || delay < 0 || delay > 4) invalid('Collection delay must be a whole number from 0 to 4 weeks.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('A valid scenario clock is required.');

  const as_of = localDate(now);
  let closing = opening_cash_cents;
  // With the input cap and exactly 13 weeks, every intermediate amount is an
  // integer below 140 billion cents, safely within JavaScript's exact range.
  const weeks = Array.from({ length: 13 }, (_, index) => {
    const inflow_cents = index < delay ? 0 : weekly_inflow_cents;
    closing += inflow_cents - weekly_outflow_cents;
    return { week: index + 1, start_date: plusDays(as_of, index * 7), end_date: plusDays(as_of, index * 7 + 6),
      inflow_cents, outflow_cents: weekly_outflow_cents, closing_cash_cents: closing };
  });
  return {
    generated_at: now.toISOString(), as_of, currency: 'USD',
    assumptions: { opening_cash_cents, weekly_inflow_cents, weekly_outflow_cents, collection_delay_weeks: delay },
    weeks, lowest_cash_cents: Math.min(...weeks.map(week => week.closing_cash_cents)),
    ending_cash_cents: weeks.at(-1).closing_cash_cents,
    first_negative_week: weeks.find(week => week.closing_cash_cents < 0)?.week ?? null,
    receipts_after_horizon_cents: weekly_inflow_cents * delay,
    basis: 'Projection from user inputs only. Weekly inflows shift by the selected collection delay; weekly outflows stay unchanged. Balances are end-of-week totals. Payments, costs and other cash movements not entered are excluded. This scenario is not saved and does not change financial records.',
  };
}

module.exports = { calculateCashScenario, CashScenarioValidationError };
