import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CostEstimator from './CostEstimator';
import { calculateEstimate } from '../utils/quickEstimate';
import { setAuthSession } from '../utils/authFetch';
import { DEMO_ROOM_SCAN } from '../utils/roomScan';

const response = data => ({ ok: true, status: 200, json: async () => data });
let host, root, createResponse;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
  createResponse = payload => response({ id: 12, bid_number: 'BID-TEST-12', status: 'draft', ...payload,
    totals: calculateEstimate({ ...payload, scope: payload.notes, client_id: payload.client_id || '' }) });
  global.fetch = jest.fn(async (url, options = {}) => {
    if (url === '/api/clients') return response([{ id: 4, name: 'Sample customer' }]);
    if (url === '/api/bids' && options.method === 'POST') return createResponse(JSON.parse(options.body));
    throw new Error(`Unexpected request: ${url}`);
  });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks(); delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === text);
const mount = () => act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><CostEstimator /></MemoryRouter>));
const click = text => act(async () => button(text).click());
async function change(selector, value) {
  await act(async () => {
    const element = host.querySelector(selector);
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function priceManualLine() {
  await click('+ Add line item');
  await change('[id^="estimate-desc-"]', 'Installation labor');
  await change('[id^="estimate-category-"]', 'Labor');
  await change('[id^="estimate-qty-"]', '8');
  await change('[id^="estimate-unit-"]', 'hr');
  await change('[id^="estimate-cost-"]', '50');
}
async function ready() {
  await mount(); await change('#estimate-title', 'Reviewed patio scope');
  await change('#estimate-scope', 'Reviewed customer-facing work.');
  await priceManualLine(); await change('#estimate-tax', '0');
}
const creates = () => fetch.mock.calls.filter(([url, options]) => url === '/api/bids' && options.method === 'POST');

test('trade checklists leave quantities and costs unknown and cannot create a bid', async () => {
  await mount(); await click('Concrete');
  expect(host.querySelectorAll('.estimate-item')).toHaveLength(5);
  expect([...host.querySelectorAll('[id^="estimate-qty-"]')].every(item => item.value === '')).toBe(true);
  expect([...host.querySelectorAll('[id^="estimate-cost-"]')].every(item => item.value === '')).toBe(true);
  expect(host.textContent).toContain('5 items need pricing');
  expect(button('Save draft bid').disabled).toBe(true);
  expect(host.querySelector('.estimate-print-sheet').textContent).toContain('Needs pricing');
  expect(host.querySelector('.estimate-print-sheet').textContent).toContain('Tax (unconfirmed)');
  expect(creates()).toHaveLength(0);
});

test('reviewed rates control the estimate and blank tax is not silently treated as zero', async () => {
  await mount(); await change('#estimate-title', 'Patio'); await priceManualLine();
  expect(host.querySelector('.estimate-grand-total dd').textContent).toBe('—');
  expect(button('Save draft bid').disabled).toBe(true);
  await change('#estimate-tax', '0');
  expect(host.querySelector('.estimate-grand-total dd').textContent).toBe('$660.00');
  await click('100% target');
  expect(host.querySelector('.estimate-grand-total dd').textContent).toBe('$820.00');
  await change('[id^="estimate-cost-"]', '');
  expect(host.querySelector('.estimate-grand-total dd').textContent).toBe('—');
  expect(button('Save draft bid').disabled).toBe(true);
});

test('one explicit action saves the reviewed draft without issuing invoices or sending messages', async () => {
  await ready(); await change('#estimate-client', '4');
  await click('Save draft bid');
  expect(creates()).toHaveLength(1);
  const payload = JSON.parse(creates()[0][1].body);
  expect(payload).toMatchObject({ title: 'Reviewed patio scope', project_id: null, client_id: '4', markup_pct: 60, contingency_pct: 5, tax_pct: 0, notes: 'Reviewed customer-facing work.', items: [{ category: 'Labor', description: 'Installation labor', qty: 8, unit_cost: 50, unit: 'hr' }] });
  expect(host.textContent).toContain('BID-TEST-12 saved as a draft');
  expect(button('Save draft bid')).toBeUndefined();
  expect(button('Download customer bid PDF')).toBeDefined();
  expect(fetch.mock.calls.every(([url]) => ['/api/clients', '/api/bids'].includes(url))).toBe(true);
});

test('repeated clicks while saving cannot create duplicate bids', async () => {
  let finish;
  createResponse = payload => new Promise(resolve => { finish = () => resolve(response({ id: 12, bid_number: 'BID-12', status: 'draft', ...payload, totals: { total: 660 } })); });
  await ready();
  const save = button('Save draft bid');
  await act(async () => { save.click(); save.click(); });
  expect(creates()).toHaveLength(1);
  expect(button('Saving draft…').disabled).toBe(true);
  await act(async () => finish());
  expect(host.textContent).toContain('BID-12 saved as a draft');
});

test.each(['network', 'malformed'])('an uncertain %s save preserves the worksheet and blocks automatic retry after navigation', async kind => {
  createResponse = () => kind === 'network' ? Promise.reject(new Error('Connection lost')) : response({ id: 12 });
  await ready(); await click('Save draft bid');
  expect(host.textContent).toContain('Save could not be confirmed');
  expect(host.querySelector('#estimate-title').value).toBe('Reviewed patio scope');
  expect(button('Save draft bid').disabled).toBe(true);
  await act(async () => root.unmount()); root = createRoot(host); await mount();
  expect(host.textContent).toContain('Save could not be confirmed');
  expect(host.querySelector('#estimate-title').value).toBe('Reviewed patio scope');
  await click('Save draft bid');
  expect(creates()).toHaveLength(1);
});

test('unsaved draft survives navigation within the same session and is cleared for the next account', async () => {
  await ready(); await act(async () => root.unmount()); root = createRoot(host); await mount();
  expect(host.querySelector('#estimate-title').value).toBe('Reviewed patio scope');
  await act(async () => setAuthSession({ userId: 'different-staff', sessionId: 'different-session', getToken: async () => 'other-token' }));
  expect(host.textContent).not.toContain('Reviewed patio scope');
  await act(async () => root.unmount()); root = createRoot(host); await mount();
  expect(host.querySelector('#estimate-title').value).toBe('');
  expect(host.querySelectorAll('.estimate-item')).toHaveLength(0);
});

test('account switch during save cannot show the old customer data or send another request', async () => {
  let finish;
  createResponse = payload => new Promise(resolve => { finish = () => resolve(response({ id: 12, bid_number: 'BID-12', status: 'draft', ...payload, totals: { total: 660 } })); });
  await ready(); await click('Save draft bid');
  await act(async () => {
    setAuthSession({ userId: 'next-staff', sessionId: 'next-session', getToken: async () => 'next-token' });
    finish();
  });
  expect(host.textContent).toBe('Sign in again to continue estimating.');
  expect(creates()).toHaveLength(1);
});

test('printing uses the current worksheet without creating a server record', async () => {
  jest.spyOn(window, 'print').mockImplementation(() => {});
  await ready(); await click('Print / save cost worksheet');
  expect(window.print).toHaveBeenCalledTimes(1);
  expect(host.querySelector('.estimate-print-sheet').textContent).toContain('Internal cost worksheet');
  expect(creates()).toHaveLength(0);
});

test('dictation is reviewed text, does not double append interim results, and stops on session change', async () => {
  let recognition;
  window.SpeechRecognition = class { constructor() { recognition = this; } start = jest.fn(); stop = jest.fn(); abort = jest.fn(); };
  await mount(); await change('#estimate-scope', 'Existing notes.'); await click('Dictate scope');
  expect(recognition.start).toHaveBeenCalledTimes(1);
  await act(async () => recognition.onresult({ results: [[{ transcript: 'Concrete patio' }]] }));
  await act(async () => recognition.onresult({ results: [[{ transcript: 'Concrete patio and steps' }]] }));
  expect(host.querySelector('#estimate-scope').value).toBe('Existing notes.\nConcrete patio and steps');
  expect(creates()).toHaveLength(0);
  await act(async () => setAuthSession({ userId: 'next', sessionId: 'next', getToken: async () => 'next' }));
  expect(recognition.abort).toHaveBeenCalledTimes(1);
  expect(recognition.onresult).toBeNull();
});

test('permission-denied dictation keeps typed scope editable', async () => {
  let recognition;
  window.SpeechRecognition = class { constructor() { recognition = this; } start() {} abort() {} };
  await mount(); await change('#estimate-scope', 'Keep these words'); await click('Dictate scope');
  await act(async () => recognition.onerror({ error: 'not-allowed' }));
  expect(host.textContent).toContain('Microphone permission was denied');
  expect(host.querySelector('#estimate-scope').value).toBe('Keep these words');
  expect(host.querySelector('#estimate-scope').readOnly).toBe(false);
});

test.each(['success', 'failure'])('a late %s from an older worksheet cannot replace newer work', async outcome => {
  let finish;
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  createResponse = payload => new Promise((resolve, reject) => {
    finish = () => outcome === 'success' ? resolve(response({ id: 12, bid_number: 'BID-12', status: 'draft', ...payload, totals: { total: 660 } })) : reject(new Error('Lost connection'));
  });
  await ready(); await click('Save draft bid');
  await act(async () => root.unmount()); root = createRoot(host); await mount();
  await click('New estimate'); await change('#estimate-title', 'Keep my newer worksheet');
  await act(async () => finish());
  await act(async () => root.unmount()); root = createRoot(host); await mount();
  expect(host.querySelector('#estimate-title').value).toBe('Keep my newer worksheet');
  expect(host.textContent).not.toContain('BID-12 saved');
});

test('numeric whitespace is consistent in rows and totals, and invalid rows mark the subtotal partial', async () => {
  await ready(); await change('[id^="estimate-qty-"]', ' 2 '); await change('[id^="estimate-cost-"]', '100 ');
  expect(host.querySelector('.estimate-line-total').textContent).toContain('$200.00');
  expect(host.querySelector('.estimate-grand-total dd').textContent).toBe('$330.00');
  expect(host.querySelector('.estimate-print-sheet tbody').textContent).not.toContain('Needs pricing');
  await change('[id^="estimate-qty-"]', '-2');
  expect(host.querySelector('.estimate-status').textContent).toContain('1 item needs pricing');
  expect(host.querySelector('.estimate-review').textContent).toContain('Priced direct costs so far');
  expect(button('Save draft bid').disabled).toBe(true);
});

test('outdoor and indoor checklists are easy to find without changing existing prices', async () => {
  await ready();
  expect(button('Outdoor').getAttribute('aria-pressed')).toBe('true');
  expect(button('Kitchen')).toBeUndefined();
  expect(host.querySelector('[aria-label="Trade checklists"]').textContent).toContain('Drainage');
  await click('Indoor');
  expect(button('Kitchen')).toBeDefined();
  expect(button('Concrete')).toBeUndefined();
  await click('All work');
  expect(button('Kitchen')).toBeDefined();
  expect(button('Concrete')).toBeDefined();
  expect(host.querySelector('[id^="estimate-cost-"]').value).toBe('50');
  expect(host.querySelector('.estimate-grand-total dd').textContent).toBe('$660.00');
});

test('a measured concrete quantity adds a new unpriced line without replacing entered work', async () => {
  await ready();
  await change('#estimate-measure-length', '20');
  await change('#estimate-measure-width', '12');
  expect(button('Add as a new line item').disabled).toBe(true);
  await change('#estimate-measure-depth', '4');
  expect(host.querySelector('.estimate-measured-result output').textContent).toBe('2.97 cu yd');
  await click('Add as a new line item');
  const rows = host.querySelectorAll('.estimate-item');
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('[id^="estimate-cost-"]').value).toBe('50');
  expect(rows[1].querySelector('[id^="estimate-qty-"]').value).toBe('2.97');
  expect(rows[1].querySelector('[id^="estimate-unit-"]').value).toBe('cu yd');
  expect(rows[1].querySelector('[id^="estimate-cost-"]').value).toBe('');
  expect(button('Quantity added to worksheet').disabled).toBe(true);
  expect(button('Save draft bid').disabled).toBe(true);
  expect(creates()).toHaveLength(0);
  await change('#estimate-measure-waste', '10');
  expect(host.querySelector('.estimate-measured-result output').textContent).toBe('3.26 cu yd');
  // Existing measured lines stay fixed until the contractor explicitly adds another.
  expect(rows[1].querySelector('[id^="estimate-qty-"]').value).toBe('2.97');
  await change('[aria-label="Line item 2"] [id^="estimate-cost-"]', '200');
  await click('Save draft bid');
  const payload = JSON.parse(creates()[0][1].body);
  expect(payload.items[1]).toMatchObject({ qty: 2.97, unit: 'cu yd', unit_cost: 200 });
  expect(payload.items[1].description).toContain('20');
  expect(payload.items[1].description).toContain('12');
  expect(payload.items[1].description).toContain('4');
  expect(host.querySelector('.estimate-print-sheet').textContent).toContain(payload.items[1].description);
});

test('changing calculator types clears dimensions so inches cannot become feet silently', async () => {
  await mount();
  await change('#estimate-measure-length', '20');
  await change('#estimate-measure-width', '12');
  await change('#estimate-measure-depth', '4');
  await change('#estimate-measure-type', 'excavation');
  expect(host.querySelector('#estimate-measure-depth').value).toBe('');
  expect(host.querySelector('#estimate-measure-length').value).toBe('');
  expect(button('Add as a new line item').disabled).toBe(true);
});

test('site review notes are explicit, deduplicated, printable, and saved with the bid without extra charges', async () => {
  await ready();
  await click('+ Water / electric / sewer');
  await click('✓ Water / electric / sewer');
  const scope = host.querySelector('#estimate-scope').value;
  expect(scope.match(/Site review needed:/g)).toHaveLength(1);
  expect(scope).toContain('connection points');
  expect(host.querySelector('.estimate-grand-total dd').textContent).toBe('$660.00');
  expect(host.querySelector('.estimate-print-sheet').textContent).toContain(scope);
  await click('Save draft bid');
  expect(JSON.parse(creates()[0][1].body).notes).toBe(scope);
});

test('site notes cannot silently truncate a full scope', async () => {
  await mount(); await change('#estimate-scope', 'x'.repeat(4990));
  await click('+ Soil & excavation');
  expect(host.querySelector('#estimate-scope').value).toBe('x'.repeat(4990));
  expect(host.textContent).toContain('The scope is full');
});

test('starting a new worksheet clears outdoor measurement scratch values', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  await ready(); await change('#estimate-measure-length', '20');
  await click('New estimate');
  expect(host.querySelector('#estimate-measure-length').value).toBe('');
  expect(host.querySelectorAll('.estimate-item')).toHaveLength(0);
});

test('unfinished outdoor measurements survive navigation but never follow an account change', async () => {
  await mount();
  await change('#estimate-measure-type', 'fence');
  await change('#estimate-measure-length', '100');
  await change('#estimate-measure-openings', '12');
  await act(async () => root.unmount()); root = createRoot(host); await mount();
  expect(host.querySelector('#estimate-measure-type').value).toBe('fence');
  expect(host.querySelector('#estimate-measure-length').value).toBe('100');
  expect(host.querySelector('.estimate-measured-result output').textContent).toBe('88 linear ft');
  await act(async () => setAuthSession({ userId: 'another-measurer', sessionId: 'another-measurement', getToken: async () => 'another-token' }));
  await act(async () => root.unmount()); root = createRoot(host); await mount();
  expect(host.querySelector('#estimate-measure-type').value).toBe('concrete');
  expect(host.querySelector('#estimate-measure-length').value).toBe('');
});

test('indoor scan review adds selected quantities with provenance and blank prices only after confirmation', async () => {
  await ready(); await click('Indoor'); await click('Try sample room');
  expect(host.textContent).toContain('Sample room · not a site measurement');
  expect(button('Add 1 measured item').disabled).toBe(true);
  expect(host.querySelectorAll('.estimate-item')).toHaveLength(1);
  await act(async () => host.querySelector('#room-scan-reviewed').click());
  await click('Add 1 measured item');
  const rows = host.querySelectorAll('.estimate-item');
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('[id^="estimate-cost-"]').value).toBe('50');
  expect(Number(rows[1].querySelector('[id^="estimate-qty-"]').value)).toBeGreaterThan(250);
  expect(rows[1].querySelector('[id^="estimate-unit-"]').value).toBe('sq ft');
  expect(rows[1].querySelector('[id^="estimate-cost-"]').value).toBe('');
  expect(rows[1].querySelector('[id^="estimate-desc-"]').value).toContain('DEMO FIXTURE');
  expect(host.textContent).toContain('Already in this worksheet');
  expect(button('Save draft bid').disabled).toBe(true);
  expect(creates()).toHaveLength(0);
  await change('[aria-label="Line item 2"] [id^="estimate-cost-"]', '2');
  await click('Save draft bid');
  const payload = JSON.parse(creates()[0][1].body);
  expect(payload.items[1].description).toContain('DEMO FIXTURE');
  expect(payload.items[1].unit_cost).toBe(2);
  expect(host.querySelector('.estimate-print-sheet').textContent).toContain(payload.items[1].description);
});

test('reimporting the same room does not add duplicate work and switching views preserves scan review', async () => {
  await mount(); await click('Indoor'); await click('Try sample room');
  await act(async () => host.querySelector('#room-scan-reviewed').click());
  await click('Add 1 measured item');
  await click('Outdoor'); await click('Indoor');
  expect(host.textContent).toContain('Already in this worksheet');
  expect(host.textContent).toContain('Sample room · not a site measurement');
  await click('Try sample room');
  await act(async () => host.querySelector('#room-scan-reviewed').click());
  expect(button('Add selected measured items').disabled).toBe(true);
  expect(host.querySelectorAll('.estimate-item')).toHaveLength(1);
  await act(async () => root.unmount()); root = createRoot(host); await mount();
  expect(button('Indoor').getAttribute('aria-pressed')).toBe('true');
  expect(host.textContent).toContain('Already in this worksheet');
});

test('wall review exposes dimensions and deductions without approving or pricing the scan', async () => {
  await mount(); await click('Indoor'); await click('Try sample room');
  const review = host.querySelector('.estimate-surface-review');
  expect(review.open).toBe(false);
  expect(review.querySelectorAll('.estimate-wall')).toHaveLength(0);
  await act(async () => { review.querySelector('summary').click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(review.open).toBe(true);
  expect(review.querySelectorAll('.estimate-wall')).toHaveLength(4);
  const firstWall = review.querySelector('.estimate-wall');
  expect(firstWall.querySelector('.estimate-wall-dimensions').textContent).toBe('13.12 ft long × 7.87 ft high');
  expect(firstWall.querySelector('.estimate-wall-calculation').textContent).toContain('20.35 sq ft');
  expect(firstWall.querySelector('.estimate-scan-opening').textContent).toContain('Door 1');
  expect(firstWall.querySelector('.estimate-scan-opening').textContent).toContain('2.96 ft deducted from baseboard');
  expect(review.textContent).toContain('Window: no baseboard deduction');
  expect(review.textContent).toContain('not measurement accuracy');
  expect(host.querySelector('#room-scan-reviewed').checked).toBe(false);
  expect(button('Add 1 measured item').disabled).toBe(true);
  expect(host.querySelectorAll('.estimate-item')).toHaveLength(0);
  expect(creates()).toHaveLength(0);
  await act(async () => { review.querySelector('summary').click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(review.querySelectorAll('.estimate-wall')).toHaveLength(0);
});

test('scan review separates unmatched openings and explains unknown floor contact', async () => {
  const scan = JSON.parse(JSON.stringify(DEMO_ROOM_SCAN));
  scan.rooms[0].openings[0].reaches_floor = null;
  scan.rooms[0].openings[0].confidence = 'low';
  scan.rooms[0].openings[1].wall_id = null;
  await mount(); await click('Indoor');
  await uploadRoom(new File([JSON.stringify(scan)], 'review-openings.json'));
  const review = host.querySelector('.estimate-surface-review');
  await act(async () => { review.querySelector('summary').click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  const linked = review.querySelector('.estimate-wall .estimate-scan-opening');
  expect(linked.textContent).toContain('Floor contact unknown');
  expect(linked.textContent).toContain('no baseboard deduction applied');
  expect(linked.textContent).toContain('RoomPlan confidence: Low');
  const unmatched = review.querySelector('.estimate-unlinked-openings');
  expect(unmatched.textContent).toContain('Window 1');
  expect(unmatched.textContent).toContain('0 sq ft deducted');
  expect(unmatched.textContent).toContain('No wall assigned');
  expect(review.querySelectorAll('.estimate-scan-opening')).toHaveLength(2);
  expect(host.querySelector('#room-scan-reviewed').checked).toBe(false);
  expect(fetch.mock.calls.every(([url]) => url === '/api/clients')).toBe(true);
});

async function uploadRoom(file) {
  await act(async () => {
    const input = host.querySelector('#room-scan-file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

test('room files are reviewed locally, reject malformed content, and do not upload raw scan data', async () => {
  await mount(); await click('Indoor');
  await uploadRoom(new File([JSON.stringify(DEMO_ROOM_SCAN)], 'room.abq.json', { type: 'application/json' }));
  expect(host.textContent).toContain('room.abq.json');
  expect(host.querySelector('#room-scan-reviewed').checked).toBe(false);
  expect(host.querySelectorAll('.estimate-item')).toHaveLength(0);
  expect(fetch.mock.calls.every(([url]) => url === '/api/clients')).toBe(true);
  await uploadRoom(new File(['{not valid}'], 'invalid.json', { type: 'application/json' }));
  expect(host.querySelector('[role="alert"]').textContent).toContain('previous scan remains');
  await uploadRoom(new File(['x'.repeat(1024 * 1024 + 1)], 'large.json'));
  expect(host.querySelector('[role="alert"]').textContent).toContain('1 MB');
  expect(host.querySelectorAll('.estimate-item')).toHaveLength(0);
});

test('account changes clear imported room details and pending file reads cannot populate the next account', async () => {
  let reader;
  const RealFileReader = window.FileReader;
  window.FileReader = class { constructor() { reader = this; } readAsText() {} };
  try {
    await mount(); await click('Indoor');
    await uploadRoom(new File([JSON.stringify(DEMO_ROOM_SCAN)], 'private-room.json'));
    await act(async () => setAuthSession({ userId: 'new-scan-account', sessionId: 'new-scan-session', getToken: async () => 'next' }));
    await act(async () => { reader.result = JSON.stringify(DEMO_ROOM_SCAN); reader.onload(); });
    await act(async () => root.unmount()); root = createRoot(host); await mount(); await click('Indoor');
    expect(host.textContent).not.toContain('private-room.json');
    expect(host.querySelector('#room-scan-reviewed')).toBeNull();
    expect(host.querySelectorAll('.estimate-item')).toHaveLength(0);
  } finally { window.FileReader = RealFileReader; }
});

test('a file read started in an old worksheet cannot populate a new estimate', async () => {
  let reader;
  const RealFileReader = window.FileReader;
  window.FileReader = class { constructor() { reader = this; } readAsText() {} };
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    await mount(); await click('Indoor'); await change('#estimate-title', 'Old job');
    await uploadRoom(new File([JSON.stringify(DEMO_ROOM_SCAN)], 'old-job.json'));
    await click('New estimate'); await change('#estimate-title', 'New job');
    await click('Indoor');
    await act(async () => { reader.result = JSON.stringify(DEMO_ROOM_SCAN); reader.onload(); });
    expect(host.querySelector('#estimate-title').value).toBe('New job');
    expect(host.textContent).not.toContain('old-job.json');
    expect(host.querySelector('#room-scan-reviewed')).toBeNull();
  } finally { window.FileReader = RealFileReader; }
});
