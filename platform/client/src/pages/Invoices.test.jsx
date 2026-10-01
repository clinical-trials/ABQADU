import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import Invoices from './Invoices';
import { getAuthSession } from '../utils/authFetch';
import { saveManualPayment } from '../utils/manualPaymentDraft';

const invoice = { id: 42, invoice_number: 'INV-42', client_name: 'Example homeowner', amount: 100, paid: 0, balance: 100, status: 'sent' };
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'crypto', { configurable: true, value: require('crypto').webcrypto });
  sessionStorage.clear();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const button = label => [...container.querySelectorAll('button')].find(el => el.textContent.trim() === label);
const click = async label => act(async () => button(label).click());
const change = async (label, value) => act(async () => Simulate.change(container.querySelector(`[aria-label="${label}"]`), { target: { value } }));
const mount = async () => act(async () => root.render(<Invoices />));

test('check recording works when optional integrations fail, sends supported details, and refreshes the ledger', async () => {
  let recorded = null;
  global.fetch = jest.fn(async (url, options) => {
    if (url === '/api/integrations/status') return response({ error: 'Optional services unavailable' }, 503);
    if (url.endsWith('/payments')) {
      recorded = JSON.parse(options.body);
      return response({ id: 8, invoice_id: 42, amount: recorded.amount, manual_request_key: recorded.request_id });
    }
    return response([{ ...invoice, paid: recorded ? 40 : 0, balance: recorded ? 60 : 100 }]);
  });
  await mount(); await click('Record check');
  expect(container.querySelector('[aria-label="Payment method"]').value).toBe('check');
  await change('Payment amount', '40.00');
  await change('Date received', '2026-09-30');
  await change('Check number or reference', '  Check 1042  ');
  await click('Save check');
  expect(recorded).toMatchObject({ amount: '40.00', method: 'check', reference: 'Check 1042', paid_date: '2026-09-30' });
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).toContain('$60.00');
  expect(container.textContent).toContain('bank clearance');
  expect(button('Create payment link')).toBeUndefined();
});

test('a lost check acknowledgment retries identical date, reference and request identity after remount', async () => {
  const attempts = [];
  global.fetch = jest.fn(async (url, options) => {
    if (url.endsWith('/payments')) { attempts.push(JSON.parse(options.body)); throw new Error('Response lost'); }
    return response(url === '/api/integrations/status' ? {} : [invoice]);
  });
  await mount(); await click('Record check');
  await change('Date received', '2026-09-29');
  await change('Check number or reference', '1043');
  await click('Save check'); await click('Cancel');
  await act(async () => root.render(<div />));
  await mount(); await click('Resume payment');
  expect(container.querySelector('[aria-label="Date received"]').value).toBe('2026-09-29');
  expect(container.querySelector('[aria-label="Check number or reference"]').value).toBe('1043');
  expect(container.querySelector('[aria-label="Date received"]').disabled).toBe(true);
  expect(container.querySelector('[aria-label="Check number or reference"]').disabled).toBe(true);
  await click('Save check');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test('a legacy saved check retries its original payload without adding date or reference', async () => {
  const original = { amount: '20', method: 'check', request_id: 'a1505a11-a000-4000-8000-100000000000' };
  saveManualPayment(getAuthSession(), invoice.id, original);
  let sent;
  global.fetch = jest.fn(async (url, options) => {
    if (url.endsWith('/payments')) { sent = JSON.parse(options.body); return response({ error: 'Try again' }, 503); }
    return response(url === '/api/integrations/status' ? {} : [invoice]);
  });
  await mount(); await click('Resume payment'); await click('Save check');
  expect(sent).toEqual(original);
});

test.each(['', '2026-02-30', '9999-12-31'])('invalid received date %p prevents a ledger write', async received => {
  global.fetch = jest.fn(async url => response(url === '/api/integrations/status' ? {} : [invoice]));
  await mount(); await click('Record check');
  await change('Date received', received); await click('Save check');
  expect(container.querySelector('[role="dialog"] [role="alert"]')).not.toBeNull();
  expect(fetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});
