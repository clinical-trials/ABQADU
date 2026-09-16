const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('../platform/client/node_modules/jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function openHomeownerPage(t) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://clinical-trials.github.io/ABQADU/index.html',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      // jsdom has no layout engine; retain real dialog behavior while omitting scrolling.
      window.HTMLElement.prototype.scrollTo = () => {};
    },
  });
  t.after(() => {
    dom.window.close();
    assert.deepEqual(errors, [], 'The homeowner page should run without script errors');
  });
  return dom.window;
}

function assessmentForm(window) {
  const form = window.document.querySelector('#assessment-form');
  assert.ok(form, 'Assessment fields need a working form');
  return form;
}

function enter(window, form, name, value) {
  const field = form.elements.namedItem(name);
  assert.ok(field, `Missing assessment field: ${name}`);
  field.value = value;
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
}

test('assessment requires a name and a valid way to reach the homeowner', t => {
  const window = openHomeownerPage(t);
  const form = assessmentForm(window);
  const submit = form.querySelector('[type="submit"]');
  submit.click();
  assert.equal(form.checkValidity(), false);
  assert.equal(window.document.querySelector('#assessment-result').hidden, true);

  enter(window, form, 'firstName', 'Sarah');
  submit.click();
  assert.equal(form.checkValidity(), false, 'A name alone is not a contact method');
  enter(window, form, 'email', 'not-an-email');
  submit.click();
  assert.equal(form.checkValidity(), false);
  enter(window, form, 'email', '');
  enter(window, form, 'phone', '123');
  submit.click();
  assert.equal(form.checkValidity(), false, 'A short number is not a reachable phone');
  enter(window, form, 'phone', '(505) 555-0100');
  enter(window, form, 'firstName', '   ');
  submit.click();
  assert.equal(form.checkValidity(), false, 'Whitespace is not a homeowner name');
});

test('assessment prepares the entered request for review without claiming delivery', t => {
  const window = openHomeownerPage(t);
  const form = assessmentForm(window);
  enter(window, form, 'firstName', 'Sarah');
  enter(window, form, 'lastName', 'Whitmore');
  enter(window, form, 'email', 'sarah@example.com');
  enter(window, form, 'address', '147 Elm Street');
  enter(window, form, 'notes', '<script>doNotRun()</script> September site visit');
  form.querySelector('[type="submit"]').click();

  const result = window.document.querySelector('#assessment-result');
  assert.equal(result.hidden, false);
  assert.match(result.textContent, /not been sent/i);
  const summary = window.document.querySelector('#assessment-summary').value;
  assert.match(summary, /Sarah Whitmore/);
  assert.match(summary, /sarah@example\.com/);
  assert.match(summary, /147 Elm Street/);
  assert.match(summary, /<script>doNotRun\(\)<\/script> September site visit/);
  assert.equal(result.querySelector('script'), null, 'Notes must remain text');
  const textLink = window.document.querySelector('#assessment-text-link');
  assert.match(textLink.href, /^sms:15059777659\?/);
  assert.match(decodeURIComponent(textLink.href), /Sarah Whitmore/);
  assert.equal(window.location.href, 'https://clinical-trials.github.io/ABQADU/index.html');
});

test('phone-only requests can be downloaded and edits require a fresh review', t => {
  const window = openHomeownerPage(t);
  const form = assessmentForm(window);
  enter(window, form, 'firstName', 'Sam');
  enter(window, form, 'phone', '505-555-0123');
  form.querySelector('[type="submit"]').click();
  assert.equal(form.checkValidity(), true);
  const download = window.document.querySelector('#assessment-download-link');
  assert.equal(download.download, 'abq-adu-assessment-request.txt');
  const downloadedText = decodeURIComponent(download.href.split(',').slice(1).join(','));
  assert.match(downloadedText, /Sam/);
  assert.match(downloadedText, /505-555-0123/);
  assert.doesNotMatch(downloadedText, /undefined|null/);

  enter(window, form, 'firstName', 'Samantha');
  assert.equal(window.document.querySelector('#assessment-result').hidden, true);
  form.querySelector('[type="submit"]').click();
  assert.match(window.document.querySelector('#assessment-summary').value, /Samantha/);
});

test('copy falls back to selecting the summary when clipboard access is unavailable', async t => {
  const window = openHomeownerPage(t);
  const form = assessmentForm(window);
  enter(window, form, 'firstName', 'Sam');
  enter(window, form, 'email', 'sam@example.com');
  form.querySelector('[type="submit"]').click();
  window.document.querySelector('#assessment-copy-button').click();
  await Promise.resolve();
  const summary = window.document.querySelector('#assessment-summary');
  assert.equal(window.document.activeElement, summary);
  assert.equal(summary.selectionStart, 0);
  assert.equal(summary.selectionEnd, summary.value.length);
  assert.match(window.document.querySelector('#assessment-copy-status').textContent, /select|copy/i);
  assert.match(window.document.querySelector('#assessment-result').textContent, /not been sent/i);
});

test('footer navigation reaches existing sections, model design, or builder tools', t => {
  const window = openHomeownerPage(t);
  const links = [...window.document.querySelectorAll('footer a')];
  for (const link of links) {
    const href = link.getAttribute('href');
    assert.notEqual(href, '#', `${link.textContent} must have a real destination`);
    if (href.startsWith('#')) assert.ok(window.document.getElementById(href.slice(1)), href);
  }
  const modelLink = links.find(link => link.textContent.trim() === 'Altura');
  modelLink.click();
  assert.equal(window.document.querySelector('#design-modal').getAttribute('aria-hidden'), 'false');
  assert.match(window.document.querySelector('#design-modal').textContent, /Altura/);
  assert.ok(links.some(link => link.getAttribute('href') === 'platform.html#schedule'));
  assert.ok(links.some(link => link.getAttribute('href') === 'platform.html#bids'));
});
