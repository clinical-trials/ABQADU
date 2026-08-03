const fs = require('fs');

const plan = fs.readFileSync('docs/superpowers/plans/2026-07-20-invoiceshelf-back-office-engine.md', 'utf8');

function contains(text) {
  if (!plan.includes(text)) throw new Error(`Expected plan to include: ${text}`);
}

contains('InvoiceShelf is the back-office estimate/invoice engine');
contains('INVOICESHELF_BASE_URL');
contains('invoice_engine_events');
contains('$10,000 Preconstruction Contract');
contains('Keep existing ABQ ADU local PDF/print fallback working');

console.log('InvoiceShelf integration plan guard passed');
