const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('../platform/client/node_modules/jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const draftKey = 'abqadu_homeowner_design_draft';

function openPage(t, { saved, blocked = false, quota = false } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  let readStored;
  const dom = new JSDOM(html, {
    url: 'https://clinical-trials.github.io/ABQADU/index.html',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.HTMLElement.prototype.scrollTo = () => {};
      const storage = window.localStorage;
      const read = window.Storage.prototype.getItem;
      readStored = key => read.call(storage, key);
      if (saved !== undefined) storage.setItem(draftKey, saved);
      storage.setItem('unrelated-project', 'keep me');
      if (blocked) window.Storage.prototype.getItem = () => { throw new window.DOMException('Access denied', 'SecurityError'); };
      if (blocked || quota) {
        window.Storage.prototype.setItem = () => { throw new window.DOMException('Cannot save', quota ? 'QuotaExceededError' : 'SecurityError'); };
        window.Storage.prototype.removeItem = () => { throw new window.DOMException('Cannot delete', 'SecurityError'); };
      }
    },
  });
  t.after(() => {
    dom.window.close();
    assert.deepEqual(errors, [], 'Storage trouble must not crash the wizard');
    assert.equal(readStored('unrelated-project'), 'keep me');
  });
  return { window: dom.window, readStored };
}

function finishConcept(window) {
  window.jumpAduStep(6);
  const form = window.document.querySelector('#design-contact-form');
  form.elements.namedItem('name').value = 'Sam Homeowner';
  form.elements.namedItem('email').value = 'sam@example.com';
  form.querySelector('[type="submit"]').click();
  assert.equal(window.document.querySelector('#design-result-modal').getAttribute('aria-hidden'), 'false');
  assert.equal(window.document.querySelector('#design-modal').getAttribute('aria-hidden'), 'true');
}

test('blocked storage still permits editing, saving, closing and finishing a concept', t => {
  const { window } = openPage(t, { blocked: true });
  window.designSpecificModel('altura-24x24');
  window.saveAduDraft();
  assert.match(window.document.querySelector('#adu-draft-status').textContent, /this tab only/i);
  window.closeAduDesignModal();
  assert.equal(window.document.querySelector('#design-modal').getAttribute('aria-hidden'), 'true');
  window.openAduDesignModal(true);
  assert.equal(window.document.querySelector('#config-model-name').textContent, 'Altura');
  finishConcept(window);
  const warning = window.document.querySelector('#design-draft-status');
  assert.equal(warning.hidden, false);
  assert.match(warning.textContent, /print|share/i);
  assert.equal(window.document.querySelector('#design-send-status').dataset.state, 'manual');
});

test('quota failure preserves the saved draft and restores the latest in-memory design', t => {
  const saved = JSON.stringify({ model: 'altura-24x24', step: 2, savedAt: '2026-09-01', extraNote: 'Keep this data' });
  const { window, readStored } = openPage(t, { saved, quota: true });
  assert.equal(window.document.querySelector('#config-model-name').textContent, 'Altura');
  window.designSpecificModel('series-750');
  window.saveAduDraft();
  assert.equal(readStored(draftKey), saved);
  window.chooseAduOption('model', 'hyder-hut');
  window.openAduDesignModal(true);
  assert.equal(window.document.querySelector('#config-model-name').textContent, '750 Series');
  assert.match(window.document.querySelector('#adu-draft-status').textContent, /this tab only/i);
  window.resetAduDraft();
  assert.equal(window.document.querySelector('#config-model-name').textContent, 'Netherwood House 2BR');
  assert.equal(readStored(draftKey), saved);
});

for (const saved of ['{broken draft', '{"model":"altura-24x24","step":99}', '[]']) {
  test(`unreadable draft is preserved through save and reset: ${saved}`, t => {
    const { window, readStored } = openPage(t, { saved });
    window.designSpecificModel('altura-24x24');
    window.saveAduDraft();
    assert.equal(readStored(draftKey), saved);
    assert.match(window.document.querySelector('#adu-draft-status').textContent, /preserv/i);
    window.resetAduDraft();
    assert.equal(readStored(draftKey), saved);
    finishConcept(window);
    assert.match(window.document.querySelector('#design-draft-status').textContent, /this tab only/i);
  });
}

test('visiting restores a valid saved design without silently overwriting it', async t => {
  const saved = JSON.stringify({ model: 'altura-24x24', step: 2, savedAt: '2026-09-01', extraNote: 'Keep this data' });
  const { window, readStored } = openPage(t, { saved });
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(readStored(draftKey), saved);
  assert.equal(window.document.querySelector('#config-model-name').textContent, 'Altura');
  assert.equal(window.document.querySelector('[data-wizard-step="2"]').classList.contains('active'), true);
  window.chooseAduOption('model', 'series-750');
  window.saveAduDraft();
  const updated = JSON.parse(readStored(draftKey));
  assert.equal(updated.model, 'series-750');
  assert.equal(updated.extraNote, 'Keep this data');
  assert.match(window.document.querySelector('#adu-draft-status').textContent, /saved/i);
  assert.equal(window.document.querySelector('#design-draft-status').hidden, true);
});
