import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import CfoCashScenario from './CfoCashScenario';
import { clearAuthSession, setAuthSession } from '../utils/authFetch';

let host, root;
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const cents = text => { const [whole, fraction = ''] = text.split('.'); return Number(whole) * 100 + Number(fraction.padEnd(2, '0')); };
const date = offset => new Date(Date.UTC(2026, 8, 30 + offset)).toISOString().slice(0, 10);
function projection(input) {
  const assumptions = { opening_cash_cents: cents(input.opening_cash), weekly_inflow_cents: cents(input.weekly_inflow), weekly_outflow_cents: cents(input.weekly_outflow), collection_delay_weeks: input.collection_delay_weeks };
  let balance = assumptions.opening_cash_cents;
  const weeks = Array.from({ length: 13 }, (_, index) => {
    const inflow = index >= input.collection_delay_weeks ? assumptions.weekly_inflow_cents : 0;
    balance += inflow - assumptions.weekly_outflow_cents;
    return { week: index + 1, start_date: date(index * 7), end_date: date(index * 7 + 6), inflow_cents: inflow, outflow_cents: assumptions.weekly_outflow_cents, closing_cash_cents: balance };
  });
  return { generated_at: '2026-09-30T18:00:00.000Z', as_of: date(0), currency: 'USD', assumptions, weeks,
    lowest_cash_cents: Math.min(...weeks.map(week => week.closing_cash_cents)), ending_cash_cents: balance,
    first_negative_week: weeks.find(week => week.closing_cash_cents < 0)?.week ?? null,
    receipts_after_horizon_cents: assumptions.weekly_inflow_cents * input.collection_delay_weeks,
    basis: 'Projection from your inputs only. End-of-week balances; omitted costs are excluded. This scenario is not saved.' };
}
const render = async () => act(async () => root.render(<CfoCashScenario />));
const field = name => host.querySelector(`[name="${name}"]`);
const change = async (name, value) => act(async () => Simulate.change(field(name), { target: { value } }));
const fill = async (opening = '1000', inflow = '100', outflow = '800', delay = '0') => {
  await change('opening_cash', opening); await change('weekly_inflow', inflow); await change('weekly_outflow', outflow); await change('collection_delay_weeks', delay);
};
const calculate = async () => act(async () => Simulate.submit(host.querySelector('form')));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  global.fetch = jest.fn(async (_url, options) => reply(projection(JSON.parse(options.body))));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks(); });

test('money starts blank and no projection or request appears until all assumptions are supplied', async () => {
  await render();
  for (const name of ['opening_cash', 'weekly_inflow', 'weekly_outflow']) expect(field(name).value).toBe('');
  expect(host.querySelector('#cash-scenario')).not.toBeNull();
  expect(host.textContent).toMatch(/temporary scenario/i); expect(host.textContent).toMatch(/not saved/i); expect(host.textContent).toMatch(/not connected to a bank/i);
  expect(fetch).not.toHaveBeenCalled(); expect(host.querySelector('svg')).toBeNull();
  await calculate();
  expect(fetch).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(document.activeElement).toBe(field('opening_cash'));
});

test('readable dollar amounts become exact decimal strings and delayed receipts retain their cents', async () => {
  await render(); await fill('$1,234.56', '500.05', '300.01', '2'); await calculate();
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/executive/cfo/cash-scenario'); expect(options.method).toBe('POST');
  expect(options.headers.get('Authorization')).toBe('Bearer test-token');
  expect(JSON.parse(options.body)).toEqual({ opening_cash: '1234.56', weekly_inflow: '500.05', weekly_outflow: '300.01', collection_delay_weeks: 2 });
  expect(host.querySelectorAll('tbody tr')).toHaveLength(13);
  expect(host.querySelectorAll('tbody tr')[0].textContent).toContain('$934.55');
  expect(host.querySelectorAll('tbody tr')[1].textContent).toContain('$634.54');
  expect(host.querySelectorAll('tbody tr')[2].textContent).toContain('$500.05');
  expect(host.textContent).toContain('$1,000.10');
  expect(host.querySelector('svg[role="img"]')).not.toBeNull();
});

test.each(['-1', '1.005', '1e3', '1,2', '100000000.01'])('invalid money %s never reaches the server', async amount => {
  await render(); await fill(amount); await calculate();
  expect(fetch).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
});

test('explicit zero is accepted while a blank field is never assumed to be zero', async () => {
  await render(); await fill('0', '0', ''); await calculate(); expect(fetch).not.toHaveBeenCalled();
  await change('weekly_outflow', '0'); await calculate();
  expect(fetch).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('No negative week in this scenario.');
  expect(host.querySelector('svg').innerHTML).not.toMatch(/NaN|Infinity/);
});

test('greater weekly cash out shows the first negative week and editing removes the previous projection', async () => {
  await render(); await fill('1000', '1000', '500'); await calculate();
  expect(host.textContent).toContain('No negative week in this scenario.');
  await change('weekly_outflow', '1800');
  expect(host.querySelector('svg')).toBeNull(); expect(host.querySelector('table')).toBeNull();
  expect(host.textContent).not.toContain('No negative week in this scenario.');
  await calculate();
  expect(host.textContent).toContain('Cash turns negative in week 2.');
  expect(host.textContent).toContain('-$9,400.00');
});

test('server failure keeps all input and offers a retry without presenting a projection', async () => {
  fetch.mockResolvedValueOnce(reply({ error: 'Calculation temporarily unavailable' }, 503));
  await render(); await fill('1500.50', '650', '400', '1'); await calculate();
  expect(field('opening_cash').value).toBe('1500.50'); expect(field('collection_delay_weeks').value).toBe('1');
  expect(host.textContent).toContain('Calculation temporarily unavailable'); expect(host.querySelector('svg')).toBeNull();
  await calculate(); expect(host.querySelector('svg')).not.toBeNull();
});

test.each([
  ['different assumptions', payload => { payload.assumptions.weekly_inflow_cents += 1; }],
  ['invalid weekly balance', payload => { payload.weeks[3].closing_cash_cents += 1; }],
  ['missing week', payload => { payload.weeks.pop(); }],
  ['incorrect date', payload => { payload.weeks[2].start_date = '2026-11-01'; }],
  ['incorrect summary', payload => { payload.lowest_cash_cents += 1; }],
  ['incorrect negative week', payload => { payload.first_negative_week = null; }],
  ['wrong currency', payload => { payload.currency = 'CAD'; }],
  ['invalid Denver date', payload => { payload.as_of = '2026-09-29'; }],
])('a receipt with %s is not shown as a verified projection', async (_name, corrupt) => {
  fetch.mockImplementation(async (_url, options) => { const payload = projection(JSON.parse(options.body)); corrupt(payload); return reply(payload); });
  await render(); await fill(); await calculate();
  expect(host.textContent).toMatch(/could not be verified/i); expect(host.querySelector('svg')).toBeNull(); expect(host.querySelector('table')).toBeNull();
  expect(field('opening_cash').value).toBe('1000');
});

test('an HTML response cannot appear as a completed calculation', async () => {
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('HTML'); } });
  await render(); await fill(); await calculate();
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.querySelector('svg')).toBeNull();
});

test('editing pending assumptions aborts that request and its late response cannot replace a newer projection', async () => {
  const old = deferred(); let oldInput;
  fetch.mockImplementationOnce((_url, options) => { oldInput = JSON.parse(options.body); return old.promise; });
  await render(); await fill(); await calculate();
  const signal = fetch.mock.calls[0][1].signal;
  await change('weekly_outflow', '10'); expect(signal.aborted).toBe(true);
  await calculate(); expect(host.textContent).toContain('No negative week in this scenario.');
  await act(async () => old.resolve(reply(projection(oldInput))));
  expect(host.textContent).toContain('No negative week in this scenario.'); expect(host.textContent).not.toContain('Cash turns negative');
});

test('unmount aborts calculation and ignores the response', async () => {
  const pending = deferred(); fetch.mockReturnValueOnce(pending.promise);
  await render(); await fill(); await calculate();
  const [, options] = fetch.mock.calls[0];
  await act(async () => root.unmount()); root = { unmount() {} };
  expect(options.signal.aborted).toBe(true);
  await act(async () => pending.resolve(reply(projection(JSON.parse(options.body)))));
  expect(host.textContent).toBe('');
});

test('session revocation removes private inputs and an old response cannot enter the next session', async () => {
  const pending = deferred(); fetch.mockReturnValueOnce(pending.promise);
  await render(); await fill('98765.43'); await calculate();
  const [, options] = fetch.mock.calls[0];
  await act(async () => clearAuthSession());
  expect(host.querySelector('input')).toBeNull(); expect(host.textContent).not.toContain('98765.43'); expect(options.signal.aborted).toBe(true);
  await act(async () => setAuthSession({ userId: 'other-user', sessionId: 'other-session', getToken: async () => 'other-token' }));
  expect(field('opening_cash').value).toBe('');
  await act(async () => pending.resolve(reply(projection(JSON.parse(options.body)))));
  expect(host.querySelector('svg')).toBeNull(); expect(field('opening_cash').value).toBe('');
});
