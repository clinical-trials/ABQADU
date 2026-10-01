import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import ReceiptCapture from './ReceiptCapture';
import { scanReceiptPhoto } from '../utils/receiptScan';
import { clearAuthSession, setAuthSession } from '../utils/authFetch';

jest.mock('../utils/receiptScan', () => ({ scanReceiptPhoto: jest.fn() }));
let host, root, props;
const body = 'SAMPLE HARDWARE\n10/01/2026\nSUBTOTAL 100.00\nTOTAL 107.63';
const button = label => [...host.querySelectorAll('button')].find(node => node.textContent === label);
const field = label => host.querySelector(`[aria-label="${label}"]`);
const render = async () => act(async () => root.render(<ReceiptCapture {...props} />));
const click = async label => act(async () => button(label).click());
const change = async (label, value) => act(async () => Simulate.change(field(label), { target: { value } }));
const approve = async () => act(async () => Simulate.change(field('Confirm receipt details'), { target: { checked: true } }));
const photo = (file = new File(['photo'], 'receipt.jpg', { type: 'image/jpeg' })) => act(async () => Simulate.change(field('Receipt photo'), { target: { files: [file] } }));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  scanReceiptPhoto.mockReset(); scanReceiptPhoto.mockResolvedValue(body);
  props = { project: { id: 'job-one', client: 'Sample project' }, busy: false, onSave: jest.fn(async () => true) };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearAuthSession(); jest.restoreAllMocks(); });

test('initial capture is blank and reviewing text never saves a receipt', async () => {
  await render(); expect(field('Receipt text').value).toBe('');
  await change('Receipt text', body); await click('Review receipt text');
  expect(field('Receipt vendor').value).toBe('SAMPLE HARDWARE');
  expect(field('Receipt total').value).toBe('107.63');
  expect(button('Save reviewed receipt').disabled).toBe(true);
  expect(props.onSave).not.toHaveBeenCalled();
});

test('reviewed edits save once with source text and a stable receipt ID', async () => {
  await render(); await change('Receipt text', body); await click('Review receipt text');
  await change('Receipt vendor', 'Reviewed hardware'); await change('Receipt total', '108.00'); await approve();
  await click('Save reviewed receipt');
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({
    id: expect.stringMatching(/^receipt-/), vendor: 'Reviewed hardware', date: '2026-10-01', amount: 108, raw_text: body, source: 'pasted-text',
  }));
  expect(field('Receipt text').value).toBe('');
  expect(host.textContent).toContain('Receipt saved');
});

test('manual entry starts with blank fields and requires valid reviewed values', async () => {
  await render(); await click('Enter manually');
  expect(field('Receipt vendor').value).toBe(''); expect(field('Receipt total').value).toBe(''); expect(field('Receipt date').value).toBe('');
  await change('Receipt vendor', 'Supplier'); await change('Receipt date', '2026-10-01'); await change('Receipt total', '-10'); await approve();
  expect(button('Save reviewed receipt').disabled).toBe(true);
  await change('Receipt total', '10.25'); expect(button('Save reviewed receipt').disabled).toBe(true); await approve();
  await click('Save reviewed receipt');
  expect(props.onSave.mock.calls[0][0]).toMatchObject({ source: 'manual', raw_text: '', amount: 10.25 });
});

test('failed saving preserves edits and reuses its ID when retried', async () => {
  props.onSave.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await render(); await change('Receipt text', body); await click('Review receipt text'); await approve();
  await click('Save reviewed receipt');
  expect(field('Receipt vendor').value).toBe('SAMPLE HARDWARE');
  expect(host.textContent).not.toContain('Receipt saved');
  await click('Save reviewed receipt');
  expect(props.onSave.mock.calls[0][0].id).toBe(props.onSave.mock.calls[1][0].id);
});

test('successful saving gives the next receipt a different ID', async () => {
  await render();
  for (let index = 0; index < 2; index += 1) {
    await change('Receipt text', body); await click('Review receipt text'); await approve(); await click('Save reviewed receipt');
  }
  expect(props.onSave.mock.calls[0][0].id).not.toBe(props.onSave.mock.calls[1][0].id);
});

test('photo recognition provides editable text without uploading or saving a receipt itself', async () => {
  await render(); await photo();
  expect(field('Receipt text').value).toBe(body);
  expect(props.onSave).not.toHaveBeenCalled();
  await click('Review receipt text'); await approve(); await click('Save reviewed receipt');
  expect(props.onSave.mock.calls[0][0].source).toBe('photo-ocr');
});

test('correcting recognized receipt text preserves the photo source', async () => {
  await render(); await photo();
  const corrected = body.replace('107.63', '107.68');
  await change('Receipt text', corrected); await click('Review receipt text'); await approve();
  await click('Save reviewed receipt');
  expect(props.onSave.mock.calls[0][0]).toMatchObject({ source: 'photo-ocr', raw_text: corrected, amount: 107.68 });
});

test('photo validation rejects unsupported formats and excessive file size before OCR', async () => {
  await render(); await photo(new File(['text'], 'receipt.pdf', { type: 'application/pdf' }));
  expect(scanReceiptPhoto).not.toHaveBeenCalled(); expect(host.textContent).toMatch(/JPG.*PNG.*WebP/);
  const big = new File(['photo'], 'receipt.png', { type: 'image/png' }); Object.defineProperty(big, 'size', { value: 12 * 1024 * 1024 + 1 });
  await photo(big); expect(scanReceiptPhoto).not.toHaveBeenCalled(); expect(host.textContent).toContain('12 MB');
});

test('cancel aborts OCR and ignores late progress and results', async () => {
  let finish, callbacks;
  scanReceiptPhoto.mockImplementation((file, options) => { callbacks = options; return new Promise(resolve => { finish = resolve; }); });
  await render(); await change('Receipt text', 'Keep my existing text.'); await photo();
  await act(async () => callbacks.onProgress({ status: 'Recognizing text', progress: 0.5 }));
  expect(host.textContent).toContain('50%');
  await click('Cancel scan'); expect(callbacks.signal.aborted).toBe(true);
  await act(async () => { callbacks.onProgress({ progress: 0.8 }); finish(body); });
  expect(field('Receipt text').value).toBe('Keep my existing text.');
  expect(host.textContent).not.toContain('80%');
  expect(props.onSave).not.toHaveBeenCalled();
});

test('switching jobs clears review and drops an old scan result', async () => {
  let finish, signal;
  scanReceiptPhoto.mockImplementation((file, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  await render(); await photo(); props.project = { id: 'job-two', client: 'Second project' }; await render();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(body));
  expect(field('Receipt text').value).toBe(''); expect(field('Receipt vendor')).toBeNull();
});

test('session changes clear drafts and drop old OCR errors', async () => {
  let reject;
  await act(async () => setAuthSession({ userId: 'one', sessionId: 'one', getToken: async () => 'token' }));
  scanReceiptPhoto.mockImplementation(() => new Promise((resolve, fail) => { reject = fail; }));
  await render(); await photo(); await act(async () => clearAuthSession());
  await act(async () => reject(new Error('Old private scan failure')));
  expect(field('Receipt text').value).toBe(''); expect(host.textContent).not.toContain('Old private scan failure');
});

test('edited raw text invalidates the old approved preview', async () => {
  await render(); await change('Receipt text', body); await click('Review receipt text'); await approve();
  await change('Receipt text', 'A different receipt.');
  expect(button('Save reviewed receipt')).toBeUndefined(); expect(props.onSave).not.toHaveBeenCalled();
});
