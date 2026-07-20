const fs = require('fs');

const bidBuilder = fs.readFileSync('platform/client/src/pages/BidBuilder.jsx', 'utf8');
const invoices = fs.readFileSync('platform/client/src/pages/Invoices.jsx', 'utf8');

function contains(content, text, file) {
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}

contains(bidBuilder, 'Create InvoiceShelf Estimate', 'BidBuilder.jsx');
contains(bidBuilder, '/api/invoice-engine/bids/', 'BidBuilder.jsx');
contains(invoices, 'Sync InvoiceShelf Status', 'Invoices.jsx');
contains(invoices, 'Open Client View', 'Invoices.jsx');
contains(invoices, 'invoiceshelf_public_url', 'Invoices.jsx');

console.log('InvoiceShelf UI static checks passed');
