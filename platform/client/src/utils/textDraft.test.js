import { normalizeTextPhone, smsDraftHref, makeJobText, hasTextPlaceholders } from './textDraft';

const project = { client: 'Sample homeowner', address: '123 Sample Lane', client_target_budget: '$300k', internal_notes: 'Private office note', markup_pct: 60 };
const now = Date.parse('2026-10-01T15:00:00Z');
const forecast = { source: 'National Weather Service', checked_at: '2026-10-01T14:00:00Z', expires_at: '2026-10-01T16:00:00Z',
  days: [{ date: '2026-10-02', rain_chance: 80, high_f: 70, wind_mph: 15, wind_coverage: 'complete' }] };

test.each([
  ['(505) 555-0123', '+15055550123'], ['1 505 555 0123', '+15055550123'],
  ['+44 20 7946 0958', '+442079460958'], ['', ''], ['12345', ''],
  ['5055550123&body=wrong', ''], ['+1+5055550123', ''], ['5055550123 ext 2', ''],
  ['javascript:alert(1)', ''], ['0015055550123', ''], [null, ''],
])('normalizes only a single complete telephone recipient: %p', (input, expected) => {
  expect(normalizeTextPhone(input)).toBe(expected);
});

test('SMS links preserve exact draft text and never create a second recipient or URL parameter', () => {
  const body = 'Site: 123 A&B Street\nQuote “paint” + cleanup? Thanks 👋';
  const href = smsDraftHref('(505) 555-0123', body);
  expect(href).toBe(`sms:+15055550123?body=${encodeURIComponent(body)}`);
  expect(smsDraftHref('5055550123', body, true)).toBe(`sms:+15055550123&body=${encodeURIComponent(body)}`);
  expect(smsDraftHref('', body)).toBeNull();
  expect(smsDraftHref('5055550123', '   ')).toBeNull();
});

test('malformed unicode and overlong text cannot break the composer', () => {
  expect(smsDraftHref('5055550123', '\ud800')).toContain('%EF%BF%BD');
  expect(smsDraftHref('5055550123', 'x'.repeat(1601))).toBeNull();
});

test.each(['site_visit', 'request_quote', 'job_update', 'weather_hold'])('%s templates never copy internal project financial data', type => {
  const draft = makeJobText(type, { project });
  expect(draft.text).toContain('123 Sample Lane');
  expect(draft.text).not.toMatch(/300k|Private office note|markup|60%/);
});

test('site visits request availability rather than inventing a confirmed date', () => {
  const draft = makeJobText('site_visit', { project });
  expect(draft.text).toMatch(/24.*72/);
  expect(draft.text).toMatch(/what times|availability/i);
  expect(draft.text).not.toMatch(/scheduled for|confirmed for/i);
  expect(hasTextPlaceholders(draft.text)).toBe(false);
});

test('quote and progress drafts identify the information the contractor must supply', () => {
  expect(hasTextPlaceholders(makeJobText('request_quote', { project }).text)).toBe(true);
  expect(hasTextPlaceholders(makeJobText('job_update', { project }).text)).toBe(true);
  expect(hasTextPlaceholders('Progress: forms are ready.')).toBe(false);
});

test('weather facts come only from a current supplied forecast and identify the source/date', () => {
  const draft = makeJobText('weather_hold', { project, forecast, fresh: true, dayDate: '2026-10-02', now });
  expect(draft.needsWeatherRefresh).toBe(false);
  expect(draft.text).toContain('2026-10-02');
  expect(draft.text).toContain('80%');
  expect(draft.text).toContain('15 mph');
  expect(draft.text).toContain('National Weather Service');
  expect(draft.text).not.toMatch(/day off confirmed|work is cancelled|safe to work/i);
});

test.each([
  { fresh: false }, { forecast: null }, { now: now + 7200000 }, { dayDate: '2026-10-03' },
])('missing, expired, or mismatched weather never reuses cached weather facts %#', changes => {
  const draft = makeJobText('weather_hold', { project, forecast, fresh: true, dayDate: '2026-10-02', now, ...changes });
  expect(draft.needsWeatherRefresh).toBe(true);
  expect(draft.text).not.toContain('80%');
  expect(draft.warning).toMatch(/refresh/i);
});

test('missing weather values are unknown, not zero or invented safe conditions', () => {
  const draft = makeJobText('weather_hold', { project, fresh: true, now, forecast: { ...forecast, days: [{ date: '2026-10-02', rain_chance: null, high_f: null, wind_mph: 10, wind_coverage: 'partial' }] } });
  expect(draft.text).toContain('Rain unknown');
  expect(draft.text).toContain('incomplete');
  expect(draft.text).not.toContain('0%');
});
