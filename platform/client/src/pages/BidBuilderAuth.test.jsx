import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BidBuilder from './BidBuilder';
import { setAuthSession } from '../utils/authFetch';

const bid = { id: 'bid-a', title: 'Staff A bid', bid_number: 'BID-A', status: 'draft', markup_pct: 10, tax_pct: 0, contingency_pct: 0, items: [] };
const response = data => ({ ok: true, status: 200, json: async () => data });
let container, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test.each([
  ['Download PDF', '/api/bids/bid-a/pdf'],
  ['Accept & Create Draw Schedule →', '/api/invoices/from-bid/bid-a'],
  ['Create InvoiceShelf Estimate', '/api/invoice-engine/bids/bid-a/estimate'],
])('account switch during bid refresh stops the remaining %s action', async (action, prohibitedPath) => {
  let finishRefresh, saved = false;
  global.fetch = jest.fn(async (url, options) => {
    if (url === '/api/bids/bid-a') {
      if (options.method === 'PUT') saved = true;
      return response(bid);
    }
    if (url === '/api/bids') return saved ? new Promise(resolve => { finishRefresh = resolve; }) : response([bid]);
    return response([]);
  });
  await act(async () => root.render(<BidBuilder />));
  await act(async () => [...container.querySelectorAll('div')].find(el => el.textContent === 'Staff A bid').click());
  await act(async () => [...container.querySelectorAll('button')].find(el => el.textContent.trim() === action).click());
  expect(finishRefresh).toEqual(expect.any(Function));
  await act(async () => {
    setAuthSession({ userId: 'staff-b', sessionId: 'session-b', getToken: async () => 'token-b' });
    root.render(<div>Account B workspace</div>);
    finishRefresh(response([bid]));
  });
  expect(fetch.mock.calls.some(([url]) => url === prohibitedPath)).toBe(false);
  expect(fetch.mock.calls.some(([, options]) => options.headers.get('authorization') === 'Bearer token-b')).toBe(false);
});
