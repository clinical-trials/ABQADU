// ABQ ADU scheduling prompts, not an engineering specification or a work authorization.
const TRADES = ['concrete', 'roofing', 'excavation', 'general'];
const LABELS = { hold: 'Weather hold candidate', review: 'Review before scheduling', plan: 'Plan with site checks', unknown: 'More forecast data needed' };
const RANK = { plan: 0, unknown: 1, review: 2, hold: 3 };

function hasThunderstorm(condition) {
  return /thunderstorm|^strongstorms$/i.test(condition || '');
}

function tradeWeatherGuidance(day) {
  const decisions = Object.fromEntries(TRADES.map(trade => [trade, { level: 'plan', reasons: [] }]));
  function flag(trades, level, reason) {
    for (const trade of trades) {
      const decision = decisions[trade];
      if (RANK[level] > RANK[decision.level]) decision.level = level;
      decision.reasons.push(reason);
    }
  }
  if (day.wind_coverage !== 'complete') {
    const partial = day.wind_coverage === 'partial';
    flag(TRADES, partial ? 'review' : 'unknown', partial
      ? `Hourly wind coverage is partial (${day.hourly_hours_available} of ${day.hourly_hours_expected} hours); the available maximum does not cover the whole day.`
      : 'Hourly wind forecasts are unavailable; wind-sensitive work cannot be assessed.');
  }
  if (day.thunderstorm_possible) {
    flag(TRADES, 'hold', 'Thunderstorms are forecast. Avoid starting exposed tasks that cannot stop quickly; seek a substantial building or enclosed hard-topped vehicle when thunder is heard.');
  }
  const rain = day.rain_chance >= 60 || day.precip_inches >= 0.1;
  const heavyRain = day.rain_chance >= 75 || day.precip_inches >= 0.15;
  if (rain) {
    const reason = `Precipitation chance ${day.rain_chance}% and amount ${day.precip_inches} in. Review timing, surface conditions, protection and drainage.`;
    flag(['concrete', 'excavation'], heavyRain ? 'hold' : 'review', reason);
    flag(['roofing'], 'hold', reason);
    flag(['general'], 'review', reason);
  }
  if (day.wind_mph >= 25 || day.gust_mph >= 35) {
    const reason = `Available wind forecast reaches ${day.wind_mph} mph${day.gust_mph == null ? '; gusts are unavailable' : ` with gusts to ${day.gust_mph} mph`}. Check equipment limits, roof access and loose materials.`;
    flag(['roofing'], 'hold', reason);
    flag(['concrete', 'excavation', 'general'], 'review', reason);
  }
  if (day.low_f <= 35) {
    const reason = `Low temperature ${day.low_f}°F calls for a curing and surface-condition review; concrete mix and protection requirements control the final decision.`;
    flag(['concrete'], day.low_f <= 28 ? 'hold' : 'review', reason);
    flag(['roofing', 'excavation', 'general'], 'review', reason);
  }
  if (day.high_f >= 100) {
    flag(TRADES, 'review', `High temperature ${day.high_f}°F calls for a heat plan, rest and water access; review placement timing and curing protection for concrete.`);
  }
  return Object.fromEntries(Object.entries(decisions).map(([trade, decision]) => {
    if (!decision.reasons.length) decision.reasons.push('No listed rain, wind, temperature or thunderstorm planning trigger is present in the available forecast.');
    const action = decision.level === 'hold'
      ? 'Postpone candidate: obtain contractor confirmation before changing the schedule.'
      : decision.level === 'plan'
        ? 'Plan tentatively; the contractor or site supervisor must confirm current conditions, site readiness and work requirements.'
        : 'The contractor or site supervisor should review the missing data and weather window before confirming work.';
    return [trade, { ...decision, label: LABELS[decision.level], message: `${day.date}: ${action}` }];
  }));
}

function planningCrewMessage(days, zip, window) {
  const lines = days.map(day => {
    const holds = TRADES.filter(trade => day.trade_guidance[trade].level === 'hold');
    const reviews = TRADES.filter(trade => ['review', 'unknown'].includes(day.trade_guidance[trade].level));
    return `${day.date}: ${holds.length ? `hold candidates: ${holds.join(', ')}` : reviews.length ? `review needed: ${reviews.join(', ')}` : 'plan with site checks'}.`;
  });
  return `Weather planning for ${zip}, ${window.start_date} through ${window.end_date} (${window.time_zone}). ${lines.join(' ')} Schedule changes require contractor confirmation. ABQ ADU planning assessment derived from Apple Weather data.`;
}

module.exports = { hasThunderstorm, tradeWeatherGuidance, planningCrewMessage };
