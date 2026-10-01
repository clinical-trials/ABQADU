const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_DECODED_PIXELS = 50 * 1000 * 1000;
const MAX_OCR_SIDE = 2200;
const unreadable = () => new Error('The photo could not be read. Try a clearer photo or enter the receipt manually.');
export function validateReceiptPhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP receipt photo.');
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('Choose a receipt photo smaller than 12 MB.');
}

// Receipt pixels remain in this browser. Only the reviewed fields are saved by the caller.
export async function scanReceiptPhoto(file, { signal, onProgress = () => {} } = {}) {
  validateReceiptPhoto(file);
  const abortError = () => new DOMException('Receipt scan cancelled.', 'AbortError');
  if (signal?.aborted) throw abortError();
  if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function') {
    throw new Error('Photo scanning is unavailable in this browser. Enter the receipt manually or use a current browser.');
  }
  let worker, bitmap, canvas, pending, sequence = 0, stopped = false, terminated = false, rejectStop;
  const stopPromise = new Promise((_resolve, reject) => { rejectStop = reject; });
  const releaseWorker = () => {
    if (worker && !terminated) {
      terminated = true;
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
      worker.terminate();
    }
  };
  const stop = error => {
    if (stopped) return;
    stopped = true; releaseWorker(); rejectStop(error);
    pending?.reject(error); pending = null;
  };
  const abort = () => stop(abortError());
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => stop(new Error('Scanning took too long. Try a smaller, sharper photo or enter the receipt manually.')), 90000);
  const wait = task => Promise.race([task, stopPromise]);
  const progress = value => { if (!stopped) { try { onProgress(value); } catch { /* A progress display cannot retain scanner resources. */ } } };
  try {
    progress({ status: 'preparing photo', progress: 0 });
    const decoding = createImageBitmap(file).then(decoded => {
      if (stopped) { decoded.close(); throw abortError(); }
      bitmap = decoded;
      return decoded;
    });
    await wait(decoding);
    if (!Number.isInteger(bitmap.width) || !Number.isInteger(bitmap.height) || bitmap.width < 1 || bitmap.height < 1
      || bitmap.width > 32768 || bitmap.height > 32768 || bitmap.width * bitmap.height > MAX_DECODED_PIXELS) {
      throw new Error('Receipt photo dimensions are too large. Choose a photo under 50 megapixels or enter the receipt manually.');
    }
    const scale = Math.min(1, MAX_OCR_SIDE / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw unreadable();
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close(); bitmap = null;
    const blob = await wait(new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(unreadable()), 'image/jpeg', .92)));
    const image = new Uint8Array(await wait(blob.arrayBuffer()));
    canvas.width = 0; canvas.height = 0;
    if (stopped) throw abortError();

    // Tesseract.js 6.0.1 worker protocol. Asset preparation guards the version.
    // Owning the native handle avoids createWorker's uncancellable initialization promise.
    const base = new URL('/ocr/', window.location.origin).href;
    worker = new Worker(`${base}worker.min.js`);
    const workerId = 'abq-receipt';
    worker.onmessage = ({ data }) => {
      if (stopped || !pending || data?.workerId !== workerId || data.jobId !== pending.jobId || data.action !== pending.action) return;
      if (data.status === 'progress') { progress(data.data); return; }
      if (data.status === 'reject') { stop(unreadable()); return; }
      if (data.status === 'resolve') { const current = pending; pending = null; current.resolve(data.data); }
    };
    worker.onerror = event => { event.preventDefault?.(); stop(unreadable()); };
    worker.onmessageerror = () => stop(unreadable());
    const job = (action, payload, transfer = []) => wait(new Promise((resolve, reject) => {
      const jobId = `receipt-${++sequence}`;
      pending = { jobId, action, resolve, reject };
      try { worker.postMessage({ workerId, jobId, action, payload }, transfer); }
      catch { stop(unreadable()); }
    }));
    await job('load', { options: { lstmOnly: true, corePath: `${base}core/`, logging: false } });
    await job('loadLanguage', { langs: 'eng', options: { langPath: `${base}lang/`, cacheMethod: 'none', gzip: true, lstmOnly: true } });
    await job('initialize', { langs: 'eng', oem: 1, config: {} });
    const result = await job('recognize', { image, options: {}, output: { text: true } }, [image.buffer]);
    return String(result?.text || '').slice(0, 20000);
  } finally {
    stopped = true;
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    releaseWorker(); bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    pending = null;
  }
}
