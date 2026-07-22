const fs = require('fs');
const path = require('path');

const routeFile = path.join(__dirname, '..', 'src', 'routes', 'invoiceEngine.js');
const indexFile = path.join(__dirname, '..', 'src', 'index.js');

function assertIncludes(file, text) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}

function run() {
  assertIncludes(routeFile, "router.post('/customers/:clientId/sync'");
  assertIncludes(routeFile, "router.post('/bids/:bidId/estimate'");
  assertIncludes(routeFile, "router.post('/estimates/:bidId/convert'");
  assertIncludes(routeFile, "router.post('/invoices/:invoiceId/sync'");
  assertIncludes(routeFile, "router.post('/invoices/:invoiceId/status'");
  assertIncludes(indexFile, "app.use('/api/invoice-engine'");
  console.log('Invoice engine route static checks passed');
}

if (typeof test === 'function') {
  test('invoice engine routes are registered', run);
} else {
  run();
}
