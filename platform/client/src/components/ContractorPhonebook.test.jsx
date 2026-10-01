import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { BrowserRouter } from 'react-router-dom';
import ContractorPhonebook from './ContractorPhonebook';
import AppNavigation from './AppNavigation';

jest.mock('./AuthBoundary', () => ({ WorkspaceSignOut: () => null }));

let host, root, originalURL, originalScroll;
const render = async (navigation = false) => act(async () => root.render(navigation
  ? <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppNavigation /><ContractorPhonebook /></BrowserRouter>
  : <ContractorPhonebook />));
const card = id => host.querySelector(`[data-contact-id="${id}"]`);
const change = async (label, value) => act(async () => Simulate.change(host.querySelector(`[aria-label="${label}"]`), { target: { value } }));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  originalURL = window.location.href;
  window.history.replaceState({}, '', '/command-center');
  originalScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = jest.fn();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  global.fetch = jest.fn();
  jest.spyOn(Storage.prototype, 'setItem');
});
afterEach(async () => {
  expect(fetch).not.toHaveBeenCalled();
  expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  await act(async () => root.unmount()); host.remove();
  Element.prototype.scrollIntoView = originalScroll;
  window.history.replaceState({}, '', originalURL);
  jest.restoreAllMocks();
});

test('keeps all eleven offices in a collapsed phone book until requested', async () => {
  await render();
  expect(host.querySelector('#contractor-phonebook').open).toBe(false);
  expect(host.querySelector('#contractor-phonebook > summary').textContent).toContain('Contractor phone book');
  expect(host.querySelectorAll('[data-contact-id]')).toHaveLength(11);
  expect(host.querySelector('[role="status"]').textContent).toContain('11 offices');
  expect(host.querySelector('a[href^="sms:"]')).toBeNull();
});

test.each([
  ['Treasurer', 'bernco-treasurer'],
  ['Silver Ave', 'bernco-clerk'],
  ['P.O. Box 27108', 'bernco-assessor'],
  ['(505) 222-3700', 'bernco-assessor'],
  ['505-462-9768', 'bernco-treasurer'],
])('finds an office from %s without requiring exact number punctuation', async (query, id) => {
  await render();
  await change('Search contractor phone book', query);
  expect(host.querySelectorAll('[data-contact-id]')).toHaveLength(1);
  expect(card(id)).not.toBeNull();
});

test('jurisdiction and office search work together and can be cleared', async () => {
  await render();
  await change('Phone book jurisdiction', 'Bernalillo County');
  expect(host.querySelectorAll('[data-contact-id]')).toHaveLength(3);
  expect(card('cabq-planning')).toBeNull();
  await change('Search contractor phone book', 'assessment');
  expect(host.querySelectorAll('[data-contact-id]')).toHaveLength(1);
  expect(card('bernco-assessor')).not.toBeNull();
  await change('Search contractor phone book', 'not an office');
  expect(host.querySelectorAll('[data-contact-id]')).toHaveLength(0);
  expect(host.textContent).toContain('No offices match');
  await act(async () => [...host.querySelectorAll('button')].find(node => node.textContent === 'Clear filters').click());
  expect(host.querySelectorAll('[data-contact-id]')).toHaveLength(11);
});

test('separates mailing addresses from office locations and clearly marks the superseded Clerk address', async () => {
  await render();
  expect(card('bernco-treasurer').querySelector('address').textContent).toContain('P.O. Box 27800');
  expect(card('bernco-treasurer').textContent).toContain('Mailing address');
  expect(card('bernco-assessor').textContent).toContain('Mailing address');
  expect(card('bernco-clerk').querySelector('address').textContent).toContain('415 Silver Ave SW');
  expect(card('bernco-clerk').querySelector('address').textContent).not.toContain('Civic Plaza');
  expect(card('bernco-clerk').textContent).toContain('Office location');
  const details = card('bernco-clerk').querySelector('details');
  expect(details.textContent).toContain('Previously supplied address (outdated)');
  expect(details.textContent).toContain('One Civic Plaza NW');
  expect(details.open).toBe(false);
});

test('call numbers and email links use the provided contacts, with fax kept separate', async () => {
  await render();
  expect(card('bernco-treasurer').querySelector('a[href^="tel:"]').getAttribute('href')).toBe('tel:+15054687031');
  expect(card('bernco-clerk').querySelector('a[href^="tel:"]').getAttribute('href')).toBe('tel:+15054681290');
  expect(card('bernco-assessor').querySelector('a[href^="tel:"]').getAttribute('href')).toBe('tel:+15052223700');
  expect(card('bernco-treasurer').querySelector('details').textContent).toContain('(505) 462-9768');
  expect(card('bernco-treasurer').querySelector('details').textContent).toContain('Fax supplied by contractor; confirm before use.');
  expect(card('bernco-assessor').querySelector('details').textContent).toContain('(505) 222-3771');
  expect(card('bernco-clerk').querySelector('[data-fax]').textContent).toBe('Not provided');
  expect(card('bernco-clerk').querySelectorAll('a[href^="tel:"]')).toHaveLength(1);
  expect(card('santa-fe-permit-counter').querySelector('a[href^="tel:"]')).toBeNull();
  expect(card('santa-fe-permit-counter').querySelector('a[href^="mailto:"]').getAttribute('href')).toBe('mailto:permitcounter@santafenm.gov');
  for (const link of host.querySelectorAll('a[href^="https:"]')) {
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(link.rel).toContain('noreferrer');
  }
});

test('an initial phone-book hash opens the section, and a native same-page hash change reopens it', async () => {
  window.history.replaceState({}, '', '/command-center#contractor-phonebook');
  await render();
  expect(host.querySelector('#contractor-phonebook').open).toBe(true);
  host.querySelector('#contractor-phonebook').open = false;
  window.history.replaceState({}, '', '/command-center#messages');
  await act(async () => window.dispatchEvent(new HashChangeEvent('hashchange')));
  expect(host.querySelector('#contractor-phonebook').open).toBe(false);
  window.history.replaceState({}, '', '/command-center#contractor-phonebook');
  await act(async () => window.dispatchEvent(new HashChangeEvent('hashchange')));
  expect(host.querySelector('#contractor-phonebook').open).toBe(true);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

test('the workspace menu opens and scrolls to the phone book, including clicking its current hash again', async () => {
  await render(true);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    host.querySelector('#contractor-phonebook').open = false;
    await act(async () => host.querySelector('[aria-controls="workspace-menu"]').click());
    const link = host.querySelector('a[href="/command-center#contractor-phonebook"]');
    expect(link).not.toBeNull();
    await act(async () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(host.querySelector('#contractor-phonebook').open).toBe(true);
    expect(host.querySelector('#workspace-menu')).toBeNull();
  }
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  expect(host.querySelector('a[href*="selections.html"]')).toBeNull();
});
