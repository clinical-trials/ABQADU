export const TEXT_TEMPLATES = [
  { id: 'site_visit', label: 'Site visit' }, { id: 'request_quote', label: 'Request quote' },
  { id: 'job_update', label: 'Job update' }, { id: 'weather_hold', label: 'Weather hold review' },
];
const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 250) : '';
const prompts = ['[Add the work to quote.]', '[Add progress and the next step.]'];
export const hasTextPlaceholders = text => prompts.some(prompt => text.includes(prompt));

export function normalizeTextPhone(value) {
  if (typeof value !== 'string') return '';
  const input = value.trim();
  if (input.length > 40 || !/^\+?[\d ().-]+$/.test(input)) return '';
  const digits = input.replace(/\D/g, '');
  if (input.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) && (!digits.startsWith('1') || digits.length === 11) ? `+${digits}` : '';
  if (digits.length === 10) return `+1${digits}`;
  return /^1\d{10}$/.test(digits) ? `+${digits}` : '';
}

export function smsDraftHref(phone, body, appleDevice = false) {
  const recipient = normalizeTextPhone(phone);
  if (!recipient || typeof body !== 'string' || !body.trim() || body.length > 1600) return null;
  const validUnicode = Array.from(body, character => character.length === 1 && /[\uD800-\uDFFF]/.test(character) ? '\uFFFD' : character).join('');
  return `sms:${recipient}${appleDevice ? '&' : '?'}body=${encodeURIComponent(validUnicode)}`;
}

export function makeJobText(type, { project = {}, forecast, fresh = false, dayDate, now = Date.now() } = {}) {
  const site = clean(project.address) || clean(project.client) || 'the ADU project';
  const header = `ABQ ADU · ${site}`;
  let text = '';
  let warning = '';
  let needsWeatherRefresh = false;
  let weatherKey = null;
  if (type === 'site_visit') text = `${header}\nWe would like to arrange a site visit. What times work for you in the next 24–72 hours? We will confirm the date and time together.`;
  if (type === 'request_quote') text = `${header}\nCould you provide a quote for this work?\n${prompts[0]}\nPlease include materials, labor, availability, and any exclusions.`;
  if (type === 'job_update') text = `${header}\n${prompts[1]}\nPlease reply with any questions.`;
  if (type === 'weather_hold') {
    const day = Array.isArray(forecast?.days) ? forecast.days.find(item => item?.date === (dayDate || forecast.days[0]?.date)) : null;
    const expires = forecast?.expires_at ? Date.parse(forecast.expires_at) : null;
    const current = fresh && day && /^\d{4}-\d{2}-\d{2}$/.test(day.date)
      && (expires === null || (Number.isFinite(expires) && expires > now));
    needsWeatherRefresh = !current;
    if (!current) {
      warning = 'Refresh the forecast before preparing or sharing a weather draft.';
      text = `${header}\nA current forecast is needed before reviewing the workday. We will confirm any schedule change together.`;
    } else {
      const rain = Number.isFinite(day.rain_chance) && day.rain_chance >= 0 && day.rain_chance <= 100
        ? `Rain chance up to ${Math.round(day.rain_chance)}%${day.rain_coverage === 'partial' ? ' (incomplete data)' : ''}` : 'Rain unknown';
      const wind = Number.isFinite(day.wind_mph) && day.wind_mph >= 0 && day.wind_mph <= 300
        ? `wind up to ${Math.round(day.wind_mph)} mph${day.wind_coverage !== 'complete' ? ' (incomplete data)' : ''}` : 'wind unknown';
      const temperature = Number.isFinite(day.high_f) && day.high_f >= -150 && day.high_f <= 160
        ? `high ${Math.round(day.high_f)}°F${day.temperature_coverage === 'partial' ? ' (incomplete data)' : ''}` : 'temperature unknown';
      text = `${header}\nWeather review for ${day.date}: ${rain}; ${wind}; ${temperature}.\nSource: ${clean(forecast.source) || 'project forecast'}.\nPlease check site conditions with me before confirming exposed work. We will agree on any hold or schedule change together.`;
      weatherKey = JSON.stringify([day.date, forecast.checked_at, forecast.expires_at, text]);
    }
  }
  return { text, warning, needsWeatherRefresh, weatherKey };
}
