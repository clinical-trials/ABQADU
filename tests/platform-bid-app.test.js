const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'platform.html'), 'utf8');
const siteHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

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
contains('customer call to site visit within 24 hours');
contains('Customer call, 24-hour site visit');
contains('Above typical 750 sf homeowner ADU planning max');
contains('Typical homeowner max ADU');
contains('Extra electric meter / panel allowance — low range');
contains('Ian internal: sewer confirmation study');
contains('Homeowner Utility Summary');
contains('Sewer confirmation study: verify the ADU toilet and drainage will work properly');
contains('const cityPermitDraw=Math.round(t.total*.5*100)/100;');
contains('Pre-construction contract + city permitting deposit');
contains('City permitting complete / construction start draw — 50% of total bid');
contains('Progress draw — remaining construction balance');
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
contains('id="bid-confidence-grade"');
contains('id="bid-readiness-flags"');
contains('const CONFIDENCE_GRADES =');
contains('function bidReadinessSignals(t)');
contains('function renderBidConfidence(t)');
contains('function toggleReadinessFlag(flag,checked)');
contains('Bid confidence');
contains('ready to send');
contains('needs utility review');
contains('needs engineering');
contains('missing site data');
contains('id="bid-quiz-card"');
contains('id="bid-quiz-answer"');
contains('id="bid-quiz-action"');
contains('function goBidQuizStep(delta)');
contains('function runBidQuizAction()');
contains('function bidQuizCompletion(step,t)');
contains('actionLabel:\'Add COGS line\'');
contains('Bid calculator quiz');
contains('class="invoice-blueprint"');
contains('id="invoice-blueprint-label"');

function siteContains(snippet) {
  assert(
    siteHtml.includes(snippet),
    `Expected index.html to contain: ${snippet}`
  );
}

siteContains('Answer simple questions. See the ADU take shape.');
siteContains('Which ADU feels right for your backyard?');
siteContains('What should it look like from the outside?');
siteContains('Who is this ADU for, and how should it feel inside?');
siteContains('Where should we send your ADU concept?');
siteContains('site visit within 24 hours of your call');
siteContains('ABQ ADU targets a site visit within 24 hours of the customer call');
siteContains('750 sq ft is treated as the typical maximum planning size');
siteContains('Typical Homeowner Max — 3 variants');
siteContains('larger custom review path above typical 750 sf homeowner max');
siteContains('Sewer confirmation study');
siteContains('We confirm the ADU toilet and drainage will work properly');
siteContains('Extra meter low range');
siteContains('Netherwood House');
contains('Netherwood House');
assert(!siteHtml.toLowerCase().includes('macerator'), 'Expected homeowner-facing page to avoid macerator language');
assert(!siteHtml.toLowerCase().includes('masticator'), 'Expected homeowner-facing page to avoid masticator language');
assert(!siteHtml.includes('Hyder Hut'), 'Expected index.html visible copy to use Netherwood House instead of Hyder Hut');
assert(!html.includes('Hyder Hut'), 'Expected platform.html visible copy to use Netherwood House instead of Hyder Hut');
