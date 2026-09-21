const crypto = require('crypto');
const { assessConstructionWeather } = require('./weatherIntelligence');
const { hasThunderstorm, tradeWeatherGuidance, planningCrewMessage } = require('./tradeWeatherPlanning');

const ORIGIN = 'https://weatherkit.apple.com';
const LEGAL_URL = 'https://developer.apple.com/weatherkit/data-source-attribution/';
const REQUIRED_ENV = [
  'WEATHERKIT_TEAM_ID', 'WEATHERKIT_KEY_ID', 'WEATHERKIT_SERVICE_ID',
  'WEATHERKIT_PRIVATE_KEY', 'WEATHERKIT_LOCATIONS_JSON',
];
const REQUEST_TIMEOUT_MS = 10000;

function failure(status, message) {
  return Object.assign(new Error(message), { status });
}
function invalidResponse() {
  return failure(502, 'Apple Weather returned incomplete or unavailable forecast data. Try again later.');
}
function numeric(value, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw invalidResponse();
  return value;
}
function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw invalidResponse();
  return new Date(value);
}
function round(value, places = 1) { return Number(value.toFixed(places)); }
function mph(kph) { return round(numeric(kph, 0) / 1.609344); }
function fahrenheit(celsius) { return round(numeric(celsius) * 9 / 5 + 32); }
function inches(mm) { return round(numeric(mm, 0) / 25.4, 2); }
function description(code) {
  if (typeof code !== 'string' || !/^[A-Za-z]{1,80}$/.test(code)) throw invalidResponse();
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}
function validLocationMap(raw) {
  const locations = JSON.parse(raw);
  if (!locations || typeof locations !== 'object' || Array.isArray(locations)) throw new Error('Invalid locations');
  const entries = Object.entries(locations);
  if (!entries.length || entries.length > 1000) throw new Error('Invalid locations');
  for (const [zip, location] of entries) {
    if (!/^\d{5}$/.test(zip) || !location || typeof location !== 'object') throw new Error('Invalid locations');
    numeric(location.latitude, -90, 90);
    numeric(location.longitude, -180, 180);
    if (typeof location.label !== 'string' || !location.label.trim() || location.label.length > 120) throw new Error('Invalid label');
    if (typeof location.timeZone !== 'string' || !location.timeZone.trim()) throw new Error('Invalid timezone');
    new Intl.DateTimeFormat('en-US', { timeZone: location.timeZone }).format();
  }
  return locations;
}
function readConfiguration(env) {
  const invalid = new Set(REQUIRED_ENV.filter(name => typeof env[name] !== 'string' || !env[name].trim()));
  for (const name of ['WEATHERKIT_TEAM_ID', 'WEATHERKIT_KEY_ID']) {
    if (!/^[A-Z0-9]{10}$/.test(env[name] || '')) invalid.add(name);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/.test(env.WEATHERKIT_SERVICE_ID || '')) invalid.add('WEATHERKIT_SERVICE_ID');
  let key;
  try {
    key = crypto.createPrivateKey((env.WEATHERKIT_PRIVATE_KEY || '').replace(/\\n/g, '\n'));
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Invalid key');
  } catch { invalid.add('WEATHERKIT_PRIVATE_KEY'); }
  let locations;
  try { locations = validLocationMap(env.WEATHERKIT_LOCATIONS_JSON); } catch { invalid.add('WEATHERKIT_LOCATIONS_JSON'); }
  return { missing: REQUIRED_ENV.filter(name => invalid.has(name)), key, locations };
}
function getWeatherKitStatus(env = process.env) {
  const { missing } = readConfiguration(env);
  return { configured: missing.length === 0, missing, required_env: [...REQUIRED_ENV] };
}
function requireConfiguration(env) {
  const config = readConfiguration(env);
  if (config.missing.length) {
    throw failure(503, `Apple Weather setup is required. Configure valid ${config.missing.join(', ')} on the server.`);
  }
  return config;
}
function signToken(env, key, now) {
  const issued = Math.floor(now.getTime() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'ES256', kid: env.WEATHERKIT_KEY_ID, id: `${env.WEATHERKIT_TEAM_ID}.${env.WEATHERKIT_SERVICE_ID}` });
  const payload = encode({ iss: env.WEATHERKIT_TEAM_ID, sub: env.WEATHERKIT_SERVICE_ID, iat: issued, exp: issued + 300 });
  const signed = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(signed), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${signed}.${signature}`;
}
function createWeatherKitToken(env = process.env, now = new Date()) {
  return signToken(env, requireConfiguration(env).key, now);
}
function safeAppleUrl(value, mark = false) {
  if (typeof value !== 'string' || !value.trim()) throw invalidResponse();
  let url;
  try { url = new URL(value, mark ? ORIGIN : undefined); } catch { throw invalidResponse(); }
  const officialHost = url.hostname === 'apple.com' || url.hostname.endsWith('.apple.com');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !officialHost || (mark && url.origin !== ORIGIN)) throw invalidResponse();
  return url.href;
}
function localDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(value => value.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function plusDays(day, count) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
function windDirection(degrees) {
  if (degrees == null) return '';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(numeric(degrees, 0, 360) / 22.5) % 16];
}
function normalizeWeatherKitForecast(payload, branding, zip, location, now = new Date()) {
  const datasets = [payload?.currentWeather, payload?.forecastDaily, payload?.forecastHourly];
  const legalUrls = [];
  const expires = [];
  for (const dataset of datasets) {
    const metadata = dataset?.metadata;
    if (!metadata || metadata.temporarilyUnavailable === true || (metadata.units != null && metadata.units !== 'm')) throw invalidResponse();
    const read = dateValue(metadata.readTime);
    const expiration = dateValue(metadata.expireTime);
    if (expiration <= now || expiration <= read || read.getTime() > now.getTime() + 60000) throw invalidResponse();
    expires.push(expiration.getTime());
    if (metadata.attributionURL != null) legalUrls.push(safeAppleUrl(metadata.attributionURL));
  }
  if (typeof branding?.serviceName !== 'string' || !branding.serviceName.trim() || branding.serviceName.length > 100) throw invalidResponse();
  const attribution = {
    service_name: branding.serviceName,
    mark_url: safeAppleUrl(branding['logoLight@2x'], true),
    legal_url: legalUrls[0] || LEGAL_URL,
  };
  const rawCurrent = payload.currentWeather;
  const current = {
    temp_f: fahrenheit(rawCurrent.temperature),
    wind_mph: mph(rawCurrent.windSpeed),
    wind_direction: windDirection(rawCurrent.windDirection),
    // Current Weather reports a rate, not an accumulated precipitation amount.
    precip_inches: null,
    precip_inches_per_hour: inches(rawCurrent.precipitationIntensity),
    description: description(rawCurrent.conditionCode),
    observed_at: dateValue(rawCurrent.asOf).toISOString(),
  };
  const tomorrow = plusDays(localDate(now, location.timeZone), 1);
  const window = { start_date: tomorrow, end_date: plusDays(tomorrow, 3), time_zone: location.timeZone };
  if (!Array.isArray(payload.forecastDaily.days) || !Array.isArray(payload.forecastHourly.hours)) throw invalidResponse();
  const rawDays = payload.forecastDaily.days.map(day => ({ ...day, date: localDate(dateValue(day?.forecastStart), location.timeZone) }))
    .filter(day => day.date >= tomorrow && day.date <= window.end_date).sort((a, b) => a.date.localeCompare(b.date));
  if (rawDays.length !== 4 || rawDays.some((day, index) => day.date !== plusDays(tomorrow, index))) throw invalidResponse();
  const hourly = [];
  for (const hour of payload.forecastHourly.hours) {
    const start = dateValue(hour?.forecastStart);
    const date = localDate(start, location.timeZone);
    if (!rawDays.some(selected => selected.date === date)) continue;
    hourly.push({ start: start.getTime(), wind: mph(hour.windSpeed), gust: hour.windGust == null ? null : mph(hour.windGust), thunderstorm: hasThunderstorm(hour.conditionCode) });
  }
  const days = rawDays.map(day => {
    const start = dateValue(day.forecastStart).getTime();
    const end = dateValue(day.forecastEnd).getTime();
    const expectedHours = (end - start) / 3600000;
    // Use actual local-day boundaries: a DST transition may contain 23 or 25 hours.
    if (![23, 24, 25].includes(expectedHours) || localDate(new Date(end), location.timeZone) !== plusDays(day.date, 1)
      || localDate(new Date(start - 1), location.timeZone) !== plusDays(day.date, -1)
      || localDate(new Date(end - 1), location.timeZone) !== day.date) throw invalidResponse();
    const hours = hourly.filter(hour => hour.start >= start && hour.start < end);
    const covered = new Set(hours.filter(hour => (hour.start - start) % 3600000 === 0).map(hour => hour.start));
    const coverage = covered.size === expectedHours ? 'complete' : hours.length ? 'partial' : 'unavailable';
    const high = fahrenheit(day.temperatureMax);
    const low = fahrenheit(day.temperatureMin);
    if (high < low) throw invalidResponse();
    const gusts = hours.map(hour => hour.gust).filter(value => value !== null);
    const normalized = {
      date: day.date, high_f: high, low_f: low,
      rain_chance: round(numeric(day.precipitationChance, 0, 1) * 100),
      precip_inches: inches(day.precipitationAmount),
      wind_mph: hours.length ? Math.max(...hours.map(hour => hour.wind)) : null,
      gust_mph: gusts.length ? Math.max(...gusts) : null,
      description: description(day.conditionCode),
      wind_coverage: coverage,
      hourly_hours_expected: expectedHours,
      hourly_hours_available: covered.size,
      thunderstorm_possible: hasThunderstorm(day.conditionCode) || hours.some(hour => hour.thunderstorm),
    };
    return { ...normalized, trade_guidance: tradeWeatherGuidance(normalized) };
  });
  const assessment = assessConstructionWeather(days, zip);
  for (const day of days.filter(day => day.thunderstorm_possible)) {
    assessment.risks.push({ type: 'lightning', severity: 'high', date: day.date, impacted_work: ['concrete', 'roofing', 'trenching', 'exterior work'], note: 'Thunderstorms are forecast; review lightning shelter and work-stop procedures.' });
  }
  if (assessment.risks.some(risk => risk.severity === 'high')) assessment.risk_level = 'high';
  if (!assessment.risks.length && days.some(day => day.wind_coverage !== 'complete')) assessment.risk_level = 'unknown';
  return {
    zip, source: 'Apple Weather', provider: 'weatherkit', location: location.label.trim(),
    checked_at: now.toISOString(), expires_at: new Date(Math.min(...expires)).toISOString(),
    current, window, days, ...assessment,
    crew_message: planningCrewMessage(days, zip, window),
    assessment_source: 'ABQ ADU planning rules', attribution,
  };
}
async function requestJson(url, token, fetchImpl) {
  const controller = new AbortController();
  let timer;
  let timedOut = false;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: controller.signal });
        if (!response?.ok || response.redirected) throw failure(502, 'Apple Weather could not complete the forecast request. Check the server configuration and try again.');
        return await response.json();
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(failure(504, 'Apple Weather took too long to respond. Try again later.'));
          controller.abort();
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);
  } catch {
    if (timedOut) throw failure(504, 'Apple Weather took too long to respond. Try again later.');
    throw failure(502, 'Apple Weather could not complete the forecast request. Check the server configuration and try again.');
  } finally { clearTimeout(timer); }
}
async function fetchWeatherKitForecast(zip, { env = process.env, fetchImpl = global.fetch, now } = {}) {
  if (typeof zip !== 'string' || !/^\d{5}$/.test(zip)) throw failure(400, 'Enter a five-digit ZIP code.');
  const config = requireConfiguration(env);
  if (!Object.hasOwn(config.locations, zip)) throw failure(409, 'This ZIP code needs a verified location in WEATHERKIT_LOCATIONS_JSON on the server.');
  if (typeof fetchImpl !== 'function') throw failure(503, 'Apple Weather requires a server runtime with fetch support.');
  const location = config.locations[zip];
  const token = signToken(env, config.key, now || new Date());
  const url = new URL(`/api/v1/weather/en/${location.latitude}/${location.longitude}`, ORIGIN);
  url.searchParams.set('dataSets', 'currentWeather,forecastDaily,forecastHourly');
  url.searchParams.set('timezone', location.timeZone);
  const [payload, branding] = await Promise.all([
    requestJson(url.href, token, fetchImpl), requestJson(`${ORIGIN}/attribution/en`, token, fetchImpl),
  ]);
  return normalizeWeatherKitForecast(payload, branding, zip, location, now || new Date());
}

module.exports = { createWeatherKitToken, getWeatherKitStatus, normalizeWeatherKitForecast, fetchWeatherKitForecast };
