const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'public/ocr');
const packageRoot = name => path.dirname(require.resolve(`${name}/package.json`));
// receiptScan.js owns the worker protocol so every initialization can be cancelled.
// Recheck that adapter and its real-engine test before changing the pinned SDK.
if (require('tesseract.js/package.json').version !== '6.0.1') {
  throw new Error('Receipt OCR protocol requires Tesseract.js 6.0.1. Review the adapter before upgrading.');
}
for (const dir of ['core', 'lang', 'licenses']) fs.mkdirSync(path.join(target, dir), { recursive: true });
const tesseract = packageRoot('tesseract.js');
const core = packageRoot('tesseract.js-core');
const english = packageRoot('@tesseract.js-data/eng');
fs.copyFileSync(path.join(tesseract, 'dist/worker.min.js'), path.join(target, 'worker.min.js'));
for (const file of fs.readdirSync(core).filter(file => /^tesseract-core.*\.wasm(?:\.js)?$/.test(file))) {
  fs.copyFileSync(path.join(core, file), path.join(target, 'core', file));
}
fs.copyFileSync(path.join(english, '4.0.0/eng.traineddata.gz'), path.join(target, 'lang/eng.traineddata.gz'));
for (const [name, source] of [['tesseract',tesseract],['core',core],['english',english]]) {
  for (const file of fs.readdirSync(source).filter(file => /^(license|notice)/i.test(file))) {
    fs.copyFileSync(path.join(source,file),path.join(target,'licenses',`${name}-${file}`));
  }
}
console.log('Prepared same-origin receipt OCR assets (English).');
