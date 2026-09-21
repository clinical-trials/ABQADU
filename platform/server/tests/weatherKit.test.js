const crypto = require('crypto');
const { createWeatherKitToken, getWeatherKitStatus, normalizeWeatherKitForecast, fetchWeatherKitForecast } = require('../src/services/weatherKit');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const now = new Date('2026-09-21T18:00:00Z');
const location = { latitude: 35.0844, longitude: -106.6504, label: 'Albuquerque, NM', timeZone: 'America/Denver' };
const env = {
  WEATHERKIT_TEAM_ID: 'ABCDE12345', WEATHERKIT_KEY_ID: 'FGHIJ67890', WEATHERKIT_SERVICE_ID: 'com.abqadu.weather',
  WEATHERKIT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'),
  WEATHERKIT_LOCATIONS_JSON: JSON.stringify({ '87106': location }),
};
function metadata() { return { readTime: '2026-09-21T17:55:00Z', expireTime: '2026-09-21T19:00:00Z', units: 'm', attributionURL: 'https://weatherkit.apple.com/legal-attribution.html' }; }
function fixture() {
  return {
    currentWeather: { metadata: metadata(), asOf: '2026-09-21T17:55:00Z', conditionCode: 'PartlyCloudy', temperature: 20, windSpeed: 16.09344, windDirection: 225, precipitationIntensity: 2.54 },
    forecastDaily: { metadata: metadata(), days: [
      { forecastStart: '2026-09-21T06:00:00Z', forecastEnd: '2026-09-22T06:00:00Z', temperatureMax: 30, temperatureMin: 10, precipitationChance: 0.8, precipitationAmount: 5.08, conditionCode: 'Rain' },
      { forecastStart: '2026-09-22T06:00:00Z', forecastEnd: '2026-09-23T06:00:00Z', temperatureMax: 25, temperatureMin: 5, precipitationChance: 0.1, precipitationAmount: 0, conditionCode: 'Clear' },
      { forecastStart: '2026-09-23T06:00:00Z', forecastEnd: '2026-09-24T06:00:00Z', temperatureMax: 20, temperatureMin: -5, precipitationChance: 0.2, precipitationAmount: 0, conditionCode: 'Cloudy' },
    ] },
    forecastHourly: { metadata: metadata(), hours: [
      { forecastStart: '2026-09-21T18:00:00Z', windSpeed: 16.09344, windGust: 24.14016 },
      // Still September 21 in Denver: these maxima belong to day one.
      { forecastStart: '2026-09-22T05:00:00Z', windSpeed: 48.28032, windGust: 72.42048 },
      { forecastStart: '2026-09-22T06:00:00Z', windSpeed: 8.04672, windGust: 16.09344 },
      { forecastStart: '2026-09-23T06:00:00Z', windSpeed: 3.218688 },
    ] },
  };
}
const attribution = { serviceName: 'Apple Weather', 'logoLight@2x': '/assets/branding/en/Apple_Weather_blk_en_2X_090122.png' };
function fakeTransport(payload = fixture(), branding = attribution) {
  return jest.fn(async url => ({ ok: true, redirected: false, json: async () => url.includes('/attribution/') ? branding : payload }));
}

it('signs a short-lived Apple ES256 token whose real signature verifies', () => {
  const [header, payload, signature] = createWeatherKitToken(env, now).split('.');
  expect(JSON.parse(Buffer.from(header, 'base64url'))).toEqual({ alg: 'ES256', kid: 'FGHIJ67890', id: 'ABCDE12345.com.abqadu.weather' });
  expect(JSON.parse(Buffer.from(payload, 'base64url'))).toEqual({ iss: 'ABCDE12345', sub: 'com.abqadu.weather', iat: 1790013600, exp: 1790013900 });
  expect(crypto.verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
});
it('reports configuration without exposing credentials or configured locations', () => {
  const status = getWeatherKitStatus(env);
  expect(status.configured).toBe(true); expect(status.missing).toEqual([]);
  expect(Object.keys(status).sort()).toEqual(['configured', 'missing', 'required_env']);
  expect(JSON.stringify(status)).not.toContain('ABCDE12345'); expect(JSON.stringify(status)).not.toContain('87106');
});
it.each([
  ['missing credentials', {}],
  ['wrong key type', { ...env, WEATHERKIT_PRIVATE_KEY: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) }],
  ['wrong EC curve', { ...env, WEATHERKIT_PRIVATE_KEY: crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) }],
  ['invalid latitude', { ...env, WEATHERKIT_LOCATIONS_JSON: JSON.stringify({ '87106': { ...location, latitude: 95 } }) }],
  ['numeric-string coordinates', { ...env, WEATHERKIT_LOCATIONS_JSON: JSON.stringify({ '87106': { ...location, longitude: '-106.6' } }) }],
  ['invalid timezone', { ...env, WEATHERKIT_LOCATIONS_JSON: JSON.stringify({ '87106': { ...location, timeZone: 'Not/A_Zone' } }) }],
  ['empty map', { ...env, WEATHERKIT_LOCATIONS_JSON: '{}' }],
  ['invalid ZIP key', { ...env, WEATHERKIT_LOCATIONS_JSON: JSON.stringify({ '87106/evil': location }) }],
])('locks requests when configuration has %s', async (_label, invalidEnv) => {
  expect(getWeatherKitStatus(invalidEnv).configured).toBe(false);
  const fetchImpl = fakeTransport();
  await expect(fetchWeatherKitForecast('87106', { env: invalidEnv, fetchImpl, now })).rejects.toMatchObject({ status: 503 });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it.each(['', '8710', '871060', '../87106', '87106?x=y'])('rejects invalid ZIP %s before contacting Apple', async zip => {
  const fetchImpl = fakeTransport();
  await expect(fetchWeatherKitForecast(zip, { env, fetchImpl, now })).rejects.toMatchObject({ status: 400 });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('refuses unmapped ZIPs instead of substituting Albuquerque coordinates', async () => {
  const fetchImpl = fakeTransport();
  await expect(fetchWeatherKitForecast('87501', { env, fetchImpl, now })).rejects.toMatchObject({ status: 409 });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('requests the configured coordinates, local timezone, planning datasets and official attribution with a Bearer token', async () => {
  const fetchImpl = fakeTransport();
  const result = await fetchWeatherKitForecast('87106', { env, fetchImpl, now });
  const url = new URL(fetchImpl.mock.calls.find(([url]) => url.includes('/api/v1/weather/'))[0]);
  expect(url.origin + url.pathname).toBe('https://weatherkit.apple.com/api/v1/weather/en/35.0844/-106.6504');
  expect(url.searchParams.get('dataSets')).toBe('currentWeather,forecastDaily,forecastHourly');
  expect(url.searchParams.get('timezone')).toBe('America/Denver');
  expect(fetchImpl.mock.calls.map(([url]) => url)).toContain('https://weatherkit.apple.com/attribution/en');
  for (const [, options] of fetchImpl.mock.calls) {
    expect(options.headers.Authorization).toMatch(/^Bearer ey/); expect(options.redirect).toBe('error'); expect(options.signal).toBeInstanceOf(AbortSignal);
  }
  expect(result.provider).toBe('weatherkit');
});
it('converts units and local dates into honest imperial measurements and application planning rules', () => {
  const result = normalizeWeatherKitForecast(fixture(), attribution, '87106', location, now);
  expect(result).toMatchObject({ zip: '87106', source: 'Apple Weather', location: 'Albuquerque, NM', checked_at: '2026-09-21T18:00:00.000Z', assessment_source: 'ABQ ADU planning rules' });
  expect(result.current).toMatchObject({ temp_f: 68, wind_mph: 10, wind_direction: 'SW', precip_inches: null, precip_inches_per_hour: 0.1, description: 'Partly Cloudy' });
  expect(result.days[0]).toMatchObject({ date: '2026-09-21', high_f: 86, low_f: 50, rain_chance: 80, precip_inches: 0.2, wind_mph: 30, gust_mph: 45 });
  expect(result.days[1]).toMatchObject({ date: '2026-09-22', high_f: 77, low_f: 41, wind_mph: 5, gust_mph: 10 });
  expect(result.days[2]).toMatchObject({ date: '2026-09-23', low_f: 23, gust_mph: null });
  expect(result.risk_level).toBe('high'); expect(result.delay_days).toBe(7);
  expect(result.risks.map(risk => risk.type)).toEqual(['rain', 'wind', 'freeze']);
  expect(result.crew_message).toContain('ABQ ADU planning assessment derived from Apple Weather data.');
  expect(result.attribution).toEqual({ service_name: 'Apple Weather', mark_url: 'https://weatherkit.apple.com/assets/branding/en/Apple_Weather_blk_en_2X_090122.png', legal_url: 'https://weatherkit.apple.com/legal-attribution.html' });
});
it('allows documented optional units/direction/gusts and falls back to the official data-sources link', () => {
  const payload = fixture(); delete payload.currentWeather.windDirection;
  for (const dataset of Object.values(payload)) { delete dataset.metadata.units; delete dataset.metadata.attributionURL; }
  for (const hour of payload.forecastHourly.hours) delete hour.windGust;
  const result = normalizeWeatherKitForecast(payload, attribution, '87106', location, now);
  expect(result.current.wind_direction).toBe(''); expect(result.days.every(day => day.gust_mph === null)).toBe(true);
  expect(result.risks.find(risk => risk.type === 'wind').note).toContain('gusts unavailable');
  expect(result.attribution.legal_url).toBe('https://developer.apple.com/weatherkit/data-source-attribution/');
});
it.each([
  ['missing current temperature', p => { delete p.currentWeather.temperature; }],
  ['null daily entry', p => { p.forecastDaily.days[0] = null; }],
  ['null hourly entry', p => { p.forecastHourly.hours[0] = null; }],
  ['null temperature', p => { p.currentWeather.temperature = null; }],
  ['string temperature', p => { p.currentWeather.temperature = '20'; }],
  ['missing precipitation rate', p => { delete p.currentWeather.precipitationIntensity; }],
  ['invalid rain probability', p => { p.forecastDaily.days[0].precipitationChance = 80; }],
  ['missing daily precipitation', p => { delete p.forecastDaily.days[0].precipitationAmount; }],
  ['missing third day', p => { p.forecastDaily.days.pop(); }],
  ['missing hourly coverage', p => { p.forecastHourly.hours.pop(); }],
  ['missing hourly wind', p => { delete p.forecastHourly.hours[0].windSpeed; }],
  ['malformed optional gust', p => { p.forecastHourly.hours[0].windGust = 'unknown'; }],
  ['unexpected units', p => { p.forecastDaily.metadata.units = 'e'; }],
  ['temporarily unavailable', p => { p.currentWeather.metadata.temporarilyUnavailable = true; }],
  ['expired dataset', p => { p.forecastHourly.metadata.expireTime = '2026-09-21T17:59:59Z'; }],
  ['missing freshness metadata', p => { delete p.currentWeather.metadata.readTime; }],
  ['unsafe legal attribution', p => { p.currentWeather.metadata.attributionURL = 'https://apple.com.attacker.test/legal'; }],
])('rejects %s instead of generating misleading weather', (_label, mutate) => {
  const payload = fixture(); mutate(payload);
  expect(() => normalizeWeatherKitForecast(payload, attribution, '87106', location, now)).toThrow(expect.objectContaining({ status: 502 }));
});
it.each([
  { ...attribution, 'logoLight@2x': 'https://attacker.test/logo.png' },
  { ...attribution, 'logoLight@2x': 'http://weatherkit.apple.com/logo.png' },
  { ...attribution, 'logoLight@2x': 'https://user:password@weatherkit.apple.com/logo.png' },
  { serviceName: 'Apple Weather' },
])('refuses missing or unsafe Apple branding', unsafeAttribution => {
  expect(() => normalizeWeatherKitForecast(fixture(), unsafeAttribution, '87106', location, now)).toThrow(expect.objectContaining({ status: 502 }));
});
it('requires the attribution response to succeed before returning weather', async () => {
  const fetchImpl = jest.fn(async url => url.includes('/attribution/') ? { ok: false, status: 500 } : { ok: true, json: async () => fixture() });
  await expect(fetchWeatherKitForecast('87106', { env, fetchImpl, now })).rejects.toMatchObject({ status: 502 });
});
it.each([
  async () => { throw new Error('PRIVATE_PEM fake-token signed-url'); },
  async () => { throw Object.assign(new Error('PRIVATE_PEM fake-token signed-url'), { status: 504 }); },
  async () => ({ ok: false, status: 401, text: async () => 'PRIVATE_PEM fake-token signed-url' }),
  async () => ({ ok: true, redirected: true, json: async () => fixture() }),
  async () => ({ ok: true, json: async () => { throw new Error('PRIVATE_PEM fake-token signed-url'); } }),
])('returns safe errors without response bodies, tokens, or private keys', async fetchImpl => {
  let error;
  try { await fetchWeatherKitForecast('87106', { env, fetchImpl, now }); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ status: 502 }); expect(error.message).not.toMatch(/PRIVATE_PEM|fake-token|signed-url|ABCDE12345|BEGIN/);
});
it('times out even if the transport ignores AbortSignal', async () => {
  jest.useFakeTimers();
  try {
    const pending = fetchWeatherKitForecast('87106', { env, fetchImpl: () => new Promise(() => {}), now });
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });
    await jest.advanceTimersByTimeAsync(10000); await assertion;
  } finally { jest.useRealTimers(); }
});
it('rejects a forecast that expires while the network response is pending', async () => {
  jest.useFakeTimers({ now });
  try {
    const payload = fixture();
    payload.currentWeather.metadata.expireTime = '2026-09-21T18:00:01Z';
    const fetchImpl = async url => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { ok: true, json: async () => url.includes('/attribution/') ? attribution : payload };
    };
    const pending = fetchWeatherKitForecast('87106', { env, fetchImpl });
    const assertion = expect(pending).rejects.toMatchObject({ status: 502 });
    await jest.advanceTimersByTimeAsync(2000);
    await assertion;
  } finally { jest.useRealTimers(); }
});
