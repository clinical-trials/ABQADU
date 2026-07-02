const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'platform.html'), 'utf8');

function contains(snippet) {
  assert(
    html.includes(snippet),
    `Expected platform.html to contain: ${snippet}`
  );
}

contains('class="bid-app-shell no-print"');
contains('id="app-project-title"');
contains('onclick="newProjectFolder()"');
contains('onclick="saveBidDraft()"');
contains('onclick="acceptBid()"');
contains('onclick="printBidsAndInvoicing()"');
contains('data-flow-step="setup"');
contains('function renderBidAppShell(t)');
contains('renderBidAppShell(t)');
contains('id="quick-cogs-form"');
contains('id="quick-cogs-desc"');
contains('id="quick-cogs-cost"');
contains('function addQuickCogsLine()');
contains('function addCogsBundle(key)');
contains('const COGS_BUNDLES =');
contains('onclick="addCogsBundle(\'dryIn\')"');
contains('id="bid-print-document"');
contains('function buildBidPrintDocument()');
contains('function renderBidPrintDocument()');
contains('function exportBidJson()');
contains('function exportBidCsv()');
contains('onclick="exportBidJson()"');
contains('onclick="exportBidCsv()"');
contains('body.print-bid-summary #tab-bids > :not(#bid-print-document)');
contains('id="export-fallback"');
contains('function showExportFallback(name,content)');
contains('function copyExportFallback()');
