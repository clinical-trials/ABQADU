const now = new Date('2026-09-21T18:00:00Z');
const location = { latitude: 35.0844, longitude: -106.6504, label: 'Albuquerque city forecast', timeZone: 'America/Denver', scope: 'city' };
const points = { properties: { timeZone: 'America/Denver', forecastHourly: 'https://api.weather.gov/gridpoints/ABQ/98,121/forecast/hourly', forecastGridData: 'https://api.weather.gov/gridpoints/ABQ/98,121' } };
function fixture(start = '2026-09-22T06:00:00Z', count = 96, updated = '2026-09-21T17:00:00Z') {
  const times = Array.from({ length: count }, (_, i) => new Date(Date.parse(start) + i * 3600000).toISOString());
  const series = (uom, value) => ({ uom, values: times.map((time, i) => ({ validTime: `${time}/PT1H`, value: typeof value === 'function' ? value(i) : value })) });
  return {
    hourly: { properties: { updateTime: updated, periods: times.map(time => ({ startTime: time, endTime: new Date(Date.parse(time) + 3600000).toISOString(), temperature: 68, temperatureUnit: 'F', windSpeed: '10 mph', probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 20 }, shortForecast: 'Partly Cloudy' })) } },
    grid: { properties: { updateTime: updated, temperature: series('wmoUnit:degC', i => i % 24 === 0 ? 10 : 25), windSpeed: series('wmoUnit:km_h-1', 16.09344), windGust: series('wmoUnit:km_h-1', 24.14016), probabilityOfPrecipitation: series('wmoUnit:percent', i => i < 24 ? 80 : 20), quantitativePrecipitation: series('wmoUnit:mm', i => i === 10 ? 5.08 : 0) } },
  };
}
function transport(data = fixture(), pointData = points) {
  return jest.fn(async url => ({ ok: true, redirected: false, json: async () => url.includes('/points/') ? pointData : url.endsWith('/hourly') ? data.hourly : data.grid }));
}
let fetchNwsForecast, getNwsStatus, normalizeNwsForecast;
beforeEach(() => {
  jest.resetModules();
  ({ fetchNwsForecast, getNwsStatus, normalizeNwsForecast } = require('../src/services/nwsWeather'));
});

test('needs no keys for the explicitly labelled Albuquerque city reference', async () => {
  expect(getNwsStatus({})).toMatchObject({ configured: true, missing: [], required_env: [] });
  const fetchImpl = transport();
  const result = await fetchNwsForecast('87106', { env: {}, fetchImpl, now });
  expect(result).toMatchObject({ provider: 'nws', source: 'National Weather Service', location: 'Albuquerque city forecast', scope: 'city', window: { start_date: '2026-09-22', end_date: '2026-09-25', time_zone: 'America/Denver' } });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  for (const [url, options] of fetchImpl.mock.calls) {
    expect(url).toMatch(/^https:\/\/api\.weather\.gov\//);
    expect(options.headers['User-Agent']).toMatch(/ABQ/);
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.redirect).toBe('error');
  }
  expect(result.attribution.source_url).toBe('https://www.weather.gov/abq/');
  expect(result.current).toBeNull();
});
test('normalizes numeric four-day measurements and trade guidance without provider branding confusion', () => {
  const { hourly, grid } = fixture();
  const result = normalizeNwsForecast(hourly, grid, '87106', location, now);
  expect(result.days.map(day => day.date)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
  expect(result.days[0]).toMatchObject({ high_f: 77, low_f: 50, wind_mph: 10, gust_mph: 15, rain_chance: 80, precip_inches: 0.2, wind_coverage: 'complete', hourly_hours_expected: 24, hourly_hours_available: 24 });
  expect(result.days[0].trade_guidance.concrete.level).toBe('hold');
  expect(result.days[3].trade_guidance.concrete.level).toBe('plan');
  expect(result.crew_message).toContain('National Weather Service');
  expect(result.crew_message).not.toContain('Apple');
  expect(result.source_updated_at).toBe('2026-09-21T17:00:00.000Z');
  expect(Date.parse(result.expires_at)).toBeGreaterThan(now.getTime());
});
test('does not silently apply the city reference to another ZIP', async () => {
  const fetchImpl = transport();
  await expect(fetchNwsForecast('87501', { env: {}, fetchImpl, now })).rejects.toMatchObject({ status: 409 });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('uses validated configured coordinates when explicitly supplied', async () => {
  const fetchImpl = transport();
  const env = { NWS_LOCATIONS_JSON: JSON.stringify({ '87106': { ...location, latitude: 35.1, longitude: -106.6, label: 'Configured site' } }) };
  const result = await fetchNwsForecast('87106', { env, fetchImpl, now });
  expect(fetchImpl.mock.calls[0][0]).toBe('https://api.weather.gov/points/35.1,-106.6');
  expect(result).toMatchObject({ location: 'Configured site', scope: 'configured' });
});
test.each(['8710', '../87106', '87106?x=1'])('rejects invalid ZIP %s', async zip => {
  await expect(fetchNwsForecast(zip, { env: {}, fetchImpl: transport(), now })).rejects.toMatchObject({ status: 400 });
});
test.each(['not json', '{}', JSON.stringify({ '87106': { ...location, latitude: 100 } }), JSON.stringify({ '87106': { ...location, timeZone: 'Wrong/Zone' } })])('rejects invalid configured location maps', async raw => {
  expect(getNwsStatus({ NWS_LOCATIONS_JSON: raw }).configured).toBe(false);
  await expect(fetchNwsForecast('87106', { env: { NWS_LOCATIONS_JSON: raw }, fetchImpl: transport(), now })).rejects.toMatchObject({ status: 503 });
});
test.each(['https://evil.test/data', 'http://api.weather.gov/data', 'https://api.weather.gov.evil.test/data', 'https://user:pass@api.weather.gov/data', 'https://api.weather.gov:444/data'])('refuses unsafe discovery URL %s', async unsafe => {
  const fetchImpl = transport(fixture(), { properties: { ...points.properties, forecastHourly: unsafe } });
  await expect(fetchNwsForecast('87106', { env: {}, fetchImpl, now })).rejects.toMatchObject({ status: 502 });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
test('uses nulls and unknown guidance for missing numeric coverage instead of zero or safe weather', () => {
  const { hourly, grid } = fixture();
  for (const key of ['temperature', 'windSpeed', 'windGust', 'probabilityOfPrecipitation', 'quantitativePrecipitation']) grid.properties[key].values.forEach(value => { value.value = null; });
  hourly.properties.periods = [];
  const result = normalizeNwsForecast(hourly, grid, '87106', location, now);
  expect(result.days[0]).toMatchObject({ high_f: null, low_f: null, wind_mph: null, gust_mph: null, rain_chance: null, precip_inches: null, wind_coverage: 'unavailable' });
  expect(result.days[0].trade_guidance.concrete.level).toBe('unknown');
  expect(result.risk_level).toBe('unknown');
  expect(result.risks).toEqual([]);
});
test('merged grid intervals cover all their hours, while duplicate intervals do not fill missing coverage', () => {
  const { hourly, grid } = fixture();
  grid.properties.windSpeed.values = [{ validTime: '2026-09-22T06:00:00Z/PT23H', value: 16.09344 }, { validTime: '2026-09-22T06:00:00Z/PT23H', value: 16.09344 }];
  const result = normalizeNwsForecast(hourly, grid, '87106', location, now);
  expect(result.days[0]).toMatchObject({ wind_mph: 10, wind_coverage: 'partial', hourly_hours_available: 23 });
  expect(result.days[1].wind_coverage).toBe('unavailable');
});
test('does not double-count overlapping precipitation intervals or invent midnight allocation', () => {
  const { hourly, grid } = fixture();
  grid.properties.quantitativePrecipitation.values.push({ ...grid.properties.quantitativePrecipitation.values[10] });
  expect(normalizeNwsForecast(hourly, grid, '87106', location, now).days[0].precip_inches).toBe(0.2);
  grid.properties.quantitativePrecipitation.values = [{ validTime: '2026-09-22T00:00:00Z/P2D', value: 25.4 }];
  expect(normalizeNwsForecast(hourly, grid, '87106', location, now).days[0].precip_inches).toBeNull();
});
test('daily numeric intervals and storm conditions account for local dates', () => {
  const { hourly, grid } = fixture();
  hourly.properties.periods[23].shortForecast = 'Chance Showers And Thunderstorms';
  const result = normalizeNwsForecast(hourly, grid, '87106', location, now);
  expect(result.days[0].thunderstorm_possible).toBe(true);
  expect(result.days[1].thunderstorm_possible).toBe(false);
  expect(result.days[0].trade_guidance.general.level).toBe('hold');
});
test.each([
  ['2026-10-31T18:00:00Z', '2026-11-01T06:00:00Z', 97, 25],
  ['2027-03-13T18:00:00Z', '2027-03-14T07:00:00Z', 95, 23],
])('calculates DST day coverage at %s', (checked, start, count, hours) => {
  const { hourly, grid } = fixture(start, count, checked);
  const result = normalizeNwsForecast(hourly, grid, '87106', location, new Date(checked));
  expect(result.days[0]).toMatchObject({ hourly_hours_expected: hours, hourly_hours_available: hours, wind_coverage: 'complete' });
});
test.each(['2026-09-19T18:00:00Z', '2026-09-22T18:00:00Z', 'bad-date'])('rejects stale, future, or malformed source update time %s', updateTime => {
  const { hourly, grid } = fixture(); grid.properties.updateTime = updateTime;
  expect(() => normalizeNwsForecast(hourly, grid, '87106', location, now)).toThrow(expect.objectContaining({ status: 502 }));
});
test('caches successful requests, combines concurrent requests, and does not leak caller mutations', async () => {
  const fetchImpl = transport();
  const options = { env: {}, fetchImpl, now };
  const [first, second] = await Promise.all([fetchNwsForecast('87106', options), fetchNwsForecast('87106', options)]);
  first.days[0].high_f = -999;
  const third = await fetchNwsForecast('87106', options);
  expect(second.days[0].high_f).toBe(77); expect(third.days[0].high_f).toBe(77);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});
test('refreshes after the ten-minute expiry and does not use a stale cached forecast on failure', async () => {
  const fetchImpl = transport();
  await fetchNwsForecast('87106', { env: {}, fetchImpl, now });
  fetchImpl.mockRejectedValueOnce(new Error('NWS outage'));
  await expect(fetchNwsForecast('87106', { env: {}, fetchImpl, now: new Date(now.getTime() + 11 * 60000) })).rejects.toMatchObject({ status: 502 });
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});
test('rejects transport redirects rather than following forecast discovery to another host', async () => {
  await expect(fetchNwsForecast('87106', { env: {}, fetchImpl: async () => ({ ok: true, redirected: true, json: async () => points }), now })).rejects.toMatchObject({ status: 502 });
});
test('preserves unsupported measurement units as unavailable values', () => {
  const { hourly, grid } = fixture();
  grid.properties.temperature.uom = 'unknown'; grid.properties.windSpeed.uom = 'unknown';
  const day = normalizeNwsForecast(hourly, grid, '87106', location, now).days[1];
  expect(day).toMatchObject({ high_f: null, low_f: null, wind_mph: null, temperature_coverage: 'unavailable', wind_coverage: 'unavailable' });
  expect(day.trade_guidance.concrete.level).toBe('unknown');
});
test('marks unavailable thunderstorm condition coverage instead of assuming no thunderstorm risk', () => {
  const { hourly, grid } = fixture(); hourly.properties.periods = [];
  const day = normalizeNwsForecast(hourly, grid, '87106', location, now).days[1];
  expect(day.condition_coverage).toBe('unavailable');
  expect(day.trade_guidance.concrete.level).not.toBe('plan');
});
test('fails safely on network errors and permits later retries', async () => {
  const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('private internal server details')).mockImplementation(transport());
  await expect(fetchNwsForecast('87106', { env: {}, fetchImpl, now })).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining('private') });
  await expect(fetchNwsForecast('87106', { env: {}, fetchImpl, now })).resolves.toMatchObject({ provider: 'nws' });
});
test('bounds stalled requests even when the transport ignores cancellation', async () => {
  jest.useFakeTimers();
  try {
    const pending = fetchNwsForecast('87106', { env: {}, fetchImpl: () => new Promise(() => {}), now });
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });
    await jest.advanceTimersByTimeAsync(10000); await assertion;
  } finally { jest.useRealTimers(); }
});
