import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AppEntry from './AppEntry';

jest.mock('./App', () => () => { throw new Error('Private app must not mount on a payment return.'); });
jest.mock('./components/AuthBoundary', () => () => { throw new Error('Payment return must not require sign-in.'); });

let container, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.fetch = jest.fn();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test.each(['', '?paid=true&amount=1200&project=private', '?result=success'])('payment return stays public and cannot claim payment from query flags %s', async search => {
  await act(async () => root.render(<AppEntry pathname="/payment-return" search={search} />));
  expect(container.textContent).toContain('Check your payment confirmation');
  expect(container.textContent).toContain('Your builder receives confirmation directly from Stripe.');
  expect(container.textContent).not.toMatch(/paid|1200|private/i);
  expect(fetch).not.toHaveBeenCalled();
});

test('a cancelled return has neutral guidance without accessing the workspace', async () => {
  await act(async () => root.render(<AppEntry pathname="/payment-return/" search="?result=cancelled" />));
  expect(container.textContent).toContain('Checkout closed');
  expect(container.textContent).toContain('Closing this page will not interrupt that process.');
  expect(fetch).not.toHaveBeenCalled();
});
