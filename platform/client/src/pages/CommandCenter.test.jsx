import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import CommandCenter from './CommandCenter';

const project = (id, client) => ({ id, client, address: 'Albuquerque, NM 87106', model: 'Altura', sqft: 600, bid_total: 185000, cogs_low: 90000, cogs_high: 102000, confidence: 'A', status: 'Draft', next_action: 'Review site' });
let container, root, state;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  state = { projects: [project('one', 'First homeowner'), project('two', 'Second homeowner')], builder: {phone: '505-555-0100'}, supplier_quotes: [{id: 'quote-one', supplier: 'Test supplier', package: 'Materials', status: 'Quoted', quoted_total: 2000}], model_catalog: [], receipts: [], mileage: [], activity: [] };
  global.fetch = jest.fn(async (url, options = {}) => {
    if (url === '/api/integrations/status') return {ok: true, json: async () => ({})};
    if (url.endsWith('client-view-preview')) return {ok: true, json: async () => ({brand: {company: 'ABQ ADU'}, project: state.projects.find(p => url.includes(p.id + '/')), invoice_drafts: [], status: 'Draft', notes: 'Site review required.'})};
    if (options.method === 'PUT') state = {...state, ...JSON.parse(options.body)};
    return {ok: true, json: async () => state};
  });
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const button = text => [...container.querySelectorAll('button')].find(el => el.textContent === text);
const mount = async () => { await act(async () => root.render(<CommandCenter />)); };

test('client preview opens the selected homeowner packet without inventing a client open', async () => {
  await mount();
  const selector = container.querySelector('[aria-label="Active project"]');
  expect(selector).not.toBeNull();
  await act(async () => Simulate.change(selector, {target: {value: 'two'}}));
  await act(async () => button('Preview Client View').click());
  expect(document.querySelector('[role="dialog"]').textContent).toContain('Second homeowner');
  expect(document.querySelector('[role="dialog"]').textContent).not.toContain('First homeowner');
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/activity'))).toBe(false);
});

test('supplier imports target the explicitly selected project', async () => {
  await mount();
  const selector = container.querySelector('[aria-label="Active project"]');
  expect(selector).not.toBeNull();
  await act(async () => Simulate.change(selector, {target: {value: 'two'}}));
  await act(async () => button('Send to COGS').click());
  expect(fetch.mock.calls.some(([url]) => url === '/api/command-center/projects/two/send-supplier-to-cogs')).toBe(true);
  expect(fetch.mock.calls.some(([url]) => url === '/api/command-center/projects/one/send-supplier-to-cogs')).toBe(false);
});

test('empty project state gives guidance and disables contextual actions', async () => {
  state.projects = [];
  await mount();
  expect(button('Preview Client View').disabled).toBe(true);
  expect(button('Send to COGS').disabled).toBe(true);
  expect(container.textContent).toContain('Add a project');
});

test('receipt ledger shows the selected project and clearly identifies unlinked legacy entries', async () => {
  state.receipts = [
    {id: 'r1', project_id: 'one', project: 'First homeowner', vendor: 'First vendor', amount: 10},
    {id: 'r2', project_id: 'two', project: 'Second homeowner', vendor: 'Second vendor', amount: 20},
    {id: 'r3', project: 'Older job', vendor: 'Legacy vendor', amount: 30},
  ];
  await mount();
  await act(async () => Simulate.change(container.querySelector('[aria-label="Active project"]'), {target: {value: 'two'}}));
  const values = [...container.querySelectorAll('input')].map(el => el.value);
  expect(values).toContain('Second vendor');
  expect(values).not.toContain('First vendor');
  expect(container.textContent).toContain('Legacy receipt · project not linked: Older job');
});

test('changing a readiness check persists it before generating the client packet', async () => {
  await mount();
  const label = [...container.querySelectorAll('label')].find(el => el.textContent.startsWith('Utility review'));
  await act(async () => Simulate.change(label.querySelector('select'), {target: {value: 'Confirmed'}}));
  await act(async () => button('Preview Client View').click());
  const putIndex = fetch.mock.calls.findIndex(([, options]) => options?.method === 'PUT');
  const previewIndex = fetch.mock.calls.findIndex(([url]) => url.endsWith('client-view-preview'));
  expect(putIndex).toBeGreaterThan(-1);
  expect(previewIndex).toBeGreaterThan(putIndex);
  expect(state.projects[0].utility_review_status).toBe('Confirmed');
});
