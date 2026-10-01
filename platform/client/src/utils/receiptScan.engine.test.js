import { scanReceiptPhoto } from './receiptScan';

const { Worker: NativeWorker } = require('node:worker_threads');
const path = require('node:path');
const { encode } = require('bmp-js');

// Exercise the actual pinned engine with the application's adapter and local language
// data. DOM image preparation is covered separately; this bridges worker transport only.
test('owned worker protocol recognizes a synthetic receipt with the installed real engine', async () => {
  const width = 540, height = 160, pixels = Buffer.alloc(width * height * 4, 255);
  const font = {
    T: ['11111','00100','00100','00100','00100','00100','00100'],
    O: ['01110','10001','10001','10001','10001','10001','01110'],
    A: ['01110','10001','10001','11111','10001','10001','10001'],
    L: ['10000','10000','10000','10000','10000','10000','11111'],
    2: ['01110','10001','00001','00010','00100','01000','11111'],
    4: ['00010','00110','01010','10010','11111','00010','00010'],
    0: ['01110','10001','10001','10001','10001','10001','01110'],
    '.': ['00000','00000','00000','00000','00000','00110','00110'],
  };
  [...'TOTAL 24.00'].forEach((char, index) => (font[char] || []).forEach((row, y) => [...row].forEach((bit, x) => {
    if (bit !== '1') return;
    for (let py = 0; py < 6; py++) for (let px = 0; px < 6; px++) {
      const offset = ((y * 6 + py + 55) * width + index * 42 + x * 6 + px + 25) * 4;
      pixels[offset + 1] = 0; pixels[offset + 2] = 0; pixels[offset + 3] = 0;
    }
  })));
  const bytes = encode({ width, height, data: pixels }).data;
  const previousWorker = global.Worker, previousBitmap = global.createImageBitmap;
  const actions = [], close = jest.fn(), terminate = jest.fn();
  let termination, native;
  global.createImageBitmap = async () => ({ width, height, close });
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect() {}, drawImage() {} });
  jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback({ arrayBuffer: async () => Uint8Array.from(bytes).buffer }));
  global.Worker = class {
    constructor(url) {
      expect(url).toBe('http://localhost/ocr/worker.min.js');
      native = new NativeWorker(require.resolve('tesseract.js/src/worker-script/node/index.js'));
      native.on('message', data => this.onmessage?.({ data }));
      native.on('error', () => this.onerror?.({ preventDefault() {} }));
    }
    postMessage(packet, transfer) {
      actions.push(packet.action);
      if (packet.action === 'loadLanguage') packet.payload.options.langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0');
      native.postMessage(packet, transfer);
    }
    terminate() { terminate(); termination = native.terminate(); }
  };
  try {
    const result = await scanReceiptPhoto(new File(['synthetic'], 'receipt.png', { type: 'image/png' }));
    await termination;
    expect(result).toMatch(/TOTAL\s+24\.00/);
    expect(actions).toEqual(['load', 'loadLanguage', 'initialize', 'recognize']);
    expect(close).toHaveBeenCalledTimes(1); expect(terminate).toHaveBeenCalledTimes(1);
  } finally {
    await native?.terminate();
    global.Worker = previousWorker; global.createImageBitmap = previousBitmap; jest.restoreAllMocks();
  }
}, 15000);
