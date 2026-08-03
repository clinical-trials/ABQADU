function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(node, fallback = '') {
  if (Array.isArray(node) && node[0]?.value) return node[0].value;
  if (node?.value) return node.value;
  return fallback;
}

function maxHourly(day, key) {
  return Math.max(0, ...(day.hourly || []).map(hour => num(hour[key], 0)));
}

function sumHourly(day, key) {
  return (day.hourly || []).reduce((sum, hour) => sum + num(hour[key], 0), 0);
}

function normalizeWttrForecast(payload, zip) {
  const nearest = payload?.nearest_area?.[0] || {};
  const area = textValue(nearest.areaName, zip);
  const region = textValue(nearest.region, '');
  const location = [area, region].filter(Boolean).join(', ');
  const currentRaw = payload?.current_condition?.[0] || {};

  const current = {
    temp_f: num(currentRaw.temp_F),
    wind_mph: num(currentRaw.windspeedMiles),
    wind_direction: currentRaw.winddir16Point || '',
    precip_inches: num(currentRaw.precipInches),
    description: textValue(currentRaw.weatherDesc, 'Current conditions unavailable'),
  };

  const days = (payload?.weather || []).slice(0, 3).map(day => {
    const maxRainChance = maxHourly(day, 'chanceofrain');
    const precipInches = sumHourly(day, 'precipInches');
    const maxWind = maxHourly(day, 'windspeedMiles');
    const maxGust = maxHourly(day, 'WindGustMiles');
    return {
      date: day.date,
      high_f: num(day.maxtempF),
      low_f: num(day.mintempF),
      rain_chance: maxRainChance,
      precip_inches: Number(precipInches.toFixed(2)),
      wind_mph: maxWind,
      gust_mph: maxGust,
      description: textValue(day.hourly?.[0]?.weatherDesc, ''),
    };
  });

  const risks = [];
  days.forEach(day => {
    if (day.rain_chance >= 60 || day.precip_inches >= 0.1) {
      const severity = day.rain_chance >= 75 || day.precip_inches >= 0.15 ? 'high' : 'moderate';
      risks.push({
        type: 'rain',
        severity,
        date: day.date,
        delay_days: severity === 'high' ? 7 : 2,
        impacted_work: ['site work', 'trenching', 'concrete', 'exterior work'],
        note: `Rain risk ${day.rain_chance}% with ${day.precip_inches}" forecast precipitation.`,
      });
    }

    if (day.gust_mph >= 35 || day.wind_mph >= 25) {
      const severity = day.gust_mph >= 40 ? 'high' : 'moderate';
      risks.push({
        type: 'wind',
        severity,
        date: day.date,
        delay_days: severity === 'high' ? 2 : 1,
        impacted_work: ['roofing', 'panel setting', 'material delivery'],
        note: `Wind risk ${day.wind_mph} mph sustained with gusts to ${day.gust_mph} mph.`,
      });
    }

    if (day.low_f <= 35) {
      risks.push({
        type: 'freeze',
        severity: day.low_f <= 28 ? 'high' : 'moderate',
        date: day.date,
        delay_days: day.low_f <= 28 ? 2 : 1,
        impacted_work: ['slab prep', 'concrete', 'exterior plumbing'],
        note: `Low temperature ${day.low_f}F may affect curing and exterior work.`,
      });
    }

    if (day.high_f >= 100) {
      risks.push({
        type: 'heat',
        severity: 'moderate',
        date: day.date,
        delay_days: 1,
        impacted_work: ['roofing', 'exterior finish', 'crew productivity'],
        note: `High temperature ${day.high_f}F may require earlier shifts and hydration planning.`,
      });
    }
  });

  const delayDays = Math.max(0, ...risks.map(risk => risk.delay_days));
  const riskLevel = risks.some(risk => risk.severity === 'high') || delayDays >= 7
    ? 'high'
    : risks.length
      ? 'moderate'
      : 'low';
  const impacted = [...new Set(risks.flatMap(risk => risk.impacted_work))];
  const crewMessage = risks.length
    ? `Weather risk for ${zip}: ${riskLevel.toUpperCase()} risk. Plan up to ${delayDays} day(s) of schedule impact. Watch ${impacted.join(', ')}.`
    : `Weather risk for ${zip}: LOW risk. Keep crews on the current critical path.`;

  return {
    zip,
    source: 'wttr.in',
    location,
    checked_at: new Date().toISOString(),
    current,
    days,
    risks,
    risk_level: riskLevel,
    delay_days: delayDays,
    crew_message: crewMessage,
  };
}

async function fetchWttrForecast(zip, fetchImpl = global.fetch) {
  const cleanZip = String(zip || '').trim() || '87106';
  if (!fetchImpl) throw new Error('Fetch is not available in this Node runtime.');
  const url = `https://wttr.in/${encodeURIComponent(cleanZip)}?format=j1`;
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'ABQ-ADU-Weather-Delay-Assessor/9.2' },
  });
  if (!response.ok) {
    const error = new Error(`wttr.in returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  return normalizeWttrForecast(payload, cleanZip);
}

module.exports = {
  fetchWttrForecast,
  normalizeWttrForecast,
};
