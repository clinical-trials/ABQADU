import { scanReceiptPhoto, validateReceiptPhoto } from './receiptScan';

const photo = () => new File(['receipt'], 'receipt.png', { type: 'image/png' });
let worker, bitmap, context, blockedAction, canvas, originalWorker, originalBitmap;
const flush = async () => { for (let index = 0; index < 50; index += 1) await Promise.resolve(); };
beforeEach(() => {
  originalWorker = global.Worker; originalBitmap = global.createImageBitmap;
  blockedAction = null;
  bitmap = { width: 4000, height: 3000, close: jest.fn() };
  global.createImageBitmap = jest.fn().mockResolvedValue(bitmap);
  context = { fillRect: jest.fn(), drawImage: jest.fn() };
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() { canvas = this; return context; });
  jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback({ arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer }));
  global.Worker = jest.fn().mockImplementation(() => {
    worker = { terminate: jest.fn(), postMessage: jest.fn(packet => {
      if (packet.action === blockedAction) return;
      Promise.resolve().then(() => worker.onmessage?.({ data: { ...packet, status: 'resolve', data: packet.action === 'recognize' ? { text: 'TOTAL $24.00' } : {} } }));
    }) };
    return worker;
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); global.Worker = originalWorker; global.createImageBitmap = originalBitmap; });

test('only accepts bounded receipt image uploads', () => {
  expect(() => validateReceiptPhoto(new File(['x'], 'file.pdf', { type: 'application/pdf' }))).toThrow(/JPG/);
  expect(() => validateReceiptPhoto({ type: 'image/jpeg', size: 13 * 1024 * 1024 })).toThrow(/12 MB/);
  expect(() => validateReceiptPhoto(photo())).not.toThrow();
});

test('uses owned same-origin worker and sends only a resized photo through the installed engine protocol', async () => {
  expect(await scanReceiptPhoto(photo())).toBe('TOTAL $24.00');
  expect(Worker).toHaveBeenCalledWith('http://localhost/ocr/worker.min.js');
  const packets = worker.postMessage.mock.calls.map(([packet]) => packet);
  expect(packets.map(packet => packet.action)).toEqual(['load', 'loadLanguage', 'initialize', 'recognize']);
  expect(packets[0].payload.options).toMatchObject({ corePath: 'http://localhost/ocr/core/', lstmOnly: true });
  expect(packets[1].payload.options).toMatchObject({ langPath: 'http://localhost/ocr/lang/', cacheMethod: 'none' });
  expect(packets[2].payload).toMatchObject({ langs: 'eng', oem: 1 });
  expect(packets[3].payload.image).toBeInstanceOf(Uint8Array);
  expect(packets[3].payload.output).toEqual({ text: true });
  expect(new Set(packets.map(packet => packet.jobId)).size).toBe(4);
  expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2200, 1650);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
  expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test.each(['load', 'loadLanguage', 'initialize', 'recognize'])('cancellation during %s immediately terminates the native worker', async stage => {
  blockedAction = stage;
  const controller = new AbortController(), pending = scanReceiptPhoto(photo(), { signal: controller.signal });
  await flush();
  expect(worker.postMessage.mock.calls.at(-1)[0].action).toBe(stage);
  controller.abort();
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test('a stalled language initialization times out and cannot leave a worker running', async () => {
  jest.useFakeTimers(); blockedAction = 'loadLanguage';
  const pending = scanReceiptPhoto(photo());
  await flush(); jest.advanceTimersByTime(90000);
  await expect(pending).rejects.toThrow(/too long/);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test.each(['load', 'loadLanguage', 'initialize', 'recognize'])('a %s rejection is sanitized and terminates without awaiting a future handle', async stage => {
  blockedAction = stage;
  const pending = scanReceiptPhoto(photo()); await flush();
  const packet = worker.postMessage.mock.calls.at(-1)[0];
  worker.onmessage({ data: { ...packet, status: 'reject', data: 'private receipt content / filesystem details' } });
  await expect(pending).rejects.toThrow('The photo could not be read. Try a clearer photo or enter the receipt manually.');
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test('native worker errors terminate and remain actionable', async () => {
  blockedAction = 'load';
  const pending = scanReceiptPhoto(photo()); await flush();
  const event = { preventDefault: jest.fn() }; worker.onerror(event);
  await expect(pending).rejects.toThrow(/could not be read/);
  expect(event.preventDefault).toHaveBeenCalled(); expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test('cancelling while decoding releases a late bitmap without starting any worker', async () => {
  let finish; global.createImageBitmap.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController(), pending = scanReceiptPhoto(photo(), { signal: controller.signal });
  controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  finish(bitmap); await flush();
  expect(bitmap.close).toHaveBeenCalledTimes(1); expect(Worker).not.toHaveBeenCalled();
});

test('overlarge decoded images are released without allocating a canvas or starting OCR', async () => {
  bitmap.width = 20000; bitmap.height = 20000;
  await expect(scanReceiptPhoto(photo())).rejects.toThrow(/dimensions/);
  expect(bitmap.close).toHaveBeenCalledTimes(1); expect(context.drawImage).not.toHaveBeenCalled(); expect(Worker).not.toHaveBeenCalled();
});

test('small photos retain aspect and dimensions instead of being enlarged', async () => {
  bitmap.width = 800; bitmap.height = 1000;
  await scanReceiptPhoto(photo());
  expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 800, 1000);
});

test('stale worker responses cannot complete a different operation or leak late progress', async () => {
  blockedAction = 'load'; const onProgress = jest.fn(), controller = new AbortController();
  const pending = scanReceiptPhoto(photo(), { signal: controller.signal, onProgress }); await flush();
  const packet = worker.postMessage.mock.calls.at(-1)[0];
  const handler = worker.onmessage;
  handler({ data: { ...packet, jobId: 'not-this-job', status: 'resolve', data: {} } });
  await flush(); expect(worker.postMessage).toHaveBeenCalledTimes(1);
  controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  onProgress.mockClear(); handler({ data: { ...packet, status: 'progress', data: { progress: .5 } } });
  expect(onProgress).not.toHaveBeenCalled();
});
