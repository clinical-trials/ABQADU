import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import InvoiceBillingActions from './InvoiceBillingActions';

let root, container;
const invoice = {id:42, client_id:8, invoice_number:'INV-42', balance:120};
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = jest.fn(async () => ({ok:true,json:async()=>({id:'cs_test',url:'https://checkout.stripe.com/c/pay/test',invoice_id:42})}));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const render = async (props={}) => act(async()=>root.render(<InvoiceBillingActions invoice={invoice} onChanged={()=>{}} {...props}/>));
const click = async name => act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===name).click());

test('checkout uses the saved invoice id and never sends a browser amount', async()=>{
  await render(); await click('Create payment link');
  const [url,options] = fetch.mock.calls[0];
  expect(url).toBe('/api/billing/invoices/42/checkout');
  expect(options.method).toBe('POST'); expect(options.body).toBeUndefined();
  expect(container.querySelector('a').href).toBe('https://checkout.stripe.com/c/pay/test');
  expect(container.textContent).toContain('Creating a link does not record a payment');
});

test('failed checkout keeps invoice available and shows no success link', async()=>{
  fetch.mockImplementation(async()=>({ok:false,status:409,json:async()=>({error:'Stripe setup is incomplete.'})}));
  await render(); await click('Create payment link');
  expect(container.querySelector('[role="alert"]').textContent).toContain('Stripe setup is incomplete');
  expect(container.querySelector('a')).toBeNull();
});

test('rejects a returned link belonging to a different invoice', async()=>{
  fetch.mockImplementation(async()=>({ok:true,json:async()=>({url:'https://checkout.stripe.com/c/pay/other',invoice_id:99})}));
  await render(); await click('Create payment link');
  expect(container.querySelector('a')).toBeNull();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

test('paid invoices cannot create checkout and remote invoice sync is explicit', async()=>{
  await render({invoice:{...invoice,balance:0}});
  expect([...container.querySelectorAll('button')].some(b=>b.textContent==='Create payment link')).toBe(false);
  await click('Create InvoiceShelf invoice');
  expect(fetch.mock.calls[0][0]).toBe('/api/invoice-engine/invoices/42/sync');
});
