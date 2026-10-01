const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { JSDOM, VirtualConsole } = require('../platform/client/node_modules/jsdom');

const html = fs.readFileSync(path.join(__dirname, '../platform.html'), 'utf8');
const contacts = require('../platform/client/src/data/contractorContacts.json');

test('the legacy and active contractor phone books retain the same contact records', () => {
  const literal = html.match(/const CITY_REGULATORS = (\[[\s\S]*?\]);/)[1];
  const legacy = JSON.parse(JSON.stringify(vm.runInNewContext(`(${literal})`)));
  assert.deepEqual(legacy, contacts);
  assert.equal(new Set(contacts.map(contact => contact.id)).size, 11);
  assert.equal(contacts.filter(contact => contact.city === 'Bernalillo County').length, 3);
});

test('county filter renders usable phone links, labeled mailing addresses and contact qualifications', t => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://builder.example/platform.html#ai',
    runScripts: 'dangerously', virtualConsole,
    beforeParse(window) { window.HTMLElement.prototype.scrollIntoView = () => {}; },
  });
  t.after(() => dom.window.close());
  const document = dom.window.document;
  [...document.querySelectorAll('#regulator-toolbar button')].find(button => button.textContent === 'Bernalillo County').click();
  const cards = [...document.querySelectorAll('#regulator-grid article')];
  assert.equal(cards.length, 3);
  const find = name => cards.find(card => card.querySelector('h4').textContent === name);
  const treasurer = find('Bernalillo County Treasurer');
  assert.equal(treasurer.querySelector('a[href^="tel:"]').getAttribute('href'), 'tel:5054687031');
  assert.match(treasurer.textContent, /Mailing address: P\.O\. Box 27800, Albuquerque, NM 87125/);
  assert.match(treasurer.textContent, /Fax supplied by contractor; confirm before use/);
  const clerk = find('Bernalillo County Clerk');
  assert.equal(clerk.querySelector('a[href^="tel:"]').getAttribute('href'), 'tel:5054681290');
  assert.match(clerk.textContent, /Office location: 415 Silver Ave SW, Suite 200/);
  assert.match(clerk.querySelector('details').textContent, /Previously supplied address \(outdated\): One Civic Plaza NW, 6th floor/);
  assert.doesNotMatch(clerk.querySelector('.regulator-meta').textContent, /Fax:/);
  const assessor = find('Bernalillo County Assessor');
  assert.equal(assessor.querySelector('a[href^="tel:"]').getAttribute('href'), 'tel:5052223700');
  assert.match(assessor.textContent, /Mailing address: P\.O\. Box 27108, Albuquerque, NM 87125/);
  assert.match(assessor.textContent, /Fax:.*505.*222.*3771/);
  assert.deepEqual(errors, []);
});
