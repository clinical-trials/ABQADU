const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_BYTES = 128 * 1024;
const NOT_FOUND = 'Owner plan is not available.';
const UNAVAILABLE = 'The owner plan is temporarily unavailable. Please try again.';
const PLAN_FIELDS = ['version', 'updated_at', 'currency', 'vision', 'goals', 'weekly_review'];
const GOAL_FIELDS = ['id', 'kind', 'title', 'target_amount_cents', 'reported_balance_cents', 'reported_balance_as_of', 'basis', 'target_date', 'status', 'next_step', 'notes'];
const KINDS = ['annual_income', 'debt_payoff', 'property', 'home'];
const BASES = ['unconfirmed', 'revenue', 'net_profit', 'personal_income'];
const STATUSES = ['planned', 'in_progress', 'complete'];

class OwnerPlanError extends Error {
  constructor(status) {
    super(status === 404 ? NOT_FOUND : UNAVAILABLE);
    this.name = 'OwnerPlanError';
    this.status = status === 404 ? 404 : 503;
  }
}

function canReadOwnerPlan(auth, env = process.env) {
  if (!auth || typeof auth.userId !== 'string' || typeof auth.sessionId !== 'string' || !auth.sessionId) return false;
  if (env.ABQ_LOCAL_WORKSPACE === '1') {
    return env.NODE_ENV === 'development' && env.HOST === '127.0.0.1' && auth.userId === 'local-owner';
  }
  const list = value => typeof value === 'string' ? value.split(',').map(id => id.trim()).filter(Boolean) : [];
  const staff = new Set(list(env.CLERK_ALLOWED_USER_IDS));
  const owners = list(env.EXECUTIVE_OWNER_USER_IDS);
  return owners.length > 0 && owners.every(id => /^user_[A-Za-z0-9]+$/.test(id) && staff.has(id)) && owners.includes(auth.userId);
}

const invalid = () => { throw new OwnerPlanError(503); };
function exactFields(value, fields) {
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) invalid();
}
function text(value, max, { required = false, multiline = true } = {}) {
  if (typeof value !== 'string' || value.length > max
    || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) invalid();
  const clean = value.trim();
  if (required && !clean) invalid();
  return clean;
}
function amount(value) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) invalid();
  return value;
}
function date(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid();
  return value;
}

function normalizeOwnerPlan(value) {
  exactFields(value, PLAN_FIELDS);
  if (value.version !== 1 || value.currency !== 'USD'
    || typeof value.updated_at !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updated_at)
    || !Number.isFinite(Date.parse(value.updated_at)) || new Date(value.updated_at).toISOString() !== value.updated_at
    || !Array.isArray(value.goals) || value.goals.length > 20
    || !Array.isArray(value.weekly_review) || value.weekly_review.length > 20) invalid();
  const ids = new Set();
  const goals = value.goals.map(goal => {
    exactFields(goal, GOAL_FIELDS);
    if (typeof goal.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(goal.id) || ids.has(goal.id)
      || !KINDS.includes(goal.kind) || !BASES.includes(goal.basis) || !STATUSES.includes(goal.status)
      || (goal.kind !== 'annual_income' && goal.basis !== 'unconfirmed')
      || (goal.kind !== 'debt_payoff' && (goal.reported_balance_cents !== null || goal.reported_balance_as_of !== null))
      || (goal.reported_balance_cents === null && goal.reported_balance_as_of !== null)) invalid();
    ids.add(goal.id);
    return {
      id: goal.id, kind: goal.kind, title: text(goal.title, 160, { required: true, multiline: false }),
      target_amount_cents: amount(goal.target_amount_cents), reported_balance_cents: amount(goal.reported_balance_cents),
      reported_balance_as_of: date(goal.reported_balance_as_of), basis: goal.basis,
      target_date: date(goal.target_date), status: goal.status,
      next_step: text(goal.next_step, 1000), notes: text(goal.notes, 2000),
    };
  });
  return {
    version: 1, updated_at: value.updated_at, currency: 'USD', vision: text(value.vision, 2000), goals,
    weekly_review: value.weekly_review.map(item => text(item, 500, { required: true })),
  };
}

function formatOwnerPlan(plan) {
  // Only validated, owner-authorized snapshots reach this formatter in the API.
  const money = cents => cents === null ? 'Not specified' : `$${(BigInt(cents) / 100n).toLocaleString('en-US')}.${String(BigInt(cents) % 100n).padStart(2, '0')}`;
  const basis = { unconfirmed: 'Not selected — revenue, net profit, or personal income still to be confirmed', revenue: 'Business revenue', net_profit: 'Business net profit', personal_income: 'Personal income' };
  const status = { planned: 'Planned', in_progress: 'In progress', complete: 'Complete' };
  const lines = ['Owner plan', `Updated: ${plan.updated_at}`, 'Currency: USD', '', plan.vision, '',
    'Amounts and milestones are owner-reported planning inputs, not verified bank balances or financial results. Missing amounts and dates remain unspecified.'];
  for (const goal of plan.goals) {
    lines.push('', goal.title, `Recorded status: ${status[goal.status]}`);
    if (goal.kind === 'annual_income') lines.push(`Annual target: ${money(goal.target_amount_cents)}`, `Target basis: ${basis[goal.basis]}`);
    else if (goal.kind === 'debt_payoff') lines.push(`Target balance: ${money(goal.target_amount_cents)}`);
    else lines.push(`Target amount: ${money(goal.target_amount_cents)}`);
    if (goal.kind === 'debt_payoff') lines.push(`Reported balance: ${money(goal.reported_balance_cents)}`, `Balance report date: ${goal.reported_balance_as_of || 'Not recorded'} (not lender verification)`);
    lines.push(`Target date: ${goal.target_date || 'Not specified'}`);
    if (goal.next_step) lines.push(`Next step: ${goal.next_step}`);
    if (goal.notes) lines.push(`Notes: ${goal.notes}`);
  }
  if (plan.weekly_review.length) lines.push('', 'Weekly review', ...plan.weekly_review.map(item => `- ${item}`));
  return `${lines.join('\n')}\n`;
}

async function readBoundedFile(filePath) {
  const file = await fs.open(filePath, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) invalid();
    // Read at most one bounded buffer even if a file grows after stat().
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await file.read(buffer, used, buffer.length - used, used);
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > MAX_BYTES) invalid();
    return buffer.subarray(0, used).toString('utf8');
  } finally { await file.close(); }
}

function createOwnerPlanService({ env = process.env, readFile = readBoundedFile, readTimeoutMs = 3000 } = {}) {
  const filePath = env.EXECUTIVE_OWNER_PLAN_PATH || path.join(__dirname, '..', '..', 'data', 'owner-plan.json');
  async function getReport(auth) {
    // Personal data never enters the shared Command Center store or CFO report.
    // The app's session/origin gate runs first; this role gate runs before I/O.
    if (!canReadOwnerPlan(auth, env)) throw new OwnerPlanError(404);
    let timer;
    try {
      const raw = await Promise.race([
        Promise.resolve().then(() => readFile(filePath)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new OwnerPlanError(503)), readTimeoutMs); }),
      ]);
      if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_BYTES) invalid();
      const plan = normalizeOwnerPlan(JSON.parse(raw));
      return { ...plan, plan_text: formatOwnerPlan(plan) };
    } catch (error) {
      // Never retain parse errors or filesystem messages: they may contain data.
      throw new OwnerPlanError(error?.code === 'ENOENT' ? 404 : 503);
    } finally { clearTimeout(timer); }
  }
  return { getReport };
}

module.exports = { createOwnerPlanService, canReadOwnerPlan, normalizeOwnerPlan, formatOwnerPlan, OwnerPlanError };
