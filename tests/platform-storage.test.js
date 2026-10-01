const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM, VirtualConsole } = require('../platform/client/node_modules/jsdom');

const html = fs.readFileSync(path.join(__dirname, '../platform.html'), 'utf8');

function openBuilder(t, { entries = {}, storageFailure, hash = '' } = {}) {
  const errors = [];
  const downloads = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: `https://builder.example/platform.html${hash}`,
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value);
      if (storageFailure === 'denied') {
        Object.defineProperty(window, 'localStorage', {
          get() { throw new window.DOMException('Storage denied', 'SecurityError'); },
        });
      } else if (storageFailure === 'quota') {
        window.Storage.prototype.setItem = () => {
          throw new window.DOMException('Storage full', 'QuotaExceededError');
        };
      }
      window.URL.createObjectURL = blob => {
        downloads.push(blob);
        return 'blob:https://builder.example/test-download';
      };
      window.URL.revokeObjectURL = () => {};
      // Downloads are captured above; suppress jsdom's unsupported navigation.
      window.HTMLAnchorElement.prototype.click = function () {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
    },
  });
  t.after(() => dom.window.close());
  return { window: dom.window, document: dom.window.document, errors, downloads };
}

function checkWorkingBuilder(page) {
  assert.deepEqual(page.errors, [], 'Builder boot and tab interactions must not throw');
  assert.equal(page.document.querySelector('#estimate-total').textContent, '$13,800.00');
  for (const tab of page.document.querySelectorAll('.tabs [data-tab]')) {
    tab.click();
    assert.equal(page.document.querySelector('.panel.active').id, `tab-${tab.dataset.tab}`);
  }
  assert.deepEqual(page.errors, [], 'Every public tab must render when storage fails');
}

function readBlob(window, blob) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

test('legacy new bids start at 60 percent overhead and profit while historical missing rates stay at 18 percent', t => {
  const fresh = openBuilder(t, { hash:'#bids' });
  assert.equal(fresh.document.getElementById('t-markup').value, '60');
  assert.equal(JSON.parse(fresh.window.localStorage.getItem('abqadu_bid')).markup_pct, 60);
  const oldBid = {title:'Example legacy job',items:[{cat:'General',desc:'Example cost',qty:1,unit:'ea',cost:100}]};
  const legacy = openBuilder(t, { entries:{abqadu_bid:JSON.stringify(oldBid)},hash:'#bids' });
  assert.equal(legacy.document.getElementById('t-markup').value, '18');
  assert.equal(legacy.document.getElementById('t-cont').value, '5');
  assert.equal(legacy.document.getElementById('t-tax').value, '7.625');
  assert.equal(legacy.window.bidTotals().total, 123 * 1.07625);
  legacy.window.newProjectFolder();
  assert.equal(legacy.document.getElementById('t-markup').value, '60');
  assert.deepEqual(fresh.errors, []);
  assert.deepEqual(legacy.errors, []);
});

test('legacy 60 and 100 percent markup price cost at 1.6 and 2 times without changing invoice amounts', t => {
  const project = {id:'pricing-example',bid:{title:'Example job',markup_pct:18,contingency_pct:0,tax_pct:0,items:[{cat:'General',desc:'Example cost',qty:1,unit:'ea',cost:100000}]},invoices:[
    {num:'EXAMPLE-1',amount:10000,paid:0,desc:'Preconstruction deposit',status:'draft'},
    {num:'EXAMPLE-2',amount:12000,paid:0,desc:'Existing draw',status:'draft'},
  ]};
  const { window, document, errors } = openBuilder(t, { entries:{abqadu_projects:JSON.stringify([project])},hash:'#bids' });
  assert.equal(window.bidTotals().total, 118000);
  const totals = [];
  for (const percentage of [60, 100]) {
    document.getElementById('t-markup').value = String(percentage);
    document.getElementById('t-markup').dispatchEvent(new window.Event('input', { bubbles:true }));
    totals.push(window.bidTotals().total);
    const saved = JSON.parse(window.localStorage.getItem('abqadu_projects'))[0];
    assert.equal(saved.bid.markup_pct, percentage);
    assert.deepEqual(saved.invoices.map(invoice => invoice.amount), [10000,12000]);
  }
  assert.deepEqual(totals, [160000,200000]);
  assert.match(document.getElementById('bid-markup-help').textContent, /100%.*2.*cost/i);
  assert.match(document.getElementById('bid-markup-help').textContent, /before contingency and tax/i);
  assert.deepEqual(errors, []);
});

test('legacy pricing rates persist per project through switching, reload and revision and preserve explicit zero', t => {
  const items = [{cat:'General',desc:'Example cost',qty:1,unit:'ea',cost:100}];
  const projects = [
    {id:'rate-a',bid:{title:'Example A',markup_pct:60,contingency_pct:3,tax_pct:7,items},invoices:[]},
    {id:'rate-b',bid:{title:'Example B',markup_pct:0,contingency_pct:0,tax_pct:0,items},invoices:[]},
  ];
  const page = openBuilder(t, { entries:{abqadu_projects:JSON.stringify(projects)},hash:'#bids' });
  const { window, document } = page;
  for (const [id,value] of [['t-markup','100'],['t-cont','2'],['t-tax','8']]) {
    document.getElementById(id).value = value;
    document.getElementById(id).dispatchEvent(new window.Event('input', { bubbles:true }));
  }
  const expected = window.bidTotals().total;
  window.switchProject('rate-b');
  assert.equal(document.getElementById('t-markup').value, '0');
  assert.equal(document.getElementById('t-cont').value, '0');
  assert.equal(document.getElementById('t-tax').value, '0');
  assert.equal(window.bidTotals().total, 100);
  window.switchProject('rate-a');
  assert.equal(window.bidTotals().total, expected);
  window.duplicateProjectFolder();
  assert.equal(document.getElementById('t-markup').value, '100');
  assert.equal(document.getElementById('t-cont').value, '2');
  assert.equal(document.getElementById('t-tax').value, '8');
  const entries = Object.fromEntries(Object.keys(window.localStorage).map(key => [key,window.localStorage.getItem(key)]));
  const reloaded = openBuilder(t, { entries,hash:'#bids' });
  assert.equal(reloaded.window.bidTotals().total, expected);
  assert.equal(reloaded.document.getElementById('t-markup').value, '100');
  reloaded.window.newProjectFolder();
  assert.equal(reloaded.document.getElementById('t-markup').value, '60');
  assert.equal(reloaded.document.getElementById('t-cont').value, '5');
  assert.equal(reloaded.document.getElementById('t-tax').value, '7.625');
  assert.deepEqual(page.errors, []);
  assert.deepEqual(reloaded.errors, []);
});

test('legacy benchmark keeps its explicit 74.1 percent markup after reload', t => {
  const page = openBuilder(t, { hash:'#bids' });
  page.window.loadAmherstAlturaBenchmark();
  assert.equal(page.document.getElementById('t-markup').value, '74.1');
  assert.equal(JSON.parse(page.window.localStorage.getItem('abqadu_bid')).markup_pct, 74.1);
  const expected = page.window.bidTotals().total;
  const entries = Object.fromEntries(Object.keys(page.window.localStorage).map(key => [key,page.window.localStorage.getItem(key)]));
  const reloaded = openBuilder(t, { entries,hash:'#bids' });
  assert.equal(reloaded.document.getElementById('t-markup').value, '74.1');
  assert.equal(reloaded.window.bidTotals().total, expected);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(reloaded.errors, []);
});

test('legacy client target budgets are optional planning text on old drafts and leave amounts unchanged', t => {
  const { window, document, errors } = openBuilder(t, { hash:'#estimates' });
  const estimateBudget = document.getElementById('estimate-client-target-budget');
  const bidBudget = document.getElementById('bid-client-target-budget');
  assert.ok(estimateBudget);
  assert.ok(bidBudget);
  for (const input of [estimateBudget, bidBudget]) {
    assert.equal(input.type, 'text');
    assert.equal(input.maxLength, 200);
    assert.equal(input.value, '');
  }
  assert.match(document.getElementById('estimate-target-budget-summary').textContent, /not provided/i);
  assert.match(document.getElementById('bid-invoice-target-budget').textContent, /not provided/i);
  const estimateTotal = document.getElementById('estimate-total').textContent;
  const bidTotal = document.getElementById('t-total').textContent;
  window.saveEstimateDraft(); window.saveBidDraft();
  assert.equal(JSON.parse(window.localStorage.getItem('abqadu_estimateV9')).clientTargetBudget, '');
  assert.equal(JSON.parse(window.localStorage.getItem('abqadu_bid')).client_target_budget, '');
  assert.equal(document.getElementById('estimate-total').textContent, estimateTotal);
  assert.equal(document.getElementById('t-total').textContent, bidTotal);
  assert.deepEqual(errors, []);
});

test('legacy whitespace-only target budgets stay unknown in summaries and documents while preserving raw drafts', async t => {
  const { window, document, downloads, errors } = openBuilder(t, { hash:'#estimates' });
  const estimateBudget = document.getElementById('estimate-client-target-budget');
  const bidBudget = document.getElementById('bid-client-target-budget');
  estimateBudget.value = '   ';
  bidBudget.value = '   ';
  window.saveEstimateDraft();
  bidBudget.dispatchEvent(new window.Event('input', { bubbles:true }));
  assert.match(document.getElementById('estimate-target-budget-summary').textContent, /not provided/i);
  assert.match(document.getElementById('bid-invoice-target-budget').textContent, /not provided/i);
  assert.equal(JSON.parse(window.localStorage.getItem('abqadu_estimateV9')).clientTargetBudget, '   ');
  assert.equal(JSON.parse(window.localStorage.getItem('abqadu_bid')).client_target_budget, '   ');
  assert.doesNotMatch(window.buildEstimateInvoiceDocument(), /Client target budget/);
  assert.doesNotMatch(window.buildBidPrintDocument(), /Client target budget/);
  window.exportBidCsv();
  assert.doesNotMatch(await readBlob(window, downloads[0]), /Client target budget/);
  assert.deepEqual(errors, []);
});

test('legacy estimate target range survives invoice conversion, print and reload without repricing', t => {
  const page = openBuilder(t, { hash:'#estimates' });
  const { window, document } = page;
  const input = document.getElementById('estimate-client-target-budget');
  assert.ok(input);
  const target = '$180,000–$220,000 including utilities <img src=x onerror="window.injected=true">';
  const linesBefore = JSON.parse(window.localStorage.getItem('abqadu_estimateV9')).lines;
  const totalBefore = document.getElementById('estimate-total').textContent;
  input.value = target;
  input.dispatchEvent(new window.Event('change', { bubbles:true }));
  window.convertEstimateToInvoice();
  assert.equal(document.getElementById('estimate-side-type').textContent, 'Invoice');
  assert.equal(input.value, target);
  assert.match(document.getElementById('estimate-target-budget-summary').textContent, /Client target budget \(planning only\)/);
  assert.ok(document.getElementById('estimate-target-budget-summary').textContent.includes(target));
  assert.equal(document.getElementById('estimate-target-budget-summary').querySelector('img'), null);
  const printed = JSDOM.fragment(window.buildEstimateInvoiceDocument());
  assert.ok(printed.textContent.includes(`Client target budget (planning only): ${target}`));
  assert.equal(printed.querySelector('[onerror]'), null);
  const saved = JSON.parse(window.localStorage.getItem('abqadu_estimateV9'));
  assert.equal(saved.clientTargetBudget, target);
  assert.deepEqual(saved.lines, linesBefore);
  const reloaded = openBuilder(t, { entries:{abqadu_estimateV9:JSON.stringify(saved)},hash:'#estimates' });
  assert.equal(reloaded.document.getElementById('estimate-client-target-budget').value, target);
  assert.equal(reloaded.document.getElementById('estimate-side-type').textContent, 'Invoice');
  assert.equal(reloaded.document.getElementById('estimate-total').textContent, totalBefore);
  assert.equal(window.injected, undefined);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(reloaded.errors, []);
});

test('legacy bid target budget remains separate from costs and follows saved project and revision', async t => {
  const page = openBuilder(t, { hash:'#bids' });
  const { window, document, downloads } = page;
  const input = document.getElementById('bid-client-target-budget');
  assert.ok(input);
  const totalBefore = document.getElementById('t-total').textContent;
  const beforeBid = JSON.parse(window.localStorage.getItem('abqadu_bid'));
  const target = '$180,000–$220,000 including utilities';
  input.value = target;
  input.dispatchEvent(new window.Event('input', { bubbles:true }));
  window.saveBidDraft();
  assert.ok(document.getElementById('bid-invoice-target-budget').textContent.includes(target));
  assert.equal(document.getElementById('t-total').textContent, totalBefore);
  window.exportBidJson(); window.exportBidCsv();
  const exported = JSON.parse(await readBlob(window, downloads[0]));
  assert.equal(exported.project.client_target_budget, target);
  assert.deepEqual(exported.cogs, beforeBid.items);
  assert.match(await readBlob(window, downloads[1]), /Client target budget \(planning only\)/);
  assert.ok(JSDOM.fragment(window.buildBidPrintDocument()).textContent.includes(target));
  const entries = Object.fromEntries(Object.keys(window.localStorage).map(key => [key, window.localStorage.getItem(key)]));
  const reloaded = openBuilder(t, { entries, hash:'#bids' });
  assert.equal(reloaded.document.getElementById('bid-client-target-budget').value, target);
  window.duplicateProjectFolder();
  assert.equal(input.value, target);
  window.newProjectFolder();
  assert.equal(input.value, '');
  assert.match(document.getElementById('bid-invoice-target-budget').textContent, /not provided/i);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(reloaded.errors, []);
});

test('legacy target budget drafts remain recoverable when browser storage is full', async t => {
  const { window, document, downloads, errors } = openBuilder(t, { storageFailure:'quota',hash:'#estimates' });
  const estimateBudget = document.getElementById('estimate-client-target-budget');
  const bidBudget = document.getElementById('bid-client-target-budget');
  assert.ok(estimateBudget);
  assert.ok(bidBudget);
  estimateBudget.value = '$190,000 including site work';
  bidBudget.value = 'Under $210,000; scope to review';
  window.saveEstimateDraft(); window.saveBidDraft();
  assert.match(document.getElementById('bid-save-status').textContent, /only.*page/i);
  window.downloadPageBackup();
  const backup = JSON.parse(await readBlob(window, downloads[0]));
  assert.equal(backup.drafts.estimateV9.clientTargetBudget, estimateBudget.value);
  assert.equal(backup.drafts.bid.client_target_budget, bidBudget.value);
  assert.deepEqual(errors, []);
});

test('legacy internal bid notes autosave literal text without rebuilding the editor or moving the caret', t => {
  const page = openBuilder(t, { hash:'#bids' });
  const { window, document } = page;
  const notes = document.getElementById('bid-internal-notes');
  assert.ok(notes, 'The bid tool needs an internal notes field');
  assert.equal(notes.value, '', 'Old drafts start with no notes');
  assert.equal(notes.rows, 5);
  assert.equal(notes.maxLength, 5000);
  assert.equal(document.querySelector('label[for="bid-internal-notes"]').textContent, 'Internal team notes');
  assert.ok(notes.closest('.no-print'), 'Internal notes stay out of whole-page printing');
  const firstCostRow = document.querySelector('#bid-items tr');
  notes.value = 'Confirm access window.\n<img src=x onerror="window.injected=true">';
  notes.focus();
  notes.setSelectionRange(8, 8);
  notes.dispatchEvent(new window.Event('input', { bubbles:true }));
  assert.equal(document.activeElement, notes);
  assert.equal(notes.selectionStart, 8);
  assert.equal(document.querySelector('#bid-items tr'), firstCostRow, 'Typing cannot rebuild the bid');
  assert.equal(window.injected, undefined);
  assert.equal(JSON.parse(window.localStorage.getItem('abqadu_bid')).internal_notes, notes.value);
  assert.match(document.getElementById('bid-save-status').textContent, /saved locally/i);
  const entries = Object.fromEntries(Object.keys(window.localStorage).map(key => [key, window.localStorage.getItem(key)]));
  const reloaded = openBuilder(t, { entries, hash:'#bids' });
  assert.equal(reloaded.document.getElementById('bid-internal-notes').value, notes.value);
  assert.equal(reloaded.window.injected, undefined);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(reloaded.errors, []);
});

test('legacy internal bid notes stay with their project and copy only into an explicit revision', t => {
  const projects = [
    {id:'example-a',bid:{title:'Example A',internal_notes:'Review access for A.',items:[]},invoices:[]},
    {id:'example-b',bid:{title:'Example B',internal_notes:'Review access for B.',items:[]},invoices:[]},
  ];
  const { window, document, errors } = openBuilder(t, { entries:{abqadu_projects:JSON.stringify(projects)}, hash:'#bids' });
  const notes = document.getElementById('bid-internal-notes');
  assert.ok(notes);
  assert.equal(notes.value, 'Review access for A.');
  notes.value = 'Updated A notes.';
  notes.dispatchEvent(new window.Event('input', { bubbles:true }));
  window.switchProject('example-b');
  assert.equal(notes.value, 'Review access for B.');
  window.switchProject('example-a');
  assert.equal(notes.value, 'Updated A notes.');
  window.duplicateProjectFolder();
  assert.equal(notes.value, 'Updated A notes.');
  notes.value = 'Revision notes only.';
  window.saveBidDraft();
  window.switchProject('example-a');
  assert.equal(notes.value, 'Updated A notes.');
  window.newProjectFolder();
  assert.equal(notes.value, '', 'A new homeowner cannot inherit another project’s notes');
  assert.equal(JSON.parse(window.localStorage.getItem('abqadu_bid')).internal_notes, '');
  assert.deepEqual(errors, []);
});

test('legacy internal bid notes are excluded from client documents and exports but included in recovery backups', async t => {
  const { window, document, downloads, errors } = openBuilder(t, { hash:'#bids' });
  const notes = document.getElementById('bid-internal-notes');
  assert.ok(notes);
  notes.value = 'INTERNAL EXAMPLE: Confirm crew access before scheduling.';
  window.saveBidDraft();
  assert.ok(!window.buildBidPrintDocument().includes(notes.value));
  assert.ok(!window.buildEstimateInvoiceDocument().includes(notes.value));
  window.exportBidCsv();
  window.exportBidJson();
  for (const blob of downloads) {
    const exported = await readBlob(window, blob);
    assert.ok(!exported.includes(notes.value));
    assert.ok(!exported.includes('internal_notes'));
  }
  window.downloadPageBackup();
  const backup = JSON.parse(await readBlob(window, downloads.at(-1)));
  assert.equal(backup.drafts.bid.internal_notes, notes.value);
  assert.equal(backup.drafts.projects[0].bid.internal_notes, notes.value);
  assert.deepEqual(errors, []);
});

test('legacy storage failure keeps current internal notes editable and recoverable without a saved claim', async t => {
  const original = JSON.stringify({title:'Example bid',items:[],internal_notes:'Earlier notes.'});
  const { window, document, downloads, errors } = openBuilder(t, { entries:{abqadu_bid:original},storageFailure:'quota',hash:'#bids' });
  const notes = document.getElementById('bid-internal-notes');
  assert.ok(notes);
  assert.equal(notes.value, 'Earlier notes.');
  notes.value = 'Current unsaved notes.';
  notes.dispatchEvent(new window.Event('input', { bubbles:true }));
  assert.equal(notes.value, 'Current unsaved notes.');
  assert.equal(window.localStorage.getItem('abqadu_bid'), original);
  assert.match(document.getElementById('bid-save-status').textContent, /only.*page/i);
  assert.doesNotMatch(document.getElementById('bid-save-status').textContent, /notes saved/i);
  window.downloadPageBackup();
  const backup = JSON.parse(await readBlob(window, downloads[0]));
  assert.equal(backup.drafts.bid.internal_notes, notes.value);
  assert.equal(backup.originalBrowserData.bid, original);
  assert.deepEqual(errors, []);
});

test('legacy bids can keep Other / not yet selected through save, reload and export without changing costs', async t => {
  const originalBid = {title:'Example custom ADU',client:'Example homeowner',address:'123 Example Lane',model:'Altura',sqft:615,status:'draft',readinessFlags:[],items:[{cat:'Interior',desc:'Finish carpentry',kind:'base',qty:3,unit:'ea',cost:1234}]};
  const page = openBuilder(t, { entries: { abqadu_bid: JSON.stringify(originalBid) }, hash:'#bids' });
  const { window, document } = page;
  const model = document.getElementById('bid-model');
  assert.equal(model.value, 'Altura', 'Existing selected models must not be migrated');
  const beforeTotal = document.getElementById('app-bid-total').textContent;
  model.value = 'Other / not yet selected';
  model.dispatchEvent(new window.Event('input', { bubbles:true }));
  assert.equal(model.value, 'Other / not yet selected');
  window.saveBidDraft();
  assert.equal(document.getElementById('bid-sqft').value, '615');
  assert.equal(document.getElementById('app-bid-total').textContent, beforeTotal);
  window.exportBidJson();
  const exported = JSON.parse(await readBlob(window, page.downloads[0]));
  assert.equal(exported.project.model, 'Other / not yet selected');
  assert.equal(exported.project.sqft, 615);
  assert.deepEqual(exported.cogs, originalBid.items);
  const entries = Object.fromEntries(Object.keys(window.localStorage).map(key => [key, window.localStorage.getItem(key)]));
  const reloaded = openBuilder(t, { entries, hash:'#bids' });
  assert.equal(reloaded.document.getElementById('bid-model').value, 'Other / not yet selected');
  assert.equal(reloaded.document.getElementById('bid-sqft').value, '615');
  assert.equal(reloaded.document.getElementById('app-bid-total').textContent, beforeTotal);
  assert.match(reloaded.window.buildBidPrintDocument(), /Other \/ not yet selected/);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(reloaded.errors, []);
});

test('legacy undecided model stays incomplete in bid readiness, quiz and project setup', t => {
  const fixture = {title:'Example ADU',client:'Example homeowner',address:'123 Example Lane',model:'Other / not yet selected',sqft:615,status:'draft',readinessFlags:['ready to send'],items:[{cat:'Interior',desc:'Finish carpentry',kind:'base',qty:1,unit:'ea',cost:500}]};
  const { window, document, errors } = openBuilder(t, { entries:{abqadu_bid:JSON.stringify(fixture)}, hash:'#bids' });
  const flags = window.bidReadinessSignals(window.bidTotals());
  assert.ok(flags.includes('missing site data'));
  assert.ok(!flags.includes('ready to send'));
  assert.doesNotMatch(document.getElementById('bid-readiness-summary').textContent, /ready to send/i);
  assert.equal(document.querySelector('[data-flow-step="site"]').classList.contains('done'), false);
  assert.equal(document.getElementById('bid-quiz-answer').classList.contains('done'), false);
  assert.match(document.getElementById('app-project-meta').textContent, /next: Finish setup/);
  assert.deepEqual(errors, []);
});

test('legacy estimate preserves an undecided model and manual scope through reload and print', t => {
  const fixture = {client:'Example homeowner',phone:'5055550199',address:'123 Example Lane',model:'Cromwell',sqft:612,lines:[{section:'Site',description:'Manual allowance',qty:2,unitPrice:4321,taxable:false}],activity:[]};
  const page = openBuilder(t, { entries:{abqadu_estimateV9:JSON.stringify(fixture)}, hash:'#estimates' });
  const { window, document } = page;
  const model = document.getElementById('estimate-model');
  assert.equal(model.value, 'Cromwell');
  const beforeTotal = document.getElementById('estimate-total').textContent;
  model.value = 'Other / not yet selected';
  model.dispatchEvent(new window.Event('change', { bubbles:true }));
  assert.equal(model.value, 'Other / not yet selected');
  const saved = JSON.parse(window.localStorage.getItem('abqadu_estimateV9'));
  assert.equal(saved.model, 'Other / not yet selected');
  assert.equal(saved.sqft, 612);
  assert.deepEqual(saved.lines, fixture.lines);
  assert.equal(document.querySelector('[data-estimate-step="scope"]').classList.contains('done'), false);
  assert.equal(document.getElementById('estimate-total').textContent, beforeTotal);
  assert.match(window.buildEstimateInvoiceDocument(), /Other \/ not yet selected/);
  const reloaded = openBuilder(t, { entries:{abqadu_estimateV9:JSON.stringify(saved)}, hash:'#estimates' });
  assert.equal(reloaded.document.getElementById('estimate-model').value, 'Other / not yet selected');
  assert.equal(reloaded.document.getElementById('estimate-sqft').value, '612');
  assert.equal(reloaded.document.getElementById('estimate-total').textContent, beforeTotal);
  assert.equal(reloaded.document.querySelector('[data-estimate-step="scope"]').classList.contains('done'), false);
  assert.deepEqual(page.errors, []);
  assert.deepEqual(reloaded.errors, []);
});

test('legacy house-to-ADU comparison is arithmetic only and preserves optional area with the estimate draft', t => {
  const page = openBuilder(t, { hash: '#estimates' });
  const { window, document } = page;
  const house = document.getElementById('estimate-primary-home-sqft');
  const adu = document.getElementById('estimate-sqft');
  const comparison = document.getElementById('estimate-area-comparison');
  assert.ok(house);
  assert.equal(house.value, '');
  assert.match(comparison.textContent, /unknown/i);
  house.value = '1500'; adu.value = '750';
  house.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.match(comparison.textContent, /House:ADU 2:1/);
  assert.match(comparison.textContent, /50%/);
  assert.match(comparison.textContent, /comparison only/i);
  assert.doesNotMatch(comparison.textContent, /approved|eligible|passes|meets.*requirements/i);
  document.getElementById('estimate-address').value = '123 Example Property';
  document.getElementById('estimate-gis-prepare').click();
  assert.match(document.getElementById('estimate-gis-summary').value, /Primary house gross floor area: 1500 sq ft/);
  adu.value = '900';
  adu.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(document.getElementById('estimate-gis-result').hidden, true, 'Changed areas invalidate the prepared handoff');
  assert.match(comparison.textContent, /1\.67:1/);
  window.saveEstimateDraft();
  const saved = JSON.parse(window.localStorage.getItem('abqadu_estimateV9'));
  assert.equal(saved.primaryHomeSqft, '1500');
  const reloaded = openBuilder(t, { entries: { abqadu_estimateV9: JSON.stringify(saved) }, hash: '#estimates' });
  assert.equal(reloaded.document.getElementById('estimate-primary-home-sqft').value, '1500');
  assert.equal(reloaded.document.getElementById('estimate-sqft').value, '900');
  house.value = ''; house.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.match(comparison.textContent, /unknown/i);
  window.saveEstimateDraft();
  assert.equal(JSON.parse(window.localStorage.getItem('abqadu_estimateV9')).primaryHomeSqft, '');
  house.value = '-5'; house.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.match(comparison.textContent, /positive/i);
  assert.doesNotMatch(comparison.textContent, /NaN|Infinity|House:ADU/);
  assert.deepEqual(page.errors, []);
});

test('legacy GIS handoff uses current input, keeps drafts intact, and invalidates changed addresses', async t => {
  const page = openBuilder(t, { hash: '#estimates' });
  const { window, document } = page;
  window.fetch = () => assert.fail('Preparing GIS must not send or geocode the intake');
  const stored = window.localStorage.getItem('abqadu_estimateV9');
  const priorities = [...document.querySelectorAll('[data-estimate-utility-review]')];
  assert.equal(priorities.length, 3);
  assert.deepEqual(priorities.map(card => card.dataset.estimateUtilityReview), ['water', 'electric', 'sewer']);
  assert.ok(priorities.every(card => /unknown/i.test(card.textContent) && card.querySelector('input,select,textarea') === null));
  assert.equal(document.getElementById('estimate-gis-workspace').href, document.getElementById('saved-workspace-link').href);
  const address = document.getElementById('estimate-address');
  address.value = '<img src=x onerror="window.injected=true"> 123 Current & First';
  document.getElementById('estimate-gis-prepare').click();
  const result = document.getElementById('estimate-gis-result');
  const summary = document.getElementById('estimate-gis-summary');
  assert.equal(result.hidden, false);
  assert.ok(summary.value.includes(`Intake address: ${address.value}`));
  assert.match(summary.value, /pending[\s\S]*not been sent/i);
  assert.match(summary.value, /Water — unknown:[\s\S]*Electric — unknown:[\s\S]*Sewer — unknown:/);
  assert.ok(summary.value.indexOf('Water — unknown:') < summary.value.indexOf('Approximate yard dimensions'));
  assert.equal(new URL(document.getElementById('estimate-gis-zoning').href).searchParams.get('find'), address.value);
  assert.equal(result.querySelector('img,script,[onerror]'), null);
  assert.equal(window.injected, undefined);
  assert.equal(window.localStorage.getItem('abqadu_estimateV9'), stored, 'GIS preparation cannot persist or replace a legacy draft');
  document.getElementById('estimate-gis-copy').click();
  await Promise.resolve();
  assert.equal(document.activeElement, summary);
  assert.equal(summary.selectionEnd, summary.value.length);
  assert.match(document.getElementById('estimate-gis-status').textContent, /select|copy/i);
  address.value = '456 Replacement Road';
  address.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(result.hidden, true);
  document.getElementById('estimate-gis-prepare').click();
  assert.ok(summary.value.includes(address.value));
  assert.ok(!summary.value.includes('123 Current'));
  assert.doesNotMatch(summary.value, /(?:Water|Electric|Sewer) — confirmed/);
  // Even a programmatic change without an input event must not copy the old address.
  address.value = '789 Last Road';
  const copied = [];
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => copied.push(text) } });
  document.getElementById('estimate-gis-copy').click();
  await Promise.resolve();
  assert.deepEqual(copied, []);
  assert.equal(result.hidden, true);
  document.getElementById('estimate-gis-prepare').click();
  document.getElementById('estimate-gis-copy-address').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(copied, ['789 Last Road']);
  assert.match(document.getElementById('estimate-gis-status').textContent, /address copied/i);
  address.value = '890 Changed Without Event';
  const openMap = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  document.getElementById('estimate-gis-zoning').dispatchEvent(openMap);
  assert.equal(openMap.defaultPrevented, true, 'Stale map links cannot open the previous address');
  assert.equal(result.hidden, true);
  address.value = '';
  document.getElementById('estimate-gis-prepare').click();
  assert.equal(result.hidden, true);
  assert.match(document.getElementById('estimate-gis-status').textContent, /address needed.*no GIS.*prepared/i);
  assert.deepEqual(page.errors, []);
});

test('late copy completion cannot label a newly prepared floor-area handoff as copied', async t => {
  const { window, document } = openBuilder(t, { hash: '#estimates' });
  document.getElementById('estimate-address').value = '123 Example Property';
  document.getElementById('estimate-gis-prepare').click();
  let finishCopy;
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: () => new Promise(resolve => { finishCopy = resolve; }) } });
  document.getElementById('estimate-gis-copy').click();
  const adu = document.getElementById('estimate-sqft');
  adu.value = '750'; adu.dispatchEvent(new window.Event('input', { bubbles: true }));
  document.getElementById('estimate-gis-prepare').click();
  finishCopy();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(document.getElementById('estimate-gis-summary').value, /Proposed ADU gross floor area: 750 sq ft/);
  assert.equal(document.getElementById('estimate-gis-status').textContent, 'Review handoff prepared. It has not been sent.');
});

test('invalid saved activity dates cannot stop builder startup or overwrite the original', t => {
  const original = JSON.stringify({client:'Existing client',lines:[],activity:[{type:'Created',at:12}]});
  const page = openBuilder(t, {entries:{'abqadu_estimateV9':original}});
  checkWorkingBuilder(page);
  assert.equal(page.window.localStorage.getItem('abqadu_estimateV9'), original);
  assert.equal(page.document.querySelector('#storage-warning').hidden, false);
});

test('backup from the bids tab preserves an estimate whose form has never rendered', async t => {
  const estimate = {client:'Previously saved homeowner',email:'saved@example.com',address:'Saved address',lines:[],activity:[]};
  const original = JSON.stringify(estimate);
  const page = openBuilder(t, {entries:{'abqadu_estimateV9':original},storageFailure:'quota',hash:'#bids'});
  page.document.querySelector('#storage-warning button').click();
  const backup = JSON.parse(await readBlob(page.window, page.downloads[0]));
  assert.equal(backup.drafts.estimateV9.client, estimate.client);
  assert.equal(backup.drafts.estimateV9.email, estimate.email);
  assert.equal(backup.drafts.estimateV9.address, estimate.address);
  assert.equal(page.window.localStorage.getItem('abqadu_estimateV9'), original);
  assert.deepEqual(page.errors, []);
});

for (const key of ['projects', 'invoices']) {
  test(`invalid invoice text in ${key} cannot crash startup and is preserved`, t => {
    const invoices = [{num:'INV-2026-01',amount:10000,paid:0,desc:5,status:'draft'}];
    const original = JSON.stringify(key === 'projects' ? [{id:'p',bid:{title:'Saved',items:[]},invoices}] : invoices);
    const page = openBuilder(t, {entries:{['abqadu_'+key]:original}});
    checkWorkingBuilder(page);
    assert.equal(page.window.localStorage.getItem('abqadu_'+key), original);
    assert.equal(page.document.querySelector('#storage-warning').hidden, false);
  });
}

test('estimate and bid edits survive a normal browser reload', t => {
  const page = openBuilder(t);
  checkWorkingBuilder(page);
  page.document.querySelector('#estimate-client').value = 'Saved homeowner';
  page.window.saveEstimateDraft();
  page.document.querySelector('#bid-client').value = 'Saved bid owner';
  page.window.saveBidDraft();
  const entries = Object.fromEntries(Object.keys(page.window.localStorage).map(key => [key, page.window.localStorage.getItem(key)]));
  const reloaded = openBuilder(t, { entries });
  assert.equal(reloaded.document.querySelector('#estimate-client').value, 'Saved homeowner');
  assert.equal(reloaded.document.querySelector('#bid-client').value, 'Saved bid owner');
  assert.equal(reloaded.document.querySelector('#storage-warning').hidden, true);
  checkWorkingBuilder(reloaded);
});

for (const storageFailure of ['quota', 'denied']) {
  test(`${storageFailure} storage keeps estimates, tabs and draft edits usable without claiming to save`, async t => {
    const page = openBuilder(t, { storageFailure });
    checkWorkingBuilder(page);
    const warning = page.document.querySelector('#storage-warning');
    assert.equal(warning.hidden, false);
    assert.match(warning.textContent, /only.*page/i);
    page.document.querySelector('#estimate-client').value = 'Unsaved homeowner';
    page.window.saveEstimateDraft();
    page.document.querySelector('#bid-client').value = 'Unsaved bid owner';
    page.window.saveBidDraft();
    page.document.querySelector('[data-tab="estimates"]').click();
    assert.equal(page.document.querySelector('#estimate-client').value, 'Unsaved homeowner');
    assert.doesNotMatch(page.document.querySelector('#bid-save-status').textContent, /(?:draft )?saved locally|autosaved/i);
    assert.doesNotMatch(page.document.querySelector('#app-status-pill').textContent, /autosaved/i);
    assert.equal(warning.hidden, false, 'The warning must survive edits and tab changes');
    warning.querySelector('button').click();
    assert.equal(page.downloads.length, 1);
    const backup = JSON.parse(await readBlob(page.window, page.downloads[0]));
    assert.equal(backup.drafts.estimateV9.client, 'Unsaved homeowner');
    assert.equal(backup.drafts.projects[0].bid.client, 'Unsaved bid owner');
    assert.deepEqual(page.errors, []);
  });
}

test('readable saved drafts remain intact when storage becomes full during editing', async t => {
  const page = openBuilder(t);
  page.document.querySelector('#estimate-client').value = 'Previously saved owner';
  page.window.saveEstimateDraft();
  const original = page.window.localStorage.getItem('abqadu_estimateV9');
  page.window.Storage.prototype.setItem = () => {
    throw new page.window.DOMException('Storage full', 'QuotaExceededError');
  };
  page.document.querySelector('#estimate-client').value = 'New unsaved owner';
  page.window.saveEstimateDraft();
  assert.equal(page.window.localStorage.getItem('abqadu_estimateV9'), original);
  assert.equal(page.document.querySelector('#estimate-client').value, 'New unsaved owner');
  assert.equal(page.document.querySelector('#storage-warning').hidden, false);
  assert.doesNotMatch(page.document.querySelector('#app-status-pill').textContent, /autosaved/i);
  const reloaded = openBuilder(t, {
    entries: { abqadu_estimateV9: original },
    storageFailure: 'quota',
  });
  assert.equal(reloaded.document.querySelector('#estimate-client').value, 'Previously saved owner');
  checkWorkingBuilder(reloaded);
  reloaded.document.querySelector('#storage-warning button').click();
  const backup = JSON.parse(await readBlob(reloaded.window, reloaded.downloads[0]));
  assert.equal(backup.originalBrowserData.estimateV9, original);
  assert.deepEqual(page.errors, []);
});

for (const [key, raw] of [
  ['estimateV9', '{broken json'],
  ['estimateV9', JSON.stringify({ lines: [null], activity: [] })],
  ['projects', JSON.stringify([{ id: 'broken', bid: { items: 'broken' } }])],
  ['codeAssessmentsV7', JSON.stringify([null])],
]) {
  test(`malformed ${key} data does not break startup or overwrite the original`, t => {
    const page = openBuilder(t, { entries: { [`abqadu_${key}`]: raw } });
    checkWorkingBuilder(page);
    assert.equal(page.document.querySelector('#storage-warning').hidden, false);
    page.window.saveEstimateDraft();
    page.window.saveBidDraft();
    assert.equal(page.window.localStorage.getItem(`abqadu_${key}`), raw);
    assert.deepEqual(page.errors, []);
  });
}
