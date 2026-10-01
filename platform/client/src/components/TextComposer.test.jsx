import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import TextComposer from './TextComposer';
import { clearAuthSession, setAuthSession } from '../utils/authFetch';

let host, root, props;
const project = { id: 'job-1', client: 'Sample homeowner', address: '123 Sample Lane', client_phone: '(505) 555-0123' };
const button = name => [...host.querySelectorAll('button')].find(node => node.textContent === name);
const message = () => host.querySelector('[aria-label="Message draft"]');
const render = async () => act(async () => root.render(<TextComposer {...props} />));
const click = async name => act(async () => button(name).click());
const change = async (label, value) => act(async () => Simulate.change(host.querySelector(`[aria-label="${label}"]`), { target: { value } }));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  props = { project, builder: { phone: '5055550199' }, forecast: null, fresh: false, onCheckWeather: jest.fn() };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn(async () => {}) } });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearAuthSession(); jest.restoreAllMocks(); });

test('a phone draft works without Twilio and makes the recipient and reply location explicit', async () => {
  await render(); await click('Site visit');
  expect(message().value).toContain('123 Sample Lane');
  expect(host.textContent).toContain('+15055550123');
  expect(host.textContent).toContain('Replies stay in your phone');
  expect(host.querySelector('a[href^="sms:"]').getAttribute('href')).toContain('sms:+15055550123');
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
});

test('recipient changes affect only this draft and invalid numbers cannot open a text', async () => {
  await render(); await click('Site visit');
  await change('Text recipient', 'office');
  expect(host.querySelector('a[href^="sms:"]').getAttribute('href')).toContain('+15055550199');
  await change('Text recipient', 'other'); await change('Recipient mobile number', '12');
  expect(host.querySelector('a[href^="sms:"]')).toBeNull();
  expect(props.project.client_phone).toBe('(505) 555-0123');
  expect(props.builder.phone).toBe('5055550199');
});

test('editable quote prompts must be completed before opening or copying', async () => {
  await render(); await click('Request quote');
  expect(button('Copy draft').disabled).toBe(true);
  expect(host.querySelector('a[href^="sms:"]')).toBeNull();
  await change('Message draft', 'Please quote the patio: 200 sq ft & cleanup.');
  await click('Copy draft');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Please quote the patio: 200 sq ft & cleanup.');
  expect(host.textContent).toContain('Copied');
  expect(host.textContent).toContain('44 characters');
});

test.each(['denied', 'missing'])('clipboard %s offers manual copying and does not report success', async mode => {
  await render(); await click('Site visit');
  if (mode === 'denied') navigator.clipboard.writeText.mockRejectedValue(new Error('Permission denied'));
  else delete navigator.clipboard;
  await click('Copy draft');
  expect(host.textContent).toContain('Select and copy');
  expect(host.textContent).not.toContain('Copied.');
  expect(document.activeElement).toBe(message());
  expect(message().selectionStart).toBe(0);
  expect(message().selectionEnd).toBe(message().value.length);
});

test('switching jobs clears message text and recipient overrides', async () => {
  await render(); await click('Site visit'); await change('Recipient mobile number', '5055550198');
  props.project = { ...project, id: 'job-2', client_phone: '5055550111', address: 'Second site' }; await render();
  expect(message().value).toBe('');
  expect(host.querySelector('[aria-label="Recipient mobile number"]').value).toBe('5055550111');
  expect(host.textContent).not.toContain('123 Sample Lane');
});

test('session changes clear the draft and ignore a late clipboard completion', async () => {
  let finish;
  await act(async () => setAuthSession({ userId: 'one', sessionId: 'one', getToken: async () => 'token' }));
  await render(); await click('Site visit');
  navigator.clipboard.writeText.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await click('Copy draft');
  await act(async () => clearAuthSession());
  await act(async () => finish());
  expect(message().value).toBe('');
  expect(host.textContent).not.toContain('Copied.');
});

test('weather without a current forecast asks for refresh and cannot be shared', async () => {
  await render(); await click('Weather hold review');
  expect(host.textContent).toContain('Refresh the forecast');
  expect(button('Copy draft').disabled).toBe(true);
  await click('Refresh weather'); expect(props.onCheckWeather).toHaveBeenCalledTimes(1);
});

test('refreshed weather preserves edits but requires an explicit replacement before sharing', async () => {
  props.fresh = true;
  props.forecast = { source: 'National Weather Service', checked_at: '2026-10-01T15:00:00Z', days: [{ date: '2026-10-02', rain_chance: 80, wind_mph: 10 }] };
  await render(); await click('Weather hold review');
  expect(message().value).toContain('80%');
  await change('Message draft', 'Keep these weather review edits.');
  props.forecast = { ...props.forecast, days: [{ ...props.forecast.days[0], rain_chance: 20 }] }; await render();
  expect(message().value).toBe('Keep these weather review edits.');
  expect(button('Copy draft').disabled).toBe(true);
  await click('Use current forecast');
  expect(message().value).toContain('20%');
  expect(button('Copy draft').disabled).toBe(false);
});

test('editing while copying prevents a stale success notice', async () => {
  let finish;
  await render(); await click('Site visit');
  navigator.clipboard.writeText.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await click('Copy draft'); await change('Message draft', 'A newer message.');
  await act(async () => finish());
  expect(host.textContent).not.toContain('Copied.');
  expect(message().value).toBe('A newer message.');
});
