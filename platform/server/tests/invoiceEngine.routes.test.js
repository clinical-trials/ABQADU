const fs = require('fs');

const routeFile = 'platform/server/src/routes/invoiceEngine.js';
const indexFile = 'platform/server/src/index.js';

function assertIncludes(file, text) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}

assertIncludes(routeFile, "router.post('/customers/:clientId/sync'");
assertIncludes(routeFile, "router.post('/bids/:bidId/estimate'");
assertIncludes(routeFile, "router.post('/estimates/:bidId/convert'");
assertIncludes(routeFile, "router.post('/invoices/:invoiceId/sync'");
assertIncludes(routeFile, "router.post('/invoices/:invoiceId/status'");
assertIncludes(indexFile, "app.use('/api/invoice-engine'");

console.log('Invoice engine route static checks passed');
