const fs = require('node:fs/promises');
const { storePath } = require('./commandCenterStore');
const weatherProvider = require('./weatherProvider');
const { tradeWeatherGuidance } = require('./tradeWeatherPlanning');
const { MODEL_CATALOG } = require('./modelCatalog');
const { utilitySummary } = require('./gisReview');

const TIME_ZONE = 'America/Denver';
const TRADES = ['concrete', 'roofing', 'excavation', 'general'];
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const number = value => (typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null;
const text = (value, limit = 200) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
function localDate(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = name => parts.find(item => item.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function plusDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
function calendarDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
const spokenDate = date => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: TIME_ZONE }).format(new Date(`${date}T12:00:00Z`));
const unknownPlanning = dates => dates.map(date => ({ date, level: 'unknown', label: 'More forecast data needed', reasons: ['A current, complete forecast is required before confirming work.'] }));

async function weatherBriefing(project, trade, now, fetchForecast, env) {
  const dates = Array.from({ length: 4 }, (_, index) => plusDays(localDate(now), index + 1));
  const addressZip = text(project.address, 500).match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5);
  const explicitZip = text(project.weather_zip || project.zip, 10);
  const cityFallback = !explicitZip && !addressZip && /\balbuquerque\b/i.test(project.address || '');
  const zip = explicitZip || addressZip || (cityFallback ? '87106' : null);
  const configured = weatherProvider.getWeatherStatus(env);
  const result = {
    status: 'unavailable', message: 'Current forecast unavailable. Confirm the job location and check weather before scheduling.',
    forecast: null, planning: unknownPlanning(dates), zip, location_basis: cityFallback ? 'Albuquerque city reference' : 'Job ZIP code',
    source_status: { provider: configured.provider, source: configured.source, checked_at: null, source_updated_at: null },
  };
  if (!zip || !/^\d{5}$/.test(zip)) return result;
  try {
    const forecast = await fetchForecast(zip, { env, now });
    if (!forecast || !Array.isArray(forecast.days)) return result;
    result.source_status = { provider: forecast.provider || configured.provider, source: forecast.source || configured.source, checked_at: forecast.checked_at || null, source_updated_at: forecast.source_updated_at || null };
    const checked = Date.parse(forecast.checked_at), expires = Date.parse(forecast.expires_at);
    const issued = forecast.source_updated_at ? Date.parse(forecast.source_updated_at) : checked;
    if (!Number.isFinite(checked) || !Number.isFinite(expires) || !Number.isFinite(issued)
      || checked > now.getTime() + 5 * 60000 || issued > now.getTime() + 5 * 60000
      || now.getTime() - issued >= 24 * 60 * 60000 || expires <= now.getTime()
      || forecast.window?.start_date !== dates[0] || forecast.window?.end_date !== dates[3]
      || forecast.window?.time_zone !== TIME_ZONE) {
      return { ...result, status: 'stale', message: 'The available forecast is stale or covers a different planning window. Refresh it before confirming work.' };
    }
    const days = dates.map(date => {
      const supplied = forecast.days.find(day => day.date === date);
      const day = { ...(supplied || {}), date };
      for (const field of ['high_f', 'low_f', 'rain_chance', 'precip_inches', 'wind_mph', 'gust_mph']) day[field] = Number.isFinite(day[field]) ? day[field] : null;
      if (day.wind_mph === null) day.wind_coverage = 'missing';
      if (!supplied) day.condition_coverage = 'missing';
      day.trade_guidance = tradeWeatherGuidance(day);
      return day;
    });
    const partial = days.some(day => ['high_f', 'low_f', 'rain_chance', 'wind_mph'].some(field => day[field] === null)
      || ['wind_coverage', 'temperature_coverage', 'rain_coverage', 'condition_coverage'].some(field => day[field] && day[field] !== 'complete'));
    return { ...result, status: partial ? 'partial' : 'current', message: partial ? 'Some forecast coverage is missing. Review each dated trade recommendation.' : 'Current four-day planning forecast. Contractor confirmation is required before changing work.',
      forecast: { ...forecast, days }, planning: days.map(day => ({ date: day.date, ...day.trade_guidance[trade] })) };
  } catch { return result; }
}

function projectControls(project, utilities) {
  const readiness = [
    ['site_visit_status', 'Site visit', ['Completed']], ['setbacks_site_plan_status', 'Site plan and setbacks', ['Confirmed', 'Completed']],
    ['engineering_status', 'Engineering review', ['Confirmed', 'Completed', 'Not required']],
  ].map(([field, title, accepted]) => ({ field, title, status: accepted.includes(project[field]) ? 'confirmed' : project[field] ? 'review' : 'unknown', detail: text(project[field]) || 'Not recorded' }));
  readiness.splice(1, 0, ...utilities.items.map(item => ({ field: `utility_reviews.${item.id}`, title: item.title,
    status: item.status === 'confirmed' ? 'confirmed' : item.status === 'unknown' ? 'unknown' : 'review',
    detail: item.status === 'confirmed' ? 'Builder findings recorded; provider approvals remain separate.'
      : utilities.status === 'stale' ? 'Prior findings are stale for this address.'
        : ({ unknown: 'No current builder findings recorded.', in_review: 'Builder review in progress.', needs_work: 'Work or resolution still needed.' })[item.status] } )));
  const selected = MODEL_CATALOG.find(model => model.id === project.model_id)
    || MODEL_CATALOG.find(model => [model.name, model.family, ...(model.aliases || [])].some(name => name.toLowerCase() === text(project.model).toLowerCase()));
  const sqft = number(project.sqft), bid = number(project.bid_total), low = number(project.cogs_low), high = number(project.cogs_high);
  const validCosts = bid !== null && bid > 0 && low !== null && low >= 0 && high !== null && high >= low;
  const drafts = Array.isArray(project.invoice_drafts) ? project.invoice_drafts : [];
  const first = drafts.find(draft => /preconstruction/i.test(`${draft.label || ''} ${draft.draw_type || ''}`));
  return {
    readiness, utilities,
    model: { status: !selected ? 'unknown' : sqft === selected.sqft ? 'confirmed' : 'review', name: text(project.model) || null, catalog_name: selected?.name || null, sqft, catalog_sqft: selected?.sqft || null },
    margin: { status: validCosts ? 'estimated' : 'unknown', bid_total: bid, cogs_low: low, cogs_high: high, price_per_sqft: bid !== null && sqft > 0 ? Math.round(bid / sqft) : null, profit_low: validCosts ? bid - high : null, profit_high: validCosts ? bid - low : null },
    preconstruction: { status: !first ? 'missing' : number(first.amount) === 10000 ? 'draft_present' : 'review', amount: first ? number(first.amount) : null, payment_status: 'unknown' },
    invoices: { draft_count: drafts.length, payment_status: 'unknown', message: 'Saved invoice drafts are not evidence of payment. Review the billing ledger for issued invoices and balances.' },
  };
}

async function linkedSchedule(scheduleProjectId, now, query, savedLink = false) {
  const base = { status: 'unlinked', project_id: null, project_name: null, critical: [], late: [], upcoming: [], recommendations: [], planned_finish: null, forecast_finish: null, weather_exposure: [], weather_exposure_basis: 'Potential exposure only: confirm whether the selected trade applies to each activity. Candidate hold dates are calendar days; working calendars are not known. Any comparison with recorded float is a scenario, not a forecast delay.', basis: 'Stored activity dates and float; no schedule recalculation or automatic change.' };
  const unknownRisks = { status: 'unlinked', open_count: null, items: [] };
  if (scheduleProjectId === undefined || scheduleProjectId === null || scheduleProjectId === '') return { schedule: { ...base, recommendations: ['Select the matching schedule project to review its critical path and risk register.'] }, risks: unknownRisks };
  if (!['string', 'number'].includes(typeof scheduleProjectId) || !/^[1-9]\d*$/.test(String(scheduleProjectId)) || !Number.isSafeInteger(Number(scheduleProjectId))) fail(400, 'Choose a valid schedule project.');
  const id = Number(scheduleProjectId);
  try {
    const project = (await query('SELECT id, name, start_date FROM projects WHERE id=$1', [id])).rows[0];
    if (!project) fail(404, 'The selected schedule project does not exist.');
    const [activityResult, riskResult] = await Promise.all([
      query('SELECT id, name, planned_start, planned_finish, actual_finish, pct_complete, total_float, free_float, is_critical FROM activities WHERE project_id=$1 ORDER BY sort_order, id', [id]),
      query('SELECT id, title, status, category, probability, impact, mitigation_plan FROM risks WHERE project_id=$1 ORDER BY id', [id]),
    ]);
    const today = localDate(now), end = plusDays(today, 7);
    const activities = activityResult.rows.filter(row => !row.actual_finish && !(number(row.pct_complete) >= 100)).map(row => ({
      id: row.id, name: text(row.name), planned_start: calendarDate(row.planned_start), planned_finish: calendarDate(row.planned_finish), pct_complete: number(row.pct_complete), total_float: number(row.total_float), free_float: number(row.free_float), is_critical: row.is_critical === true || number(row.total_float) !== null && number(row.total_float) <= 0,
    }));
    const critical = activities.filter(row => row.is_critical), late = activities.filter(row => row.planned_finish && row.planned_finish < today);
    const upcoming = activities.filter(row => row.planned_start && row.planned_start >= today && row.planned_start <= end);
    const finishes = activityResult.rows.map(row => calendarDate(row.planned_finish)).filter(Boolean).sort();
    const recommendations = [];
    if (late.length) recommendations.push(`${late.length} unfinished activities are past their planned finish. Verify actual progress before approving recovery dates.`);
    if (critical.length) recommendations.push(`Review ${critical.length} unfinished activities marked critical or with no remaining float before moving crews.`);
    if (activities.some(row => row.total_float === null)) recommendations.push('Some activity float is unavailable. Recalculate the schedule after reviewing dependencies and calendars.');
    if (!activities.length) recommendations.push(activityResult.rows.length ? 'No unfinished activities are recorded. Confirm final completion with the team.' : 'No activities are recorded for this schedule project.');
    recommendations.push('A finish-date forecast requires reviewed progress, dependencies and calendars; no delay duration has been assumed.');
    const items = riskResult.rows.filter(row => !['closed', 'resolved', 'cancelled'].includes(String(row.status || '').toLowerCase())).map(row => {
      const probability = number(row.probability), impact = number(row.impact);
      return { id: row.id, title: text(row.title), status: text(row.status) || 'unknown', category: text(row.category) || null, probability, impact,
        score: probability >= 1 && probability <= 5 && impact >= 1 && impact <= 5 ? probability * impact : null, mitigation: text(row.mitigation_plan, 500) || null };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return { activities, schedule: { ...base, status: 'available', project_id: id, project_name: text(project.name), critical, late, upcoming, recommendations, planned_finish: finishes.at(-1) || null }, risks: { status: 'available', open_count: items.length, items } };
  } catch (error) {
    if (error.status === 404 && !savedLink) throw error;
    const recommendation = error.status === 404
      ? 'The linked schedule project no longer exists. Review the saved association before choosing another schedule.'
      : 'Schedule data is temporarily unavailable. Check the saved schedule before committing dates.';
    return { schedule: { ...base, status: 'unavailable', project_id: id, recommendations: [recommendation] }, risks: { ...unknownRisks, status: 'unavailable' } };
  }
}

function addWeatherExposure(linked, weather, trade) {
  const concerns = weather.planning.filter(day => ['hold', 'review'].includes(day.level));
  if (linked.schedule.status !== 'available' || !['current', 'partial'].includes(weather.status) || !concerns.length) return;
  linked.schedule.weather_exposure = linked.activities.flatMap(activity => {
    if (!activity.planned_start || !activity.planned_finish || activity.planned_finish < activity.planned_start) return [];
    const overlap = concerns.filter(day => day.date >= activity.planned_start && day.date <= activity.planned_finish);
    if (!overlap.length) return [];
    const holds = overlap.filter(day => day.level === 'hold').map(day => day.date);
    return [{ activity_id: activity.id, name: activity.name, planned_start: activity.planned_start, planned_finish: activity.planned_finish,
      is_critical: activity.is_critical, total_float: activity.total_float, selected_trade: trade,
      dates: overlap.map(day => day.date), hold_dates: holds, review_dates: overlap.filter(day => day.level === 'review').map(day => day.date),
      candidate_hold_day_count: holds.length,
      scenario_days_beyond_float: activity.total_float === null ? null : Math.max(0, holds.length - Math.max(0, activity.total_float)),
    }];
  });
  const critical = linked.schedule.weather_exposure.filter(activity => activity.is_critical);
  if (critical.length) linked.schedule.recommendations.unshift(`Potential ${trade} exposure overlaps ${critical.length} critical activities. Confirm the trade applies, then consider resequencing indoor or unblocked tasks with the contractor; no work dates have changed.`);
}

function createProjectBriefingService({
  readState = async () => JSON.parse(await fs.readFile(storePath, 'utf8')),
  fetchForecast = weatherProvider.fetchForecast,
  query = (...args) => require('../db').pool.query(...args),
  now = () => new Date(), env = process.env,
} = {}) {
  return async function getProjectBriefing(projectId, { trade = 'general', scheduleProjectId } = {}) {
    if (typeof projectId !== 'string' || !projectId || projectId.length > 200) fail(400, 'Choose a saved project.');
    if (!TRADES.includes(trade)) fail(400, 'Choose concrete, roofing, excavation or general work.');
    let state;
    try { state = await readState(); } catch { fail(503, 'Saved project data is temporarily unavailable.'); }
    const project = state.projects?.find(row => row.id === projectId);
    if (!project) fail(404, 'The saved project does not exist.');
    const generated = now();
    const savedLink = scheduleProjectId === undefined
      ? (Array.isArray(state.schedule_links) ? state.schedule_links : []).find(link => link.project_id === projectId) : null;
    const selectedSchedule = scheduleProjectId === undefined ? savedLink?.schedule_project_id : scheduleProjectId;
    const linked = await linkedSchedule(selectedSchedule, generated, query, Boolean(savedLink));
    const weather = await weatherBriefing(project, trade, generated, fetchForecast, env);
    addWeatherExposure(linked, weather, trade);
    const utilities = utilitySummary(state, project);
    const controls = projectControls(project, utilities), next_actions = [];
    const add = (id, priority, title, detail) => next_actions.push({ id, priority, title, detail });
    if (linked.schedule.late.length) add('late-work', 'high', 'Verify work past its planned finish', `Check actual progress on ${linked.schedule.late.slice(0, 2).map(activity => activity.name).join(' and ')} before approving recovery dates.`);
    const exposedCritical = linked.schedule.weather_exposure.filter(activity => activity.is_critical);
    if (exposedCritical.length) add('weather-exposure', 'high', 'Review weather exposure on critical work', `Confirm ${trade} applies to ${exposedCritical.slice(0, 2).map(activity => activity.name).join(' and ')}; consider indoor or unblocked tasks with the contractor.`);
    const holds = weather.planning.filter(day => day.level === 'hold');
    if (holds.length) add('weather', 'high', `Review ${trade} weather holds`, `Hold candidates: ${holds.map(day => day.date).join(', ')}. Obtain contractor confirmation; dates have not changed.`);
    else if (weather.status !== 'current' || weather.planning.some(day => day.level !== 'plan')) add('weather', 'medium', 'Review the forecast before confirming crews', weather.message);
    const highRisks = linked.risks.items.filter(risk => risk.score !== null && risk.score >= 15);
    if (highRisks.length) add('risks', 'high', 'Review the highest recorded risks', highRisks.slice(0, 3).map(risk => risk.title).join('; '));
    if (utilities.status !== 'recorded') {
      const open = utilities.items.filter(item => item.status !== 'confirmed').map(item => `${item.title}: ${{ unknown: 'not recorded', in_review: 'in review', needs_work: 'needs work' }[item.status]}`).join('; ');
      add('utilities', 'high', 'Review water, electric and sewer before the final bid', utilities.status === 'stale'
        ? 'Restart water, electric and sewer review for the current address before committing the final bid. Prior findings do not apply.'
        : `${open}. Record source, date and findings before committing the final bid; provider approvals remain separate.`);
    }
    const pending = controls.readiness.filter(check => check.status !== 'confirmed');
    if (pending.length) add('readiness', 'medium', 'Complete the site-readiness checks', pending.map(check => check.title).join(', '));
    if (controls.model.status !== 'confirmed') add('model', 'medium', 'Confirm the model and measured area', 'Reconcile the saved job with the approved plan before pricing; saved dimensions have not changed.');
    if (controls.margin.status === 'unknown' || controls.margin.profit_low <= 0) add('costs', 'high', 'Review the job costs and bid total', 'A reliable positive gross-profit range is not established by the saved costs.');
    if (controls.preconstruction.status !== 'draft_present') add('preconstruction', 'medium', 'Review the preconstruction invoice draft', 'Confirm the agreed preconstruction amount and actual ledger balance before issuing work.');
    if (linked.schedule.status !== 'available') add('schedule', 'medium', linked.schedule.status === 'unlinked' ? 'Link the matching schedule project' : 'Restore schedule access', linked.schedule.recommendations[0]);
    const rank = { high: 0, medium: 1, low: 2 };
    next_actions.sort((a, b) => rank[a.priority] - rank[b.priority]);
    const headline = next_actions.length ? `${next_actions.length} items to review before committing the next work window` : 'Review the recorded plan and confirm the next work window';
    const source = weather.source_status.source || 'weather provider';
    const concern = weather.planning.find(day => ['hold', 'review'].includes(day.level));
    const weatherSpeech = ['unavailable', 'stale'].includes(weather.status) ? `The current forecast is ${weather.status}.` : `${source} covers the next four days${weather.status === 'partial' ? ', with missing coverage' : ''}. ${concern ? `${spokenDate(concern.date)}: ${trade} ${concern.level === 'hold' ? 'hold candidate' : 'weather review needed'}.` : 'Confirm daily site conditions with the crew.'}`;
    const criticalSpeech = exposedCritical.length ? `${text(exposedCritical[0].name, 60)} has potential weather exposure and is critical; confirm this trade applies.` : '';
    const utilitySpeech = utilities.status === 'recorded' ? 'Water, electric and sewer findings are recorded; provider approvals remain separate.'
      : `Water, electric and sewer: ${utilities.status === 'stale' ? 'prior findings are stale' : 'open questions remain'}; resolve these before the final bid.`;
    const nextSpeech = next_actions.length ? `Next: ${text(next_actions[0].detail, 220)}` : 'Next: Confirm actual progress and the next work window with the contractor.';
    const name = text(project.name || project.client, 80) || 'Selected project';
    const narration = `${name}. ${headline}. ${weatherSpeech} ${criticalSpeech} ${utilitySpeech} ${nextSpeech} ${linked.schedule.status === 'unlinked' ? 'No schedule is linked to this briefing.' : ''} No work dates or messages have been changed.`.replace(/\s+/g, ' ').trim();
    const recent_activity = (Array.isArray(state.activity_events) ? state.activity_events : []).filter(event => event.project_id === projectId).slice(-5).reverse().map(event => ({ id: event.id, type: event.type, summary: text(event.summary, 500), actor_id: event.actor_id, occurred_at: event.occurred_at }));
    return { generated_at: generated.toISOString(), time_zone: TIME_ZONE, project: { id: project.id, name, model: text(project.model) || null, sqft: number(project.sqft) }, trade, headline, narration, next_actions, weather, schedule: linked.schedule, risks: linked.risks, controls, recent_activity };
  };
}

module.exports = { createProjectBriefingService };
