const { assessConstructionWeather } = require('./weatherIntelligence');
const { tradeWeatherGuidance, planningCrewMessage } = require('./tradeWeatherPlanning');

const SOURCE = 'National Weather Service';
const ORIGIN = 'https://api.weather.gov';
const HOUR = 3600000;
const CACHE_MS = 10 * 60000;
const MAX_SOURCE_AGE = 24 * HOUR;
const USER_AGENT = 'ABQ-ADU-Weather-Planning/1.0 (https://clinical-trials.github.io/ABQADU/)';
const DEFAULT_LOCATION = { latitude: 35.0844, longitude: -106.6504, label: 'Albuquerque city forecast', timeZone: 'America/Denver', scope: 'city' };
const caches = new WeakMap();
function failure(status, message) { return Object.assign(new Error(message), { status }); }
function invalid() { return failure(502, 'National Weather Service returned incomplete or unavailable forecast data. Try again later.'); }
function round(value, places = 1) { return Number(value.toFixed(places)); }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw invalid();
  return Date.parse(value);
}
function partsAt(time, zone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(time);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}
function localDate(time, zone) { const p = partsAt(time, zone); return `${p.year}-${p.month}-${p.day}`; }
function plusDays(date, count) { return new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10); }
function midnight(date, zone) {
  const target = Date.parse(`${date}T00:00:00Z`);
  let value = target;
  for (let index = 0; index < 4; index++) {
    const p = partsAt(value, zone);
    const represented = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    const adjustment = target - represented;
    value += adjustment;
    if (!adjustment) return value;
  }
  throw invalid();
}
function readLocations(env) {
  if (!env.NWS_LOCATIONS_JSON?.trim()) return { '87106': DEFAULT_LOCATION };
  try {
    const supplied = JSON.parse(env.NWS_LOCATIONS_JSON);
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || !Object.keys(supplied).length || Object.keys(supplied).length > 1000) throw new Error();
    const locations = { '87106': DEFAULT_LOCATION };
    for (const [zip, location] of Object.entries(supplied)) {
      if (!/^\d{5}$/.test(zip) || !location || typeof location !== 'object'
        || typeof location.latitude !== 'number' || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
        || typeof location.longitude !== 'number' || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180
        || typeof location.label !== 'string' || !location.label.trim() || location.label.length > 120
        || typeof location.timeZone !== 'string' || !location.timeZone.trim()) throw new Error();
      new Intl.DateTimeFormat('en-US', { timeZone: location.timeZone }).format();
      locations[zip] = { latitude: location.latitude, longitude: location.longitude, label: location.label.trim(), timeZone: location.timeZone, scope: 'configured' };
    }
    return locations;
  } catch { throw failure(503, 'Configure a valid NWS_LOCATIONS_JSON location map on the server.'); }
}
function getNwsStatus(env = process.env) {
  try { readLocations(env); return { configured: true, missing: [], required_env: [] }; }
  catch { return { configured: false, missing: ['NWS_LOCATIONS_JSON'], required_env: [] }; }
}
function officialUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw invalid(); }
  if (url.origin !== ORIGIN || url.username || url.password || url.port || url.hash || !url.pathname.startsWith('/gridpoints/')) throw invalid();
  return url.href;
}
function interval(value) {
  if (typeof value !== 'string') throw invalid();
  const [startText, duration, extra] = value.split('/');
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(duration || '');
  if (extra || !match) throw invalid();
  const length = ((Number(match[1] || 0) * 24 + Number(match[2] || 0)) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0)) * 1000;
  if (!length || length > 14 * 86400000) throw invalid();
  const start = timestamp(startText);
  return { start, end: start + length };
}
function convert(value, unit, kind) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const name = String(unit || '').replace(/^wmoUnit:/, '');
  if (kind === 'temperature') return name === 'degC' ? value * 9 / 5 + 32 : name === 'degF' ? value : null;
  if (value < 0) return null;
  if (kind === 'chance') return name === 'percent' && value <= 100 ? value : null;
  if (kind === 'precip') return name === 'mm' ? value / 25.4 : name === 'in' ? value : null;
  return name === 'km_h-1' ? value / 1.609344 : name === 'm_s-1' ? value * 2.2369362921 : ['kn', 'kt'].includes(name) ? value * 1.150779448 : name === 'mi_h-1' ? value : null;
}
function gridSeries(series, kind) {
  if (!series) return [];
  if (!Array.isArray(series.values) || series.values.length > 10000) throw invalid();
  return series.values.map(row => ({ ...interval(row?.validTime), value: convert(row?.value, series.uom, kind) }));
}
function coverageFor(series, start, end) {
  const ranges = series.filter(row => row.value !== null && row.end > start && row.start < end)
    .map(row => ({ start: Math.max(start, row.start), end: Math.min(end, row.end) })).sort((a, b) => a.start - b.start);
  let covered = 0; let cursor = start;
  for (const range of ranges) {
    if (range.end <= cursor) continue;
    covered += range.end - Math.max(cursor, range.start);
    cursor = range.end;
  }
  return { covered, status: covered === end - start ? 'complete' : covered ? 'partial' : 'unavailable' };
}
function summary(series, start, end) {
  const values = series.filter(row => row.value !== null && row.start < end && row.end > start).map(row => row.value);
  return { ...coverageFor(series, start, end), min: values.length ? round(Math.min(...values)) : null, max: values.length ? round(Math.max(...values)) : null };
}
function precipitationSummary(series, start, end) {
  const unique = [...new Map(series.map(row => [`${row.start}/${row.end}/${row.value}`, row])).values()];
  const relevant = unique.filter(row => row.start < end && row.end > start).sort((a, b) => a.start - b.start);
  const coverage = coverageFor(relevant, start, end);
  let previousEnd = start; let sum = 0;
  for (const row of relevant) {
    // A nonzero accumulation spanning midnight cannot be allocated to this day
    // without assuming a uniform precipitation rate. Preserve it as unknown.
    if (row.value === null || (row.value !== 0 && (row.start < start || row.end > end)) || Math.max(row.start, start) < previousEnd) return { value: null, status: 'partial' };
    sum += row.value;
    previousEnd = Math.min(row.end, end);
  }
  return { value: coverage.status === 'complete' ? round(sum, 2) : null, status: coverage.status };
}
function sourceTime(payload, now) {
  const updated = timestamp(payload?.properties?.updateTime);
  if (updated > now.getTime() + 5 * 60000 || now.getTime() - updated >= MAX_SOURCE_AGE) throw invalid();
  return updated;
}
function normalizeNwsForecast(hourly, grid, zip, location, now = new Date()) {
  const updated = Math.min(sourceTime(hourly, now), sourceTime(grid, now));
  const properties = grid.properties;
  if (!Array.isArray(hourly.properties.periods) || hourly.properties.periods.length > 10000) throw invalid();
  const conditions = hourly.properties.periods.map(row => {
    const start = timestamp(row?.startTime); const end = timestamp(row?.endTime);
    if (end <= start || end - start > 24 * HOUR) throw invalid();
    return { start, end, text: typeof row.shortForecast === 'string' ? row.shortForecast.slice(0, 250) : '' };
  });
  const series = {
    temperature: gridSeries(properties.temperature, 'temperature'),
    wind: gridSeries(properties.windSpeed, 'wind'),
    gust: gridSeries(properties.windGust, 'wind'),
    chance: gridSeries(properties.probabilityOfPrecipitation, 'chance'),
    precip: gridSeries(properties.quantitativePrecipitation, 'precip'),
  };
  const tomorrow = plusDays(localDate(now, location.timeZone), 1);
  const window = { start_date: tomorrow, end_date: plusDays(tomorrow, 3), time_zone: location.timeZone };
  const days = Array.from({ length: 4 }, (_, index) => {
    const date = plusDays(tomorrow, index);
    const start = midnight(date, location.timeZone); const end = midnight(plusDays(date, 1), location.timeZone);
    const temperature = summary(series.temperature, start, end);
    const wind = summary(series.wind, start, end); const gust = summary(series.gust, start, end);
    const chance = summary(series.chance, start, end); const precip = precipitationSummary(series.precip, start, end);
    const descriptions = conditions.filter(row => row.start < end && row.end > start).map(row => row.text);
    const conditionCoverage = coverageFor(conditions.map(row => ({ ...row, value: row.text ? 1 : null })), start, end).status;
    const storm = descriptions.find(text => /thunderstorm|thunder|lightning/i.test(text));
    const day = {
      date, high_f: temperature.status === 'complete' ? temperature.max : null, low_f: temperature.status === 'complete' ? temperature.min : null,
      rain_chance: chance.max, precip_inches: precip.value, wind_mph: wind.max, gust_mph: gust.max,
      description: storm || descriptions.find(Boolean) || 'Forecast description unavailable', thunderstorm_possible: Boolean(storm),
      wind_coverage: wind.status, gust_coverage: gust.status, temperature_coverage: temperature.status, condition_coverage: conditionCoverage,
      rain_coverage: chance.status, precip_coverage: precip.status,
      hourly_hours_expected: (end - start) / HOUR, hourly_hours_available: round(wind.covered / HOUR),
      rain_chance_basis: 'Maximum forecast-period precipitation probability',
    };
    return { ...day, trade_guidance: tradeWeatherGuidance(day) };
  });
  const assessment = assessConstructionWeather(days, zip);
  for (const day of days.filter(day => day.thunderstorm_possible)) assessment.risks.push({ type: 'lightning', severity: 'high', date: day.date, impacted_work: ['concrete', 'roofing', 'trenching', 'exterior work'], note: 'Thunderstorms are forecast; review lightning shelter and work-stop procedures.' });
  if (assessment.risks.some(risk => risk.severity === 'high')) assessment.risk_level = 'high';
  if (!assessment.risks.length && days.some(day => [day.wind_coverage, day.temperature_coverage, day.rain_coverage, day.condition_coverage].some(coverage => coverage !== 'complete'))) assessment.risk_level = 'unknown';
  return {
    zip, provider: 'nws', source: SOURCE, location: location.label, scope: location.scope || 'configured',
    checked_at: now.toISOString(), source_updated_at: new Date(updated).toISOString(), expires_at: new Date(Math.min(now.getTime() + CACHE_MS, updated + MAX_SOURCE_AGE)).toISOString(),
    current: null, window, days, ...assessment, crew_message: planningCrewMessage(days, zip, window, SOURCE), assessment_source: 'ABQ ADU planning rules',
    attribution: { service_name: SOURCE, source_url: 'https://www.weather.gov/abq/', legal_url: 'https://www.weather.gov/disclaimer' },
  };
}
async function requestJson(url, fetchImpl) {
  const controller = new AbortController(); let timer; let timeout = false;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' }, redirect: 'error', signal: controller.signal });
        if (!response?.ok || response.redirected) throw invalid();
        return response.json();
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { timeout = true; controller.abort(); reject(failure(504, 'National Weather Service took too long to respond. Try again later.')); }, 10000); }),
    ]);
  } catch {
    throw failure(timeout ? 504 : 502, timeout ? 'National Weather Service took too long to respond. Try again later.' : 'National Weather Service could not complete the forecast request. Try again later.');
  } finally { clearTimeout(timer); }
}
async function fetchNwsForecast(zip, { env = process.env, fetchImpl = global.fetch, now } = {}) {
  if (typeof zip !== 'string' || !/^\d{5}$/.test(zip)) throw failure(400, 'Enter a five-digit ZIP code.');
  const locations = readLocations(env);
  if (!Object.hasOwn(locations, zip)) throw failure(409, 'This ZIP code needs a verified location in NWS_LOCATIONS_JSON on the server. Only 87106 has a built-in Albuquerque city reference.');
  if (typeof fetchImpl !== 'function') throw failure(503, 'National Weather Service requires a server runtime with fetch support.');
  const location = locations[zip]; const checked = now || new Date();
  if (!caches.has(fetchImpl)) caches.set(fetchImpl, new Map());
  const cache = caches.get(fetchImpl);
  const key = JSON.stringify([zip, location, localDate(checked, location.timeZone)]);
  const cached = cache.get(key);
  if (cached?.pending) return structuredClone(await cached.pending);
  if (cached?.value && Date.parse(cached.value.checked_at) <= checked.getTime() && Date.parse(cached.value.expires_at) > checked.getTime()) return structuredClone(cached.value);
  const entry = {};
  entry.pending = (async () => {
    const points = await requestJson(`${ORIGIN}/points/${location.latitude},${location.longitude}`, fetchImpl);
    const hourlyUrl = officialUrl(points?.properties?.forecastHourly);
    const gridUrl = officialUrl(points?.properties?.forecastGridData);
    if (points.properties.timeZone !== location.timeZone) throw failure(409, 'The configured NWS location time zone does not match the forecast location.');
    const [hourly, grid] = await Promise.all([requestJson(hourlyUrl, fetchImpl), requestJson(gridUrl, fetchImpl)]);
    const value = normalizeNwsForecast(hourly, grid, zip, location, now || new Date());
    entry.value = value;
    return value;
  })();
  if (cache.size >= 64) cache.delete(cache.keys().next().value);
  cache.set(key, entry);
  try { return structuredClone(await entry.pending); }
  catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
  finally { delete entry.pending; }
}

module.exports = { fetchNwsForecast, getNwsStatus, normalizeNwsForecast };
