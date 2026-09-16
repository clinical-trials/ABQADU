import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import Portfolio from './Portfolio';
import Clients from './Clients';
import Scheduler from './Scheduler';
import FieldOperations from './FieldOperations';
import RiskRegister from './RiskRegister';
import BidBuilder from './BidBuilder';
import Invoices from './Invoices';

const response = (payload, status = 200, type = 'application/json') => ({
  ok: status >= 200 && status < 300, status,
  json: async () => payload,
  headers: { get: () => type },
  blob: async () => new Blob([JSON.stringify(payload)], { type }),
});
const unavailable = () => response({ error: 'Database unavailable. Please try again.' }, 503);
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.fetch = jest.fn(async () => response([]));
  window.alert = jest.fn();
  URL.createObjectURL = jest.fn(() => 'blob:test');
  URL.revokeObjectURL = jest.fn();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const button = text => [...container.querySelectorAll('button')].find(el => el.textContent.trim() === text);
const mount = async Component => { await act(async () => root.render(<Component projectId="one" />)); };
const click = async text => { await act(async () => button(text).click()); };
const change = async (element, value) => { await act(async () => Simulate.change(element, { target: { value } })); };

test.each([Portfolio, Clients, Scheduler, FieldOperations, RiskRegister, BidBuilder, Invoices])(
  '%p displays API load failures and retries successfully', async Component => {
    fetch.mockImplementation(async () => unavailable());
    await mount(Component);
    expect(container.querySelector('[role="alert"]').textContent).toContain('Database unavailable');
    expect(container.textContent).not.toMatch(/Loading (?:portfolio|schedule)…/);
    fetch.mockImplementation(async () => response([]));
    await act(async () => {
      [...container.querySelectorAll('button')].filter(el => el.textContent.trim() === 'Retry').forEach(el => el.click());
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  }
);

test.each([
  [Clients, '+ Add Client', 'Name', 'Save', '/api/clients'],
  [FieldOperations, '+ Task', 'Task title…', 'Add', '/api/field-tasks'],
  [RiskRegister, '+ Add Risk', 'Risk title', 'Save', '/api/risks'],
])('%p retains an entered form after a rejected save', async (Component, add, placeholder, save, endpoint) => {
  await mount(Component);
  await click(add);
  await change(container.querySelector(`[placeholder="${placeholder}"]`), 'Keep this draft');
  fetch.mockImplementation(async () => unavailable());
  await click(save);
  expect(container.querySelector(`[placeholder="${placeholder}"]`).value).toBe('Keep this draft');
  expect(container.querySelector('[role="alert"]').textContent).toContain('Database unavailable');
  expect(button(save).disabled).toBe(false);
  fetch.mockImplementation(async (url, options) => response(options?.method ? { id: 'saved' } : []));
  await click(save);
  expect(container.querySelector(`[placeholder="${placeholder}"]`)).toBeNull();
  expect(fetch.mock.calls.some(([url, options]) => url === endpoint && JSON.parse(options?.body || '{}').title === 'Keep this draft')).toBe(Component !== Clients);
});

const invoice = { id: 'inv', invoice_number: 'INV-1', description: 'Deposit', amount: 100, paid: 0, balance: 100, status: 'draft' };
test('a failed payment keeps amount and method in the open payment form', async () => {
  fetch.mockImplementation(async () => response([invoice]));
  await mount(Invoices);
  await click('Record Payment');
  await change(container.querySelector('input[type="number"]'), '45');
  await change([...container.querySelectorAll('select')].at(-1), 'cash');
  fetch.mockImplementation(async () => unavailable());
  await click('Save Payment');
  expect(container.querySelector('input[type="number"]').value).toBe('45');
  expect([...container.querySelectorAll('select')].at(-1).value).toBe('cash');
  expect(container.querySelector('input[type="number"]').parentElement.querySelector('[role="alert"]').textContent).toContain('Database unavailable');
});

test('failed invoice PDF and external sync requests display errors without downloading', async () => {
  fetch.mockImplementation(async () => response([invoice]));
  await mount(Invoices);
  fetch.mockImplementation(async () => unavailable());
  await click('PDF');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]').textContent).toContain('Database unavailable');
  await click('Sync InvoiceShelf Status');
  expect(window.alert).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]').textContent).toContain('Database unavailable');
});

const bid = { id: 'bid', title: 'Existing bid', bid_number: 'BID-1', status: 'draft', markup_pct: 10, tax_pct: 0, contingency_pct: 0, items: [] };
test.each(['Save Bid', 'Download PDF', 'Create InvoiceShelf Estimate', 'Accept & Create Draw Schedule →'])(
  'a failed bid save stops %s and preserves the editor', async action => {
    fetch.mockImplementation(async url => response(url === '/api/bids' ? [bid] : url === '/api/bids/bid' ? bid : []));
    await mount(BidBuilder);
    await act(async () => [...container.querySelectorAll('div')].find(el => el.textContent === 'Existing bid').click());
    await change(container.querySelector('input'), 'Unsaved bid title');
    fetch.mockClear(); fetch.mockImplementation(async () => unavailable());
    await click(action);
    expect(container.querySelector('input').value).toBe('Unsaved bid title');
    expect(button('Save Bid').disabled).toBe(false);
    expect(container.querySelector('[role="alert"]').textContent).toContain('Database unavailable');
    expect(fetch.mock.calls).toHaveLength(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  }
);

test('schedule edits stay in the activity panel after a rejected save', async () => {
  const activity = { id: 'act', name: 'Frame walls', duration_days: 3, planned_start: '2026-09-16', planned_finish: '2026-09-19', pct_complete: 0 };
  fetch.mockImplementation(async url => response(url.includes('/activities/') ? [activity] : []));
  await mount(Scheduler);
  await act(async () => [...container.querySelectorAll('span')].find(el => el.textContent === 'Frame walls').click());
  await change(container.querySelector('input[type="text"]'), 'Keep schedule edit');
  fetch.mockImplementation(async () => unavailable());
  await click('Save Changes');
  expect(container.querySelector('input[type="text"]').value).toBe('Keep schedule edit');
  expect(container.textContent).toContain('Database unavailable');
});

test('a pending activity save locks editing, selection and dragging until it completes', async () => {
  const first = { id: 'act', name: 'Frame walls', duration_days: 3, planned_start: '2026-09-16', planned_finish: '2026-09-19', pct_complete: 0 };
  const second = { ...first, id: 'roof', name: 'Roofing' };
  let finishSave;
  fetch.mockImplementation((url, options) => options?.method === 'PUT'
    ? new Promise(resolve => { finishSave = resolve; })
    : Promise.resolve(response(url.includes('/activities/') ? [first, second] : [])));
  await mount(Scheduler);
  await act(async () => [...container.querySelectorAll('span')].find(el => el.textContent === 'Frame walls').click());
  await change(container.querySelector('input[type="text"]'), 'Submitted edit');
  await click('Save Changes');
  const name = container.querySelector('input[type="text"]');
  expect(name.matches(':disabled')).toBe(true);
  expect(button('Cancel').matches(':disabled')).toBe(true);
  await act(async () => [...container.querySelectorAll('span')].find(el => el.textContent === 'Roofing').click());
  expect(container.querySelector('input[type="text"]').value).toBe('Submitted edit');
  await act(async () => {
    Simulate.mouseDown(container.querySelector('svg g'), { clientX: 0 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 60 }));
  });
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
  await act(async () => finishSave(response({ ...first, name: 'Submitted edit' })));
  expect(container.querySelector('input[type="text"]')).toBeNull();
});

test.each(['failed', 'successful'])('a %s schedule retry preserves the open activity draft', async outcome => {
  const activity = { id: 'act', name: 'Frame walls', duration_days: 3, planned_start: '2026-09-16', planned_finish: '2026-09-19', pct_complete: 0 };
  fetch.mockImplementation(async url => url.includes('/activities/') ? response([activity]) : unavailable());
  await mount(Scheduler);
  await act(async () => [...container.querySelectorAll('span')].find(el => el.textContent === 'Frame walls').click());
  await change(container.querySelector('input[type="text"]'), 'Draft survives refresh');
  const pending = [];
  fetch.mockImplementation(url => new Promise(resolve => pending.push({ url, resolve })));
  await click('Retry');
  expect(container.querySelector('input[type="text"]').value).toBe('Draft survives refresh');
  await act(async () => {
    pending.forEach(({ url, resolve }) => resolve(outcome === 'failed'
      ? unavailable() : response(url.includes('/activities/') ? [{ ...activity }] : [])));
  });
  expect(container.querySelector('input[type="text"]').value).toBe('Draft survives refresh');
  expect(button('Save Changes').disabled).toBe(false);
});

test('field tasks ignore a previous date response arriving after the selected date', async () => {
  let finishOld;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  await mount(FieldOperations);
  fetch.mockImplementation(async () => response([{ id: 'new', title: 'Selected date task', status: 'pending' }]));
  await change(container.querySelector('input[type="date"]'), '2026-09-20');
  await act(async () => finishOld(response([{ id: 'old', title: 'Wrong date task', status: 'pending' }])));
  expect(container.textContent).toContain('Selected date task');
  expect(container.textContent).not.toContain('Wrong date task');
});
