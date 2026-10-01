const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('../platform/client/node_modules/jsdom');

const root = path.join(__dirname, '..');
const draftKey = 'abqadu.homeowner-selections.v1';

function openPage(t, { saved, blocked = false, quota = false, clipboard, initialize = true } = {}) {
  const htmlPath = path.join(root, 'selections.html');
  assert.ok(fs.existsSync(htmlPath), 'The homeowner choices worksheet must be available');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  let readStored, writes = 0, prints = [], downloads = [];
  const dom = new JSDOM(html, {
    url: 'https://clinical-trials.github.io/ABQADU/selections.html',
    runScripts: initialize ? 'dangerously' : undefined, virtualConsole,
    beforeParse(window) {
      window.fetch = () => assert.fail('A choices worksheet must not submit or fetch customer data');
      window.XMLHttpRequest = function () { assert.fail('A choices worksheet must not send network requests'); };
      window.HTMLElement.prototype.scrollTo = () => {};
      window.print = () => { prints.push(window.document.getElementById('print-summary-text')?.textContent); };
      const blobs = new Map();
      window.URL.createObjectURL = blob => {
        const url = `blob:worksheet-fixture-${blobs.size}`;
        blobs.set(url, blob);
        return url;
      };
      window.URL.revokeObjectURL = () => {};
      const anchorClick = window.HTMLAnchorElement.prototype.click;
      window.HTMLAnchorElement.prototype.click = function () {
        if (this.download) downloads.push({ filename: this.download, blob: blobs.get(this.href) });
        else anchorClick.call(this);
      };
      const storage = window.localStorage;
      const read = window.Storage.prototype.getItem;
      const write = window.Storage.prototype.setItem;
      readStored = key => read.call(storage, key);
      if (saved !== undefined) write.call(storage, draftKey, saved);
      write.call(storage, 'unrelated-project', 'keep this separate');
      if (blocked) window.Storage.prototype.getItem = () => { throw new window.DOMException('Denied', 'SecurityError'); };
      window.Storage.prototype.setItem = function (key, value) {
        writes += 1;
        if (blocked || quota) throw new window.DOMException('Cannot save', quota ? 'QuotaExceededError' : 'SecurityError');
        return write.call(this, key, value);
      };
      window.Storage.prototype.removeItem = () => assert.fail('Worksheet actions must not delete stored drafts');
      if (blocked) Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new window.DOMException('Storage is blocked for this page', 'SecurityError'); },
      });
      if (clipboard) Object.defineProperty(window.navigator, 'clipboard', { value: clipboard });
    },
  });
  t.after(() => {
    assert.equal(readStored('unrelated-project'), 'keep this separate');
    dom.window.close();
    assert.deepEqual(errors, [], 'The choices worksheet must remain usable without script errors');
  });
  if (initialize) {
    const scriptPath = path.join(root, 'homeowner-selections.js');
    assert.ok(fs.existsSync(scriptPath), 'The worksheet needs working choice and summary controls');
    dom.window.eval(fs.readFileSync(scriptPath, 'utf8'));
  }
  return { window: dom.window, readStored, writeCount: () => writes, printed: () => prints, downloaded: () => downloads };
}

function choose(window, name, value) {
  const field = window.document.getElementById('selections-form').elements.namedItem(name);
  assert.ok(field, `Homeowners need a ${name} choice`);
  assert.ok([...field.options].some(option => option.value === value), `Missing ${name} option ${value}`);
  field.value = value;
  field.dispatchEvent(new window.Event('change', { bubbles: true }));
  return field.selectedOptions[0].textContent.trim();
}

function enter(window, id, value) {
  const field = window.document.getElementById(id);
  assert.ok(field, `Missing editable field ${id}`);
  field.value = value;
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function summary(window) { return window.document.getElementById('selection-summary').value; }
function click(window, id) {
  const button = window.document.getElementById(id);
  assert.ok(button, `Missing homeowner action ${id}`);
  button.click();
}

function savedDraft(t) {
  const page = openPage(t);
  enter(page.window, 'project-nickname', 'Garden concept');
  choose(page.window, 'dishwasher', 'compact');
  enter(page.window, 'notes-kitchen', 'Measure the planned opening.');
  click(page.window, 'save-selections');
  const saved = page.readStored(draftKey);
  assert.ok(saved, 'Explicit save must produce a restorable browser draft');
  return saved;
}

test('a new worksheet starts undecided with no implied approvals, saved draft or network side effect', t => {
  const { window, readStored, writeCount } = openPage(t);
  const form = window.document.getElementById('selections-form');
  assert.ok(form, 'Choices must be editable in a form');
  const selects = [...form.querySelectorAll('select')];
  assert.equal(selects.length, 21);
  for (const field of selects) {
    assert.equal(field.value, '', `${field.name} must remain undecided`);
    assert.match(field.selectedOptions[0].textContent, /undecided|not sure|not selected/i);
  }
  assert.match(window.document.getElementById('selection-progress').textContent, /0 of 21/);
  const summary = window.document.getElementById('selection-summary');
  assert.equal(summary.readOnly, true);
  assert.match(summary.value, /undecided|not selected|not sure/i);
  assert.doesNotMatch(summary.value, /(?:approved|confirmed|ordered|sent):\s*(?:yes|true)/i);
  assert.equal(readStored(draftKey), null);
  assert.equal(writeCount(), 0);
});

test('disabled no-script controls and cancelled form submission prevent preferences entering a page URL', t => {
  const noScript = openPage(t, { initialize: false });
  const disabledForm = noScript.window.document.getElementById('selections-form');
  assert.ok(disabledForm);
  const disabledControls = [...disabledForm.querySelectorAll('input,select,textarea,button')];
  assert.ok(disabledControls.length > 0);
  for (const field of disabledControls) assert.equal(field.matches(':disabled'), true, `${field.id || field.name} must wait for safe initialization`);
  for (const id of ['save-selections', 'copy-summary', 'download-summary', 'print-summary']) {
    assert.equal(noScript.window.document.getElementById(id).matches(':disabled'), true, `${id} requires JavaScript`);
  }
  const { window } = openPage(t);
  enter(window, 'project-nickname', 'Preferences stay off the URL');
  choose(window, 'refrigerator', 'counter-depth');
  const form = window.document.getElementById('selections-form');
  assert.equal(form.elements.namedItem('refrigerator').matches(':disabled'), false);
  const event = new window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true, 'Enter/implicit submit must never navigate or send a GET request');
  assert.equal(window.location.href, 'https://clinical-trials.github.io/ABQADU/selections.html');
  assert.match(summary(window), /Preferences stay off the URL/);
});

test('dishwasher, ceiling fans, cooking style, stainless finish and counter-depth refrigerator are selectable preferences', t => {
  const { window, writeCount } = openPage(t);
  const selected = [
    choose(window, 'dishwasher', 'standard'), choose(window, 'ceiling_fans', 'both'),
    choose(window, 'cooking_setup', 'cooktop-oven'), choose(window, 'appliance_finish', 'stainless-steel'),
    choose(window, 'refrigerator', 'counter-depth'),
  ];
  for (const label of selected) assert.ok(summary(window).includes(label), `Summary must include the chosen ${label}`);
  assert.match(summary(window), /dishwasher/i);
  assert.match(summary(window), /ceiling fans/i);
  assert.match(summary(window), /stainless/i);
  assert.match(summary(window), /counter.depth/i);
  assert.match(window.document.getElementById('selection-progress').textContent, /5 of 21/);
  const range = choose(window, 'cooking_setup', 'range');
  assert.ok(summary(window).includes(range));
  assert.match(window.document.getElementById('selection-progress').textContent, /5 of 21/);
  const discussion = choose(window, 'dishwasher', 'ask-builder');
  assert.ok(summary(window).includes(discussion), 'Discussion requests must remain visible in the builder summary');
  assert.match(window.document.getElementById('selection-progress').textContent, /4 of 21/);
  const samples = choose(window, 'cabinet_style', 'see-samples');
  assert.ok(summary(window).includes(samples), 'A request to review samples remains an unresolved preference');
  assert.match(window.document.getElementById('selection-progress').textContent, /4 of 21/);
  assert.equal(writeCount(), 0, 'Typing preferences does not save or send them automatically');
});

test('optional adobe refinishing and accent-window quote requests appear in the current printable and saved preferences', t => {
  const page = openPage(t);
  const { window } = page;
  const form = window.document.getElementById('selections-form');
  assert.equal(form.elements.namedItem('adobe_refinishing')?.value, '', 'Adobe work must start undecided');
  assert.equal(form.elements.namedItem('accent_window')?.value, '', 'An accent window must start undecided');
  const adobeLabel = choose(window, 'adobe_refinishing', 'quote');
  const windowLabel = choose(window, 'accent_window', 'quote');
  enter(window, 'notes-exterior', 'Discuss an adobe finish and an accent window at the courtyard.');
  const current = summary(window);
  assert.match(current, /adobe refinishing/i);
  assert.match(current, /accent window/i);
  assert.ok(current.includes(adobeLabel));
  assert.ok(current.includes(windowLabel));
  assert.match(current, /Discuss an adobe finish and an accent window at the courtyard\./);
  assert.match(current, /not.*(?:approval|order|quote|agreement)/i);
  assert.match(current, /undecided/i, 'Unrelated choices must remain open');
  assert.match(window.document.getElementById('selection-progress').textContent, /2 of 21/);
  click(window, 'print-summary');
  assert.deepEqual(page.printed(), [current]);
  assert.equal(page.readStored(draftKey), null, 'A quote preference or printing must not silently save');
  click(window, 'save-selections');
  const saved = page.readStored(draftKey);
  const restored = openPage(t, { saved });
  assert.equal(summary(restored.window), current);
  assert.equal(restored.window.document.getElementById('print-summary-text').textContent, current);
  assert.equal(restored.readStored(draftKey), saved);
  assert.equal(restored.writeCount(), 0);
  choose(window, 'accent_window', 'later');
  assert.match(window.document.getElementById('selection-progress').textContent, /1 of 21/, 'A later discussion is not a settled choice');
  choose(window, 'adobe_refinishing', 'ask-builder');
  assert.match(window.document.getElementById('selection-progress').textContent, /0 of 21/);
  choose(window, 'accent_window', 'none');
  assert.match(window.document.getElementById('selection-progress').textContent, /1 of 21/);
});

function legacyDraft() {
  // This is the original persisted shape, independent of the current form's field list.
  return JSON.stringify({
    version: 1,
    savedAt: '2026-09-30T18:00:00.000Z',
    projectNickname: 'Earlier garden concept',
    choices: {
      dishwasher: 'compact', cooking_setup: '', appliance_finish: '', refrigerator: '', ventilation: '', microwave: '', disposal: '',
      ceiling_fans: 'bedrooms', heating_cooling: '', laundry: '', water_heater: '',
      cabinet_color: '', cabinet_style: '', countertop: '', flooring: '',
      bath_layout: '', shower_enclosure: '', vanity: '', toilet: '',
    },
    notes: { kitchen: 'Keep the original appliance note.', comfort: '', finishes: '', bath: '' },
  }, null, 2);
}

test('the original version-one draft restores untouched and adds blank exterior preferences only when explicitly saved', t => {
  const saved = legacyDraft();
  const { window, readStored, writeCount } = openPage(t, { saved });
  const form = window.document.getElementById('selections-form');
  assert.equal(window.document.getElementById('project-nickname').value, 'Earlier garden concept');
  assert.equal(form.elements.namedItem('dishwasher').value, 'compact');
  assert.equal(form.elements.namedItem('ceiling_fans').value, 'bedrooms');
  assert.equal(window.document.getElementById('notes-kitchen').value, 'Keep the original appliance note.');
  assert.equal(form.elements.namedItem('adobe_refinishing')?.value, '');
  assert.equal(form.elements.namedItem('accent_window')?.value, '');
  assert.equal(window.document.getElementById('notes-exterior')?.value, '');
  assert.match(window.document.getElementById('selection-progress').textContent, /2 of 21/);
  assert.equal(readStored(draftKey), saved, 'Loading must preserve the complete original serialized record');
  assert.equal(writeCount(), 0, 'Schema compatibility must never cause an automatic storage write');
  choose(window, 'adobe_refinishing', 'quote');
  assert.equal(readStored(draftKey), saved, 'Editing also preserves the earlier device draft');
  click(window, 'save-selections');
  assert.equal(writeCount(), 1);
  const updated = JSON.parse(readStored(draftKey));
  assert.equal(updated.version, 1);
  assert.equal(updated.projectNickname, 'Earlier garden concept');
  assert.equal(updated.choices.dishwasher, 'compact');
  assert.equal(updated.choices.ceiling_fans, 'bedrooms');
  assert.equal(updated.choices.adobe_refinishing, 'quote');
  assert.equal(updated.choices.accent_window, '');
  assert.equal(updated.notes.kitchen, 'Keep the original appliance note.');
  assert.equal(updated.notes.exterior, '');
});

test('partial or mixed legacy/current exterior draft shapes remain untouched through attempted save', t => {
  const original = JSON.parse(legacyDraft());
  const malformed = [
    { ...original, choices: { ...original.choices, adobe_refinishing: 'quote' } },
    { ...original, choices: { ...original.choices, adobe_refinishing: 'quote', accent_window: '' } },
    { ...original, notes: { ...original.notes, exterior: 'Only a partial upgrade' } },
    { ...original, choices: { ...original.choices, adobe_refinishing: 'quote' }, notes: { ...original.notes, exterior: '' } },
    { ...original, choices: { ...original.choices, adobe_refinishing: 'not-an-option', accent_window: '' }, notes: { ...original.notes, exterior: '' } },
  ];
  for (const record of malformed) {
    const saved = JSON.stringify(record);
    const { window, readStored, writeCount } = openPage(t, { saved });
    const form = window.document.getElementById('selections-form');
    assert.equal(form.elements.namedItem('dishwasher').value, '', 'Invalid draft must not partially restore preferences');
    choose(window, 'accent_window', 'quote');
    enter(window, 'notes-exterior', 'Current visible preferences remain available.');
    click(window, 'save-selections');
    assert.equal(readStored(draftKey), saved, 'Compatibility must not overwrite a partial or malformed existing draft');
    assert.equal(writeCount(), 0);
    assert.equal(form.elements.namedItem('accent_window').value, 'quote');
    assert.match(summary(window), /Current visible preferences remain available\./);
    assert.match(window.document.getElementById('storage-status').textContent, /preserv|not.*replace|not.*overwrite|kept|untouched/i);
  }
});

test('text and print summaries follow current unsaved edits and retain undecided choices', t => {
  const page = openPage(t);
  const { window } = page;
  enter(window, 'project-nickname', 'First concept');
  choose(window, 'dishwasher', 'standard');
  click(window, 'save-selections');
  const originalStored = page.readStored(draftKey);
  enter(window, 'project-nickname', 'Revised concept');
  choose(window, 'dishwasher', 'compact');
  enter(window, 'notes-comfort', 'Discuss the bedroom fan location.');
  const current = summary(window);
  assert.match(current, /Revised concept/);
  assert.doesNotMatch(current, /First concept/);
  assert.match(current, /compact/i);
  assert.match(current, /Discuss the bedroom fan location\./);
  assert.match(current, /undecided/i);
  assert.equal(window.document.getElementById('print-summary-text').textContent, current);
  click(window, 'print-summary');
  assert.deepEqual(page.printed(), [current], 'Print must receive the current visible preferences');
  assert.equal(summary(window), current);
  assert.equal(page.readStored(draftKey), originalStored, 'Printing does not overwrite the saved draft');
});

test('nickname and notes appear literally without creating executable elements', t => {
  const { window } = openPage(t);
  const nickname = '<img src=x onerror="window.injected=true"> Garden';
  const notes = '<script>window.injected=true</script><svg onload="window.injected=true"></svg> & details';
  enter(window, 'project-nickname', nickname);
  enter(window, 'notes-kitchen', notes);
  assert.ok(summary(window).includes(nickname));
  assert.ok(summary(window).includes(notes));
  const print = window.document.getElementById('print-summary-text');
  assert.ok(print.textContent.includes(nickname));
  assert.ok(print.textContent.includes(notes));
  assert.equal(print.querySelector('img,script,svg,[onerror],[onload]'), null);
  assert.equal(window.document.querySelector('[onerror],[onload]'), null);
  assert.equal(window.injected, undefined);
});

test('an explicit save restores a valid draft on a later visit without overwriting it on load or edits', t => {
  const saved = savedDraft(t);
  const { window, readStored, writeCount } = openPage(t, { saved });
  assert.equal(window.document.getElementById('project-nickname').value, 'Garden concept');
  assert.equal(window.document.getElementById('selections-form').elements.namedItem('dishwasher').value, 'compact');
  assert.equal(window.document.getElementById('notes-kitchen').value, 'Measure the planned opening.');
  assert.match(summary(window), /Garden concept/);
  assert.equal(readStored(draftKey), saved);
  assert.equal(writeCount(), 0);
  choose(window, 'dishwasher', 'none');
  assert.equal(readStored(draftKey), saved, 'Changing the visible draft requires another explicit save');
  assert.equal(writeCount(), 0);
});

test('denied browser storage leaves the visible worksheet editable and exportable without reporting a save', t => {
  const page = openPage(t, { blocked: true });
  const { window } = page;
  enter(window, 'project-nickname', 'Keep this unsaved concept');
  choose(window, 'appliance_finish', 'stainless-steel');
  click(window, 'save-selections');
  assert.equal(window.document.getElementById('project-nickname').value, 'Keep this unsaved concept');
  assert.match(summary(window), /stainless/i);
  const status = `${window.document.getElementById('save-status').textContent} ${window.document.getElementById('storage-status').textContent}`;
  assert.match(status, /unavailable|blocked|could not|cannot|couldn't|not saved|this tab/i);
  assert.doesNotMatch(status, /^\s*saved (?:successfully|to)/i);
  click(window, 'print-summary');
  assert.equal(page.printed()[0], summary(window));
  assert.equal(page.readStored(draftKey), null);
});

test('quota failure preserves the older saved draft and the current unsaved preferences', t => {
  const saved = savedDraft(t);
  const { window, readStored } = openPage(t, { saved, quota: true });
  enter(window, 'project-nickname', 'Latest visible concept');
  choose(window, 'dishwasher', 'standard');
  click(window, 'save-selections');
  assert.equal(readStored(draftKey), saved);
  assert.equal(window.document.getElementById('project-nickname').value, 'Latest visible concept');
  assert.equal(window.document.getElementById('selections-form').elements.namedItem('dishwasher').value, 'standard');
  assert.match(summary(window), /Latest visible concept/);
  assert.match(window.document.getElementById('save-status').textContent, /could not|cannot|couldn't|not saved|this tab|copy|download|print/i);
});

test('malformed, unsupported and invalid-option saved drafts are preserved through attempted save', t => {
  const valid = JSON.parse(savedDraft(t));
  const wrongVersion = JSON.stringify({ ...valid, version: 99 });
  const invalidChoice = JSON.stringify({ ...valid, choices: { ...valid.choices, dishwasher: 'not-a-real-choice' } });
  for (const saved of ['{broken draft', wrongVersion, invalidChoice]) {
    const { window, readStored } = openPage(t, { saved });
    assert.equal(window.document.getElementById('selections-form').elements.namedItem('dishwasher').value, '');
    enter(window, 'project-nickname', 'Current tab remains usable');
    choose(window, 'ceiling_fans', 'bedrooms');
    click(window, 'save-selections');
    assert.equal(readStored(draftKey), saved, 'An unreadable existing record cannot be silently replaced');
    assert.equal(window.document.getElementById('project-nickname').value, 'Current tab remains usable');
    assert.equal(window.document.getElementById('selections-form').elements.namedItem('ceiling_fans').value, 'bedrooms');
    assert.match(summary(window), /Current tab remains usable/);
    const status = `${window.document.getElementById('save-status').textContent} ${window.document.getElementById('storage-status').textContent}`;
    assert.match(status, /preserv|not.*replace|not.*overwrite|kept|untouched/i);
  }
});

test('a saved record that becomes invalid in another tab is not overwritten by explicit save', t => {
  const saved = savedDraft(t);
  const { window, readStored } = openPage(t, { saved });
  choose(window, 'refrigerator', 'counter-depth');
  window.localStorage.setItem(draftKey, '{another tab wrote an unreadable record');
  click(window, 'save-selections');
  assert.equal(readStored(draftKey), '{another tab wrote an unreadable record');
  assert.equal(window.document.getElementById('selections-form').elements.namedItem('refrigerator').value, 'counter-depth');
  assert.match(summary(window), /counter.depth/i);
});

test('clipboard denial or absence selects the current summary and truthfully asks for manual copying', async t => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('Clipboard denied'); } }]) {
    const { window } = openPage(t, { clipboard });
    enter(window, 'project-nickname', 'Manual copy concept');
    choose(window, 'cooking_setup', 'cooktop');
    click(window, 'copy-summary');
    await new Promise(resolve => setTimeout(resolve, 0));
    const field = window.document.getElementById('selection-summary');
    assert.equal(window.document.getElementById('summary-details').open, true);
    assert.equal(window.document.activeElement, field);
    assert.equal(field.selectionStart, 0);
    assert.equal(field.selectionEnd, field.value.length);
    assert.match(field.value, /Manual copy concept/);
    const status = window.document.getElementById('copy-status').textContent;
    assert.match(status, /select|manual|press|copy.*yourself/i);
    assert.doesNotMatch(status, /^\s*copied\b|successfully copied/i);
  }
});

test('successful copy exports current preferences without saving or claiming they were sent', async t => {
  const copied = [];
  const { window, readStored } = openPage(t, { clipboard: { writeText: async value => copied.push(value) } });
  enter(window, 'project-nickname', 'Copy current concept');
  choose(window, 'refrigerator', 'counter-depth');
  click(window, 'copy-summary');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(copied, [summary(window)]);
  assert.match(window.document.getElementById('copy-status').textContent, /copied/i);
  assert.match(summary(window), /not.*sent|nothing.*sent|does not.*send/i);
  assert.equal(readStored(draftKey), null);
});

test('edits made while clipboard permission is pending are not falsely reported as copied', async t => {
  let finishCopy;
  const copied = [];
  const { window } = openPage(t, { clipboard: { writeText: value => {
    copied.push(value);
    return new Promise(resolve => { finishCopy = resolve; });
  } } });
  enter(window, 'project-nickname', 'Earlier concept');
  click(window, 'copy-summary');
  enter(window, 'project-nickname', 'Latest concept');
  finishCopy();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(copied[0], /Earlier concept/);
  assert.doesNotMatch(copied[0], /Latest concept/);
  assert.match(summary(window), /Latest concept/);
  const status = window.document.getElementById('copy-status').textContent;
  assert.match(status, /earlier|previous|changed|copy again/i);
  assert.doesNotMatch(status, /current.*copied|latest.*copied/i);
});

test('the text download contains current unsaved choices and unknowns without replacing a saved draft', async t => {
  const saved = savedDraft(t);
  const page = openPage(t, { saved });
  const { window } = page;
  enter(window, 'project-nickname', 'Download revised concept');
  choose(window, 'dishwasher', 'none');
  enter(window, 'notes-bath', 'Vanity dimensions remain undecided.');
  click(window, 'download-summary');
  const downloads = page.downloaded();
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].filename, /\.txt$/);
  assert.match(downloads[0].blob.type, /^text\/plain/);
  const content = await new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(downloads[0].blob);
  });
  assert.equal(content, summary(window));
  assert.match(content, /Download revised concept/);
  assert.match(content, /Vanity dimensions remain undecided\./);
  assert.match(content, /undecided/i);
  assert.equal(page.readStored(draftKey), saved);
});
