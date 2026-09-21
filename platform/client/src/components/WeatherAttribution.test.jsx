import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import WeatherAttribution from './WeatherAttribution';

const officialPage = 'https://developer.apple.com/weatherkit/data-source-attribution/';
const mark = 'https://weatherkit.apple.com/assets/branding/en/Apple_Weather_mark_Dark.svg';
const legal = 'https://weatherkit.apple.com/legal-attribution.html';
let container, root;
const render = forecast => act(async () => root.render(<WeatherAttribution forecast={forecast} />));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test('WeatherKit results display the supplied official combined mark and legal link', async () => {
  await render({ provider: 'weatherkit', attribution: { mark_url: mark, legal_url: legal } });
  const logo = container.querySelector('img');
  expect(logo.getAttribute('src')).toBe(mark);
  expect(logo.alt).toBe('Apple Weather');
  expect(logo.height).toBe(24);
  const link = container.querySelector('a');
  expect(link.textContent).toBe('Weather data sources');
  expect(link.href).toBe(legal);
  expect(link.rel).toContain('noopener');
});

test('an Apple Weather source is recognized without a provider field', async () => {
  await render({ source: 'Apple Weather', attribution: { mark_url: mark, legal_url: officialPage } });
  expect(container.querySelector('img').alt).toBe('Apple Weather');
  expect(container.querySelector('a').href).toBe(officialPage);
});

test.each([
  undefined,
  null,
  { provider: 'wttr.in', source: 'wttr.in' },
  { provider: 'other', attribution: { mark_url: mark, legal_url: legal } },
])('does not brand non-Apple forecast %p', async forecast => {
  await render(forecast);
  expect(container.childNodes).toHaveLength(0);
});

test.each([
  undefined,
  'javascript:alert(1)',
  'http://weatherkit.apple.com/mark.svg',
  '//weatherkit.apple.com/mark.svg',
  'https://weatherkit.apple.com.evil.example/mark.svg',
  'https://evil.example/?url=https://weatherkit.apple.com/mark.svg',
  'https://user:password@weatherkit.apple.com/mark.svg',
  'https://weatherkit.apple.com:8443/mark.svg',
  'https://developer.apple.com/mark.svg',
])('unsafe or absent logo %p uses plain text and the official attribution page', async mark_url => {
  await render({ provider: 'weatherkit', attribution: { mark_url } });
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('Apple Weather');
  expect(container.querySelector('a').href).toBe(officialPage);
});

test.each([
  undefined,
  'data:text/html,private',
  'javascript:alert(1)',
  'http://developer.apple.com/weatherkit/',
  '/weatherkit/data-source-attribution/',
  'https://developer.apple.com.evil.example/legal',
  'https://weatherkit.apple.com@evil.example/legal',
  'https://user@developer.apple.com/legal',
  'https://developer.apple.com:8443/legal',
  'https://www.apple.com/legal',
])('unsafe or absent legal URL %p falls back to the official source page', async legal_url => {
  await render({ provider: 'weatherkit', attribution: { mark_url: mark, legal_url } });
  expect(container.querySelector('a').href).toBe(officialPage);
});

test('a failed remote logo leaves readable attribution and the legal link', async () => {
  await render({ provider: 'weatherkit', attribution: { mark_url: mark, legal_url: legal } });
  await act(async () => container.querySelector('img').dispatchEvent(new Event('error')));
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('Apple Weather');
  expect(container.querySelector('a').href).toBe(legal);
});
