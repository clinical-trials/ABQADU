import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import OwnerGoals from './OwnerGoals';
import { clearAuthSession, getAuthSession, setAuthSession } from '../utils/authFetch';

const API = '/api/executive/owner-plan';
function fixture() {
  const goal = (kind, title) => ({ id: `example-${kind.replace(/_/g, '-')}`, kind, title, target_amount_cents: null, reported_balance_cents: null, reported_balance_as_of: null, basis: 'unconfirmed', target_date: null, status: 'planned', next_step: 'Review the next decision.', notes: 'Fictional planning example.' });
  return { version: 1, updated_at: '2026-09-27T18:22:00.000Z', currency: 'USD', vision: 'Make room for long-term choices.',
    goals: [ { ...goal('annual_income', 'Annual financial goal'), target_amount_cents: 12345678 }, { ...goal('debt_payoff', 'Retire an example balance'), target_amount_cents: 0, reported_balance_cents: 432109, reported_balance_as_of: '2026-09-25', status: 'in_progress' }, goal('property', 'A future parcel'), goal('home', 'A future home') ],
    weekly_review: ['Review business cash needs before owner withdrawals.', 'Confirm the next planning step.'], plan_text: 'FICTIONAL BUSINESS PLAN\n\nThese are planning intentions, not verified financial results.' };
}
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let host, root, originalCreate, originalRevoke, originalScroll, originalUrl;
const render = async () => act(async () => root.render(<OwnerGoals />));
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent.includes(text));
const click = async text => act(async () => Simulate.click(button(text)));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  global.fetch = jest.fn(async () => reply(fixture()));
  originalCreate = URL.createObjectURL; originalRevoke = URL.revokeObjectURL;
  originalScroll = Element.prototype.scrollIntoView; originalUrl = window.location.href; Element.prototype.scrollIntoView = jest.fn();
  URL.createObjectURL = jest.fn(() => 'blob:owner-plan-example'); URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; Element.prototype.scrollIntoView = originalScroll; window.history.replaceState({}, '', originalUrl); jest.restoreAllMocks(); });

test('shows four owner goals without inventing revenue, balances, budgets or progress', async () => {
  await render();
  expect(host.querySelector('#owner-plan')).not.toBeNull(); expect(host.textContent).toContain('What we’re building toward.');
  expect(host.querySelectorAll('article')).toHaveLength(4); expect(host.textContent).toContain('$123,456.78');
  expect(host.textContent).toContain('Basis to confirm'); expect(host.textContent).toContain('revenue, net profit or personal income');
  const debt = host.querySelector('[data-goal-kind="debt_payoff"]');
  expect(debt.textContent).toContain('Payoff goal'); expect(debt.textContent).toContain('$0'); expect(debt.textContent).toContain('$4,321.09'); expect(debt.textContent).toContain('not bank verified');
  for (const kind of ['property', 'home']) { const card = host.querySelector(`[data-goal-kind="${kind}"]`); expect(card.textContent).toContain('Budget to plan'); expect(card.textContent).toContain('Date to plan'); expect(card.textContent).not.toMatch(/\$0|0%/); }
  expect(host.querySelector('progress, [role="progressbar"], input, textarea')).toBeNull();
  expect(host.textContent).toContain('Read-only review prompts'); expect(host.querySelector('details').textContent).toContain('FICTIONAL BUSINESS PLAN');
  expect(fetch).toHaveBeenCalledTimes(1); const [url, options] = fetch.mock.calls[0]; expect(url).toBe(API); expect(options.method).toBe('GET'); expect(options.headers.get('Authorization')).toBe('Bearer test-token');
});

test.each([['revenue', 'Annual revenue target'], ['net_profit', 'Annual net profit target'], ['personal_income', 'Annual personal income target']])('uses only the explicitly selected %s annual basis', async (basis, label) => {
  const plan = fixture(); plan.goals[0].basis = basis; fetch.mockResolvedValue(reply(plan)); await render();
  expect(host.querySelector('[data-goal-kind="annual_income"]').textContent).toContain(label); expect(host.textContent).not.toContain('Basis to confirm');
});

test('unknown reported debt is distinct from the zero-debt goal and incomplete dates remain unknown', async () => {
  const plan = fixture(); plan.goals[1].reported_balance_cents = null; plan.goals[1].reported_balance_as_of = null; plan.goals[0].target_amount_cents = null;
  fetch.mockResolvedValue(reply(plan)); await render();
  expect(host.querySelector('[data-goal-kind="debt_payoff"]').textContent).toContain('Balance to confirm'); expect(host.textContent).toContain('Target to plan'); expect(host.textContent).not.toContain('0%');
});

test('concealed 404 hides the panel without clearing an approved staff session', async () => {
  fetch.mockResolvedValue(reply({ error: 'Not found' }, 404)); await render();
  expect(host.textContent).toBe(''); expect(getAuthSession().userId).toBe('test-staff'); expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test('a sanitized unavailable state offers retry without echoing private backend error details', async () => {
  fetch.mockResolvedValueOnce(reply({ error: 'Private source contents should not appear here' }, 503)); await render();
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.textContent).not.toContain('Private source contents'); expect(host.querySelector('article')).toBeNull();
  await click('Try again'); expect(host.querySelectorAll('article')).toHaveLength(4);
});

test.each([
  ['wrong version', plan => { plan.version = 2; }],
  ['wrong currency', plan => { plan.currency = 'EUR'; }],
  ['invalid updated time', plan => { plan.updated_at = 'yesterday'; }],
  ['invalid goal list', plan => { plan.goals = null; }],
  ['duplicate goal id', plan => { plan.goals[1].id = plan.goals[0].id; }],
  ['unknown kind', plan => { plan.goals[2].kind = 'other'; }],
  ['negative target', plan => { plan.goals[0].target_amount_cents = -1; }],
  ['unsafe money', plan => { plan.goals[1].reported_balance_cents = Number.MAX_SAFE_INTEGER + 1; }],
  ['wrong basis', plan => { plan.goals[0].basis = 'salary_guess'; }],
  ['nonannual basis', plan => { plan.goals[2].basis = 'revenue'; }],
  ['balance on nondebt goal', plan => { plan.goals[2].reported_balance_cents = 1; }],
  ['invalid calendar date', plan => { plan.goals[1].reported_balance_as_of = '2026-02-30'; }],
  ['balance date without balance', plan => { plan.goals[1].reported_balance_cents = null; }],
  ['zero-year target date', plan => { plan.goals[2].target_date = '0000-01-01'; }],
  ['invalid status', plan => { plan.goals[0].status = 'paid'; }],
  ['invalid next step', plan => { plan.goals[0].next_step = {}; }],
  ['invalid weekly prompts', plan => { plan.weekly_review = [null]; }],
  ['invalid plan text', plan => { plan.plan_text = {}; }],
])('rejects %s before showing any personal content or allowing a download', async (_description, corrupt) => {
  const plan = fixture(); corrupt(plan); fetch.mockResolvedValue(reply(plan)); await render();
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.querySelector('article')).toBeNull(); expect(host.textContent).not.toContain(plan.vision); expect(button('Download')).toBeUndefined(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test('renders all plan text literally without executing markup or creating external links', async () => {
  const plan = fixture(), literal = '<img src=x onerror="window.attacked=true">'; plan.vision = literal; plan.goals[0].notes = literal; plan.plan_text = `${literal}\nhttps://example.invalid/private`;
  fetch.mockResolvedValue(reply(plan)); await render(); expect(host.textContent).toContain(literal); expect(host.querySelector('img, script, a[href^="https:"]')).toBeNull(); expect(window.attacked).toBeUndefined();
});

test('supports fewer goals or additional goals of the same kind without inventing missing cards', async () => {
  const plan = fixture(); plan.goals = [plan.goals[2], { ...plan.goals[2], id: 'another-example-property', title: 'Another future option' }]; fetch.mockResolvedValue(reply(plan)); await render();
  expect(host.querySelectorAll('article')).toHaveLength(2); expect(host.textContent).toContain('Another future option'); expect(host.textContent).not.toContain('Annual financial target');
});

test('an empty plan has explicit unplanned states without creating fictional goals', async () => {
  const plan = fixture(); plan.goals = []; plan.weekly_review = []; fetch.mockResolvedValue(reply(plan)); await render();
  expect(host.querySelectorAll('article')).toHaveLength(0); expect(host.textContent).toContain('No goals have been added'); expect(host.textContent).toContain('Review prompts are still to plan');
});

test('download is explicit, uses only returned text and a generic filename, and revokes its Blob on refresh', async () => {
  await render(); expect(URL.createObjectURL).not.toHaveBeenCalled(); await click('Download business plan');
  const blob = URL.createObjectURL.mock.calls[0][0]; expect(blob.type).toBe('text/plain;charset=utf-8');
  const text = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); }); expect(text).toBe(fixture().plan_text);
  const anchor = HTMLAnchorElement.prototype.click.mock.instances[0]; expect(anchor.download).toBe('future-business-plan.txt'); expect(anchor.href).toBe('blob:owner-plan-example');
  expect(fetch).toHaveBeenCalledTimes(1); await click('Refresh owner plan'); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:owner-plan-example');
});

test('download creation failure keeps the readable plan and makes no extra requests', async () => {
  await render(); URL.createObjectURL.mockImplementationOnce(() => { throw new Error('Unavailable'); }); await click('Download business plan');
  expect(host.textContent).toContain('Could not prepare the download'); expect(host.textContent).toContain('FICTIONAL BUSINESS PLAN'); expect(fetch).toHaveBeenCalledTimes(1);
});

test('refresh clears previous private content and downloads even if access is then concealed', async () => {
  await render(); await click('Download business plan'); const pending = deferred(); fetch.mockReturnValueOnce(pending.promise); await click('Refresh owner plan');
  expect(host.textContent).not.toContain('$123,456.78'); expect(host.textContent).not.toContain('FICTIONAL BUSINESS PLAN'); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:owner-plan-example');
  await act(async () => pending.resolve(reply({ error: 'Not found' }, 404))); expect(host.textContent).toBe(''); expect(getAuthSession().userId).toBe('test-staff');
});

test('auth changes abort old reads, clear content and ignore old-session responses', async () => {
  const pending = deferred(); fetch.mockReturnValueOnce(pending.promise); await render(); const options = fetch.mock.calls[0][1];
  await act(async () => clearAuthSession()); expect(options.signal.aborted).toBe(true); expect(host.textContent).toBe('');
  fetch.mockResolvedValueOnce(reply({ error: 'Not found' }, 404)); await act(async () => setAuthSession({ userId: 'other-staff', sessionId: 'other-session', getToken: async () => 'new-token' }));
  await act(async () => pending.resolve(reply(fixture()))); expect(host.textContent).toBe(''); expect(getAuthSession().userId).toBe('other-staff');
});

test('auth revocation clears a loaded plan and revokes downloads without another request', async () => {
  await render(); await click('Download business plan'); await act(async () => clearAuthSession());
  expect(host.textContent).toBe(''); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:owner-plan-example'); expect(fetch).toHaveBeenCalledTimes(1);
});

test('workspace 403 follows the existing session boundary and cannot retain the owner plan', async () => {
  await render(); fetch.mockResolvedValueOnce(reply({ error: 'Forbidden' }, 403)); await click('Refresh owner plan');
  expect(getAuthSession().userId).toBeNull(); expect(host.textContent).toBe('');
});

test('unmount aborts pending reads and ignores the response', async () => {
  const pending = deferred(); fetch.mockReturnValueOnce(pending.promise); await render(); const options = fetch.mock.calls[0][1];
  await act(async () => root.unmount()); root = { unmount() {} }; expect(options.signal.aborted).toBe(true);
  await act(async () => pending.resolve(reply(fixture()))); expect(host.textContent).toBe('');
});

test('unmount revokes a previously prepared private download', async () => {
  await render(); await click('Download business plan'); await act(async () => root.unmount()); root = { unmount() {} };
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:owner-plan-example'); expect(host.textContent).toBe('');
});

test('an owner-plan deep link scrolls once after its private data resolves, not on every refresh', async () => {
  window.history.replaceState({}, '', '#owner-plan'); const pending = deferred(); fetch.mockReturnValueOnce(pending.promise); await render();
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled(); await act(async () => pending.resolve(reply(fixture())));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1); expect(Element.prototype.scrollIntoView.mock.instances[0].id).toBe('owner-plan');
  await click('Refresh owner plan'); expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
});

test('resolving a plan does not move the page after the user changes the requested section', async () => {
  window.history.replaceState({}, '', '#owner-plan'); const pending = deferred(); fetch.mockReturnValueOnce(pending.promise); await render();
  window.history.replaceState({}, '', '#cash-scenario'); await act(async () => pending.resolve(reply(fixture())));
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});
