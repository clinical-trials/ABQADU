import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import CommandCenter from './CommandCenter';
import { clearAuthSession } from '../utils/authFetch';

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

function packetPdfFixture(popup = true) {
  const printWindow = popup ? { opener: window, closed: false, document: document.implementation.createHTMLDocument(), location: { replace: jest.fn() }, close: jest.fn() } : null;
  jest.spyOn(window, 'open').mockReturnValue(printWindow);
  URL.createObjectURL = jest.fn(() => 'blob:contractor-packet');
  URL.revokeObjectURL = jest.fn();
  const previous = fetch;
  global.fetch = jest.fn((url, options) => url.endsWith('/client-packet.pdf')
    ? Promise.resolve({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/pdf' }), blob: async () => new Blob(['%PDF-1.7 test packet'], { type: 'application/pdf' }) })
    : previous(url, options));
  return printWindow;
}

test('Print Client Packet reserves its tab immediately and opens the selected project PDF without a preview step', async () => {
  const printWindow = packetPdfFixture();
  await mount();
  await act(async () => Simulate.change(container.querySelector('[aria-label="Active project"]'), { target: { value: 'two' } }));
  await act(async () => {
    button('Print Client Packet').click();
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(printWindow.document.body.textContent).toContain('Preparing');
  });
  expect(fetch.mock.calls.some(([url]) => url === '/api/command-center/projects/two/client-packet.pdf')).toBe(true);
  expect(printWindow.location.replace).toHaveBeenCalledWith('blob:contractor-packet');
  expect(printWindow.opener).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('a[download]').href).toBe('blob:contractor-packet');
});

test('the preview Print packet button opens a PDF and does not depend on native window.print', async () => {
  const printWindow = packetPdfFixture();
  const print = jest.spyOn(window, 'print').mockImplementation(() => {});
  await mount();
  await act(async () => button('Preview Client View').click());
  await act(async () => [...document.querySelector('[role="dialog"]').querySelectorAll('button')].find(el => el.textContent === 'Print packet').click());
  expect(printWindow.location.replace).toHaveBeenCalledWith('blob:contractor-packet');
  expect(print).not.toHaveBeenCalled();
});

test('a blocked print popup still offers an accessible PDF open and download link', async () => {
  packetPdfFixture(false);
  await mount();
  await act(async () => button('Print Client Packet').click());
  const link = container.querySelector('a[download]');
  expect(link).not.toBeNull();
  expect(link.download).toMatch(/\.pdf$/);
  expect(container.textContent).toMatch(/blocked/i);
  expect(container.querySelector('a[target="_blank"]').href).toBe('blob:contractor-packet');
});

test('PDF failure closes the loading tab, shows the error and permits retry', async () => {
  const printWindow = packetPdfFixture();
  const previous = fetch;
  fetch = jest.fn((url, options) => url.endsWith('/client-packet.pdf')
    ? Promise.resolve({ ok: false, status: 503, json: async () => ({ error: 'Packet PDF is temporarily unavailable.' }) })
    : previous(url, options));
  await mount();
  await act(async () => button('Print Client Packet').click());
  expect(printWindow.close).toHaveBeenCalled();
  expect(container.textContent).toContain('Packet PDF is temporarily unavailable.');
  expect(button('Print Client Packet').disabled).toBe(false);
  expect(container.querySelector('a[download]')).toBeNull();
});

test('printing saves pending project edits before requesting the PDF', async () => {
  packetPdfFixture();
  await mount();
  await act(async () => Simulate.change(container.querySelector('[aria-label="Project status"]'), { target: { value: 'Ready for review' } }));
  await act(async () => button('Print Client Packet').click());
  const saveIndex = fetch.mock.calls.findIndex(([, options]) => options?.method === 'PUT');
  const pdfIndex = fetch.mock.calls.findIndex(([url]) => url.endsWith('/client-packet.pdf'));
  expect(saveIndex).toBeGreaterThan(-1);
  expect(pdfIndex).toBeGreaterThan(saveIndex);
  expect(state.projects[0].status).toBe('Ready for review');
});

test('sign-out while a packet is rendering closes its tab and never exposes the late PDF', async () => {
  const printWindow = packetPdfFixture();
  const previous = fetch;
  let finishPdf;
  fetch = jest.fn((url, options) => url.endsWith('/client-packet.pdf')
    ? Promise.resolve({ ok: true, headers: new Headers({ 'content-type': 'application/pdf' }), blob: () => new Promise(resolve => { finishPdf = resolve; }) })
    : previous(url, options));
  await mount();
  await act(async () => button('Print Client Packet').click());
  expect(finishPdf).toBeDefined();
  await act(async () => { clearAuthSession(); finishPdf(new Blob(['%PDF-private'])); });
  expect(printWindow.close).toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(printWindow.location.replace).not.toHaveBeenCalled();
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

test('failed setup refresh clears stale settings and disables external actions', async () => {
  const fallbackFetch = fetch;
  let statusFails = false;
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/integrations/status') return statusFails
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve({ok:true,json:async()=>Object.fromEntries(['stripe','twilio','ocr','clerk','invoiceshelf','weatherkit'].map(name=>[name,{configured:true}]))});
    return fallbackFetch(url, options);
  });
  await mount();
  expect(container.textContent).toContain('Credentials added · untested');
  statusFails = true;
  await act(async () => button('Refresh setup status').click());
  expect(button('Send Live SMS').disabled).toBe(true);
  expect(container.textContent).toContain('Status unavailable');
});

test('Apple forecasts show attribution and planning estimates, then clear on a failed refresh', async () => {
  const previous = fetch;
  let fails = false;
  global.fetch = jest.fn((url, options) => url.startsWith('/api/weather/forecast?')
    ? Promise.resolve({ok:!fails,json:async()=>fails ? {error:'WeatherKit temporarily unavailable'} : {zip:'87106',source:'Apple Weather',provider:'weatherkit',location:'Albuquerque site',checked_at:'2026-09-21T18:00:00Z',current:{temp_f:75,wind_mph:8},days:[{date:'2026-09-21',high_f:81,low_f:58,rain_chance:30,wind_mph:12}],risk_level:'moderate',delay_days:2,crew_message:'Review exposed work.',attribution:{mark_url:'https://weatherkit.apple.com/assets/branding/en/Apple_Weather_wht_en_2X.png',legal_url:'https://developer.apple.com/weatherkit/data-source-attribution/'}}})
    : previous(url,options));
  await mount();
  await act(async()=>button('Check Weather').click());
  expect(container.querySelector('img[alt="Apple Weather"]')).not.toBeNull();
  expect(container.textContent).toContain('75°F');
  expect(container.textContent).toContain('ABQ ADU planning');
  expect(container.textContent).toContain('81° / 58°');
  fails = true;
  await act(async()=>button('Check Weather').click());
  expect(container.querySelector('img[alt="Apple Weather"]')).toBeNull();
  expect(button('Log Weather Risk').disabled).toBe(true);
  expect(container.textContent).toContain('WeatherKit temporarily unavailable');
});

test('logging weather sends only selected project and ZIP rather than a browser forecast', async () => {
  const previous = fetch;
  global.fetch = jest.fn((url, options) => url.startsWith('/api/weather/forecast?')
    ? Promise.resolve({ok:true,json:async()=>({zip:'87106',source:'Apple Weather',provider:'weatherkit',location:'Site',current:{},days:[],risk_level:'low',delay_days:0,crew_message:'Check site conditions.'})})
    : previous(url,options));
  await mount();
  await act(async()=>button('Check Weather').click());
  await act(async()=>button('Log Weather Risk').click());
  const call = fetch.mock.calls.find(([url])=>url==='/api/weather/forecast/activity');
  expect(JSON.parse(call[1].body)).toEqual({zip:'87106',project_id:'one'});
});

test('a weather response arriving after a project change cannot reappear as current weather', async () => {
  const previous = fetch;
  let resolveForecast;
  global.fetch = jest.fn((url, options) => url.startsWith('/api/weather/forecast?')
    ? new Promise(resolve=>{resolveForecast=resolve;}) : previous(url,options));
  await mount();
  await act(async()=>button('Check Weather').click());
  await act(async()=>Simulate.change(container.querySelector('[aria-label="Active project"]'),{target:{value:'two'}}));
  await act(async()=>resolveForecast({ok:true,json:async()=>({zip:'87106',source:'Apple Weather',provider:'weatherkit',location:'First site late result',current:{temp_f:75},days:[],risk_level:'low',delay_days:0})}));
  await act(async()=>Simulate.change(container.querySelector('[aria-label="Active project"]'),{target:{value:'one'}}));
  expect(container.textContent).not.toContain('First site late result');
  expect(button('Log Weather Risk').disabled).toBe(true);
});

test('saved invoice drafts import for the selected project without a browser payment amount', async () => {
  const previous = fetch;
  global.fetch = jest.fn((url, options) => url.startsWith('/api/billing/command-center/')
    ? Promise.resolve({ok:true,json:async()=>({invoices:[{id:31}]})}) : previous(url,options));
  await mount();
  await act(async () => Simulate.change(container.querySelector('[aria-label="Active project"]'), {target:{value:'two'}}));
  const importButton = button('Create invoices from saved drafts');
  expect(importButton).toBeDefined();
  await act(async()=>importButton.click());
  const call = fetch.mock.calls.find(([url])=>url === '/api/billing/command-center/two/import');
  expect(call[1]).toMatchObject({method:'POST'});
  expect(call[1].body).toBeUndefined();
  expect(container.textContent).toContain('1 invoice ready');
  expect(fetch.mock.calls.some(([url])=>url === '/api/integrations/stripe/checkout')).toBe(false);
});
