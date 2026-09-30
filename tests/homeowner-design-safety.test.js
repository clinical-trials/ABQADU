const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('../platform/client/node_modules/jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function openPage(t, { popupThrows = false, response } = {}) {
  const errors = [];
  let prints = 0;
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://clinical-trials.github.io/ABQADU/index.html',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.HTMLElement.prototype.scrollTo = () => {};
      window.open = () => {
        if (popupThrows) throw new window.DOMException('Popup blocked', 'SecurityError');
        return null;
      };
      window.print = () => { prints += 1; };
      window.fetch = async () => {
        assert.ok(response, 'No request should be attempted without a configured intake endpoint');
        return response;
      };
      if (response) window.ABQ_DESIGN_ENDPOINT = 'https://intake.example.test/designs';
    },
  });
  t.after(() => {
    dom.window.close();
    assert.deepEqual(errors, [], 'Homeowner actions must not cause script errors');
  });
  return { window: dom.window, printCount: () => prints };
}

function prepareDesign(window) {
  window.designSpecificModel('altura-24x24');
  window.jumpAduStep(6);
  const form = window.document.getElementById('design-contact-form');
  form.elements.namedItem('name').value = 'Sam Homeowner';
  form.elements.namedItem('email').value = 'sam@example.com';
  form.querySelector('[type="submit"]').click();
}

for (const report of ['recommendation', 'design']) {
  for (const popupThrows of [false, true]) {
    test(`${report} printing preserves the page and entered requests when a popup ${popupThrows ? 'throws' : 'is blocked'}`, async t => {
      const { window, printCount } = openPage(t, { popupThrows });
      prepareDesign(window);
      const requestForm = window.document.getElementById('assessment-form');
      requestForm.elements.namedItem('notes').value = 'Please keep this unsent request.';
      const draft = window.localStorage.getItem('abqadu_homeowner_design_draft');
      if (report === 'recommendation') window.printAduMatchReport();
      else window.printDesignSummary();
      assert.equal(window.document.getElementById('assessment-form'), requestForm);
      assert.equal(requestForm.elements.namedItem('notes').value, 'Please keep this unsent request.');
      assert.equal(window.document.getElementById('design-contact-form').elements.namedItem('name').value, 'Sam Homeowner');
      assert.equal(window.localStorage.getItem('abqadu_homeowner_design_draft'), draft);
      await new Promise(resolve => setTimeout(resolve, 70));
      assert.equal(printCount(), 1);
      window.dispatchEvent(new window.Event('afterprint'));
      assert.equal(window.document.body.classList.contains('adu-match-report-print'), false);
      assert.equal(window.document.body.classList.contains('design-summary-print'), false);
    });
  }
}

test('design result displays contact fields literally without creating executable markup', t => {
  const { window } = openPage(t);
  const form = window.document.getElementById('design-contact-form');
  const values = {
    name: '<img src=x onerror="window.injected=true"> Sam & Jo',
    email: '<a href="javascript:window.injected=true">mail@example.com</a>',
    phone: '<svg onload="window.injected=true"></svg> 505-555-0100',
    address: '<script>window.injected=true</script> 123 Main & First',
  };
  for (const [name, value] of Object.entries(values)) form.elements.namedItem(name).value = value;
  // Exercise the rendering boundary even for strings rejected by native email validation.
  window.renderDesignResult(window.buildDesignSummary());
  const result = window.document.getElementById('design-result-body');
  for (const value of Object.values(values)) assert.ok(result.textContent.includes(value), value);
  assert.equal(result.querySelector('img, svg, script, a, [onerror], [onload]'), null);
  assert.equal(window.injected, undefined);
});

test('design dialogs receive focus, contain keyboard navigation and restore the originating control', t => {
  const { window } = openPage(t);
  const card = window.document.querySelector('[data-design-model="altura-24x24"]');
  card.focus();
  card.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const modal = window.document.getElementById('design-modal');
  const close = modal.querySelector('.design-modal-close');
  assert.equal(window.document.activeElement, close);
  assert.equal(window.document.body.style.overflow, 'hidden');
  assert.equal(window.document.querySelector('nav').inert, true);
  const backTab = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  close.dispatchEvent(backTab);
  assert.equal(backTab.defaultPrevented, true);
  assert.equal(window.document.activeElement, window.document.getElementById('adu-wizard-next'));
  window.document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(window.document.activeElement, close);
  close.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(modal.getAttribute('aria-hidden'), 'true');
  assert.equal(window.document.activeElement, card);
  assert.equal(window.document.body.style.overflow, '');
  assert.equal(window.document.querySelector('nav').inert, false);

  card.focus();
  prepareDesign(window);
  const result = window.document.getElementById('design-result-modal');
  assert.equal(window.document.activeElement, result.querySelector('.design-result-close'));
  assert.equal(window.document.body.style.overflow, 'hidden');
  result.querySelector('.design-result-close').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(result.getAttribute('aria-hidden'), 'true');
  assert.equal(window.document.activeElement, card);
  assert.equal(window.document.body.style.overflow, '');
});

for (const [description, response, expected] of [
  ['explicit acceptance', { ok: true, json: async () => ({ accepted: true, requestId: 'request-123' }) }, 'sent'],
  ['HTML fallback', { ok: true, json: async () => { throw new SyntaxError('Not JSON'); } }, 'error'],
  ['unexpected JSON', { ok: true, json: async () => ({ message: 'ok' }) }, 'error'],
  ['rejected request', { ok: true, json: async () => ({ accepted: false, requestId: 'request-123' }) }, 'error'],
  ['missing receipt', { ok: true, json: async () => ({ accepted: true, requestId: ' ' }) }, 'error'],
  ['HTTP failure', { ok: false, status: 503, json: async () => ({ accepted: true, requestId: 'request-123' }) }, 'error'],
]) {
  test(`intake ${description} reports only confirmed delivery`, async t => {
    const { window } = openPage(t, { response });
    prepareDesign(window);
    await new Promise(resolve => setTimeout(resolve, 0));
    const status = window.document.getElementById('design-send-status');
    assert.equal(status.dataset.state, expected);
    assert.doesNotMatch(status.textContent, /one business day/i);
    if (expected === 'error') assert.doesNotMatch(status.textContent, /we have your design|✓ Sent/);
  });
}

test('unconfigured intake explains that manual sharing has not sent the design', t => {
  const { window } = openPage(t);
  prepareDesign(window);
  const status = window.document.getElementById('design-send-status');
  assert.equal(status.dataset.state, 'manual');
  assert.match(status.textContent, /not been sent/i);
  assert.match(status.textContent, /Text Builder Copy/);
  assert.match(window.document.querySelector('.design-result-actions .email').textContent, /me a copy/i);
});

test('a late receipt for an older design cannot confirm delivery of the current design', async t => {
  const { window } = openPage(t, { response: { ok: true } });
  const pending = [];
  window.fetch = () => new Promise(resolve => pending.push(resolve));
  prepareDesign(window);
  window.closeDesignResult();
  prepareDesign(window);
  assert.equal(pending.length, 2);
  pending[1]({ ok: false, status: 503 });
  await new Promise(resolve => setTimeout(resolve, 0));
  const status = window.document.getElementById('design-send-status');
  assert.equal(status.dataset.state, 'error');
  pending[0]({ ok: true, json: async () => ({ accepted: true, requestId: 'older-request' }) });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(status.dataset.state, 'error');
});
