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

test('legacy GIS handoff uses current input, keeps drafts intact, and invalidates changed addresses', async t => {
  const page = openBuilder(t, { hash: '#estimates' });
  const { window, document } = page;
  window.fetch = () => assert.fail('Preparing GIS must not send or geocode the intake');
  const stored = window.localStorage.getItem('abqadu_estimateV9');
  const address = document.getElementById('estimate-address');
  address.value = '<img src=x onerror="window.injected=true"> 123 Current & First';
  document.getElementById('estimate-gis-prepare').click();
  const result = document.getElementById('estimate-gis-result');
  const summary = document.getElementById('estimate-gis-summary');
  assert.equal(result.hidden, false);
  assert.ok(summary.value.includes(`Intake address: ${address.value}`));
  assert.match(summary.value, /pending[\s\S]*not been sent/i);
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
