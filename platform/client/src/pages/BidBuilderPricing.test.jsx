import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BidBuilder from './BidBuilder';

const response = data => ({ ok: true, status: 200, json: async () => data });
const fixture = markup => ({ id: 'pricing-bid', title: 'Pricing example', bid_number: 'EXAMPLE-1', status: 'draft', markup_pct: markup, contingency_pct: 0, tax_pct: 0, items: [{ description: 'Example direct job costs', qty: 1, unit_cost: 100000 }] });
let container, root, saved;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saved = fixture(18);
  global.fetch = jest.fn(async (url, options = {}) => {
    if (url === '/api/bids/pricing-bid') {
      if (options.method === 'PUT') saved = { ...saved, ...JSON.parse(options.body) };
      return response(saved);
    }
    if (url === '/api/bids') return response([saved]);
    return response([]);
  });
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const button = name => [...container.querySelectorAll('button')].find(el => el.textContent.trim() === name);
const open = async () => {
  await act(async () => root.render(<BidBuilder />));
  await act(async () => [...container.querySelectorAll('div')].find(el => el.textContent === saved.title).click());
};

test.each([0, 18, 74.1])('pricing guidance keeps an existing %s percent bid unchanged on opening', async markup => {
  saved = fixture(markup);
  await open();
  const field = container.querySelector('#bid-markup_pct');
  expect(field).not.toBeNull();
  expect(field.value).toBe(String(markup));
  expect(container.textContent).toContain('60% starting markup');
  expect(container.textContent).toContain('100% company target');
  expect(fetch.mock.calls.some(([, options]) => options.method === 'PUT' || options.method === 'POST')).toBe(false);
});

test('markup presets update the draft only and a saved choice survives reopening without creating invoices', async () => {
  await open();
  expect(button('Use 60%')).toBeDefined();
  await act(async () => button('Use 60%').click());
  expect(container.querySelector('#bid-markup_pct').value).toBe('60');
  expect(container.textContent).toContain('$160,000.00');
  expect(saved.markup_pct).toBe(18);
  await act(async () => button('Use 100% target').click());
  expect(container.querySelector('#bid-markup_pct').value).toBe('100');
  expect(container.textContent).toContain('$200,000.00');
  expect(fetch.mock.calls.some(([, options]) => options.method === 'PUT' || options.method === 'POST')).toBe(false);
  await act(async () => button('Save Bid').click());
  expect(saved).toMatchObject({ markup_pct: 100, tax_pct: 0, contingency_pct: 0, items: fixture(18).items });
  await act(async () => root.unmount()); root = createRoot(container); await open();
  expect(container.querySelector('#bid-markup_pct').value).toBe('100');
  expect(fetch.mock.calls.every(([url]) => url.startsWith('/api/bids') || url === '/api/clients')).toBe(true);
});
