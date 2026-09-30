const { createProjectBriefingService } = require('../src/services/projectBriefing');

const now = new Date('2026-10-01T00:30:00.000Z'); // Still September 30 in Albuquerque.
const job = { id: 'job-a', client: 'Test project', address: 'Albuquerque, NM 87106', model: 'Altura 576', sqft: 576, bid_total: 180000, cogs_low: 90000, cogs_high: 110000, site_visit_status: 'Completed', utility_review_status: 'Confirmed', sewer_confirmation_status: 'Confirmed', setbacks_site_plan_status: 'Confirmed', invoice_drafts: [{ id: 'draft-1', label: 'Preconstruction', amount: 10000, status: 'Draft' }] };
const state = () => ({ projects: [structuredClone(job)], activity_events: [{ id: 'a', project_id: 'job-b', summary: 'Other job', occurred_at: now.toISOString() }, { id: 'b', project_id: 'job-a', type: 'note', summary: 'Inspect slab', occurred_at: now.toISOString() }] });
const forecast = () => ({ provider: 'nws', source: 'National Weather Service', checked_at: now.toISOString(), source_updated_at: '2026-09-30T23:00:00Z', expires_at: '2026-10-01T00:40:00Z', scope: 'city_reference', window: { start_date: '2026-10-01', end_date: '2026-10-04', time_zone: 'America/Denver' }, days: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map(date => ({ date, high_f: 72, low_f: 50, rain_chance: 0, precip_inches: 0, wind_mph: 5, gust_mph: 8, wind_coverage: 'complete', temperature_coverage: 'complete', rain_coverage: 'complete', condition_coverage: 'complete' })) });
function setup(overrides = {}) {
  const readState = jest.fn(async () => state());
  const fetchForecast = jest.fn(async () => forecast());
  const query = jest.fn(async () => { throw new Error('Unexpected database query'); });
  const service = createProjectBriefingService({ now: () => now, readState, fetchForecast, query, ...overrides });
  return { service, readState, fetchForecast, query };
}

test('a JSON job gets a short deterministic briefing without invented schedule or paid status', async () => {
  const { service, query } = setup();
  const result = await service('job-a', { trade: 'concrete' });
  expect(result.generated_at).toBe(now.toISOString());
  expect(result.time_zone).toBe('America/Denver');
  expect(result.weather.planning.map(day => day.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  expect(result.schedule).toMatchObject({ status: 'unlinked', project_id: null, forecast_finish: null });
  expect(result.schedule.weather_exposure).toEqual([]);
  expect(result.risks.open_count).toBeNull();
  expect(result.controls.invoices).toMatchObject({ draft_count: 1, payment_status: 'unknown' });
  expect(result.narration.split(/\s+/).length).toBeLessThanOrEqual(130);
  expect(result.recent_activity.map(event => event.id)).toEqual(['b']);
  expect(query).not.toHaveBeenCalled();
});

test('missing costs and site checks remain unknown rather than zero profit or ready', async () => {
  const { service } = setup({ readState: async () => ({ projects: [{ id: 'job-a', client: 'New job' }] }) });
  const result = await service('job-a');
  expect(result.controls.margin).toMatchObject({ status: 'unknown', profit_low: null, profit_high: null, price_per_sqft: null });
  expect(result.controls.readiness.every(row => row.status !== 'confirmed')).toBe(true);
  expect(result.weather.status).toBe('unavailable');
  expect(result.weather.planning.every(day => day.level === 'unknown')).toBe(true);
});

test.each(['expired', 'old-source', 'wrong-window'])('stale %s weather cannot imply four clear workdays', async reason => {
  const old = forecast();
  if (reason === 'expired') old.expires_at = '2026-09-30T00:00:00Z';
  if (reason === 'old-source') old.source_updated_at = '2026-09-28T00:00:00Z';
  if (reason === 'wrong-window') old.window.start_date = '2026-09-30';
  const { service } = setup({ fetchForecast: async () => old });
  const result = await service('job-a', { trade: 'roofing' });
  expect(result.weather.status).toBe('stale');
  expect(result.weather.forecast).toBeNull();
  expect(result.weather.planning.every(day => day.level === 'unknown')).toBe(true);
  expect(result.narration).toMatch(/forecast.*unavailable|forecast.*stale/i);
});

test('partial wind data stays unknown while a real rain hazard produces a hold candidate', async () => {
  const partial = forecast();
  partial.days[0].wind_mph = null;
  partial.days[0].wind_coverage = 'missing';
  partial.days[1].rain_chance = 90;
  const { service } = setup({ fetchForecast: async () => partial });
  const result = await service('job-a', { trade: 'concrete' });
  expect(result.weather.status).toBe('partial');
  expect(result.weather.forecast.days[0].wind_mph).toBeNull();
  expect(result.weather.planning[0].level).toBe('unknown');
  expect(result.weather.planning[1].level).toBe('hold');
  expect(result.next_actions.some(action => action.id === 'weather')).toBe(true);
  expect(result.schedule.forecast_finish).toBeNull();
});

test('provider failure preserves a useful controls briefing without exposing provider details', async () => {
  const { service } = setup({ fetchForecast: async () => { throw new Error('secret provider credentials'); } });
  const result = await service('job-a');
  expect(result.weather.status).toBe('unavailable');
  expect(JSON.stringify(result)).not.toContain('secret provider credentials');
  expect(result.controls.margin.profit_low).toBe(70000);
});

test('explicit SQL link reports unfinished late/critical work and active risks without writing dates', async () => {
  const query = jest.fn(async sql => {
    if (/FROM projects/.test(sql)) return { rows: [{ id: 7, name: 'Linked schedule' }] };
    if (/FROM activities/.test(sql)) return { rows: [
      { id: 1, name: 'Foundation', planned_start: '2026-09-28', planned_finish: '2026-09-29', pct_complete: '30', is_critical: true, total_float: 0 },
      { id: 2, name: 'Complete task', planned_finish: '2026-09-20', pct_complete: '100', is_critical: true, total_float: 0 },
      { id: 3, name: 'Roofing', planned_start: '2026-10-02', planned_finish: '2026-10-03', pct_complete: '0', total_float: null, is_critical: false },
    ] };
    if (/FROM risks/.test(sql)) return { rows: [
      { id: 1, title: 'Open issue', status: 'open', probability: 4, impact: 5 },
      { id: 2, title: 'Finished issue', status: 'closed', probability: 5, impact: 5 },
      { id: 3, title: 'Unscored issue', status: 'open', probability: null, impact: null },
    ] };
    throw new Error('Unexpected query');
  });
  const { service } = setup({ query });
  const result = await service('job-a', { scheduleProjectId: '7' });
  expect(result.schedule.critical.map(row => row.id)).toEqual([1]);
  expect(result.schedule.late.map(row => row.id)).toEqual([1]);
  expect(result.schedule.upcoming.map(row => row.id)).toEqual([3]);
  expect(result.schedule.upcoming[0].total_float).toBeNull();
  expect(result.schedule.forecast_finish).toBeNull();
  expect(result.risks).toMatchObject({ status: 'available', open_count: 2 });
  expect(result.risks.items.find(row => row.id === 3).score).toBeNull();
  expect(query.mock.calls.every(([sql]) => /^SELECT\b/.test(sql.trim()))).toBe(true);
});

test.each(['0', '-1', '7x', '1.5', ['1', '2']])('invalid explicit schedule link %j is rejected', async scheduleProjectId => {
  const { service } = setup();
  await expect(service('job-a', { scheduleProjectId })).rejects.toMatchObject({ status: 400 });
});

test('a nonexistent explicit schedule link is rejected and never treated as the job schedule', async () => {
  const { service } = setup({ query: async () => ({ rows: [] }) });
  await expect(service('job-a', { scheduleProjectId: '99' })).rejects.toMatchObject({ status: 404 });
});

test('SQL failure leaves controls available and risk count unknown', async () => {
  const { service } = setup({ query: async () => { throw new Error('private DB address'); } });
  const result = await service('job-a', { scheduleProjectId: '7' });
  expect(result.schedule.status).toBe('unavailable');
  expect(result.risks.open_count).toBeNull();
  expect(JSON.stringify(result)).not.toContain('private DB address');
});

test('unknown project and unsupported trade fail before weather access', async () => {
  const { service, fetchForecast } = setup();
  await expect(service('missing')).rejects.toMatchObject({ status: 404 });
  await expect(service('job-a', { trade: 'electrician' })).rejects.toMatchObject({ status: 400 });
  expect(fetchForecast).not.toHaveBeenCalled();
});

function linkedQueries(activities) {
  return jest.fn(async sql => ({ rows: /FROM projects/.test(sql) ? [{ id: 7, name: 'Schedule' }] : /FROM activities/.test(sql) ? activities : [] }));
}

test('saved job schedule links become the briefing default while explicit selection remains a preview', async () => {
  const saved = { ...state(), schedule_links: [{ project_id: 'job-a', schedule_project_id: 7, version: 'fixture-version' }] };
  const query = linkedQueries([]);
  const { service } = setup({ readState: async () => saved, query });
  expect((await service('job-a')).schedule).toMatchObject({ project_id: 7, status: 'available' });
  expect((await service('job-a', { scheduleProjectId: '8' })).schedule.project_id).toBe(8);
  query.mockClear();
  expect((await service('job-a', { scheduleProjectId: '' })).schedule.status).toBe('unlinked');
  expect(query).not.toHaveBeenCalled();
  expect(saved.schedule_links[0].schedule_project_id).toBe(7);
});

test('a saved link with a deleted or unavailable SQL schedule cannot fall back to another schedule', async () => {
  const saved = { ...state(), schedule_links: [{ project_id: 'job-a', schedule_project_id: 7 }] };
  const query = jest.fn(async () => ({ rows: [] }));
  const { service } = setup({ readState: async () => saved, query });
  const missing = await service('job-a');
  expect(missing.schedule).toMatchObject({ project_id: 7, status: 'unavailable' });
  expect(missing.schedule.recommendations.join(' ')).toMatch(/linked schedule.*no longer exists/i);
  expect(query.mock.calls).toHaveLength(1);
  await expect(service('job-a', { scheduleProjectId: '7' })).rejects.toMatchObject({ status: 404 });
  query.mockRejectedValue(new Error('private database host'));
  const unavailable = await service('job-a');
  expect(unavailable.schedule).toMatchObject({ project_id: 7, status: 'unavailable' });
  expect(JSON.stringify(unavailable)).not.toContain('private database host');
});

test('an unlinked tombstone does not cause schedule queries in the briefing', async () => {
  const { service, query } = setup({ readState: async () => ({ ...state(), schedule_links: [{ project_id: 'job-a', schedule_project_id: null, version: 'fixture-version' }] }) });
  expect((await service('job-a')).schedule.status).toBe('unlinked');
  expect(query).not.toHaveBeenCalled();
});

test('weather exposure checks overlapping unfinished dates and labels the float comparison as a scenario', async () => {
  const wet = forecast();
  wet.days[0].rain_chance = 90;
  wet.days[1].rain_chance = 65;
  wet.days[2].rain_chance = 90;
  const { service } = setup({ fetchForecast: async () => wet, query: linkedQueries([
    { id: 1, name: 'Foundation', planned_start: '2026-09-29', planned_finish: '2026-10-02', total_float: 0, is_critical: true },
    { id: 2, name: 'Roofing', planned_start: '2026-10-03', planned_finish: '2026-10-05', total_float: 3 },
    { id: 3, name: 'Done', planned_start: '2026-10-01', planned_finish: '2026-10-04', total_float: 0, pct_complete: 100 },
    { id: 4, name: 'Later', planned_start: '2026-10-05', planned_finish: '2026-10-06', total_float: 0 },
    { id: 5, name: 'Missing dates', planned_start: null, planned_finish: null, total_float: null },
  ]) });
  const result = await service('job-a', { trade: 'concrete', scheduleProjectId: '7' });
  expect(result.schedule.weather_exposure).toHaveLength(2);
  expect(result.schedule.weather_exposure[0]).toMatchObject({ activity_id: 1, name: 'Foundation', is_critical: true, total_float: 0, selected_trade: 'concrete', dates: ['2026-10-01', '2026-10-02'], candidate_hold_day_count: 1, scenario_days_beyond_float: 1 });
  expect(result.schedule.weather_exposure[1]).toMatchObject({ activity_id: 2, dates: ['2026-10-03'], candidate_hold_day_count: 1, scenario_days_beyond_float: 0 });
  expect(result.schedule.weather_exposure_basis).toMatch(/potential exposure.*confirm whether.*trade applies/i);
  expect(result.schedule.weather_exposure_basis).toMatch(/calendar.*not.*known/i);
  expect(result.schedule.recommendations.join(' ')).toMatch(/resequenc\w*.*indoor|indoor.*resequenc/i);
  expect(result.schedule.forecast_finish).toBeNull();
  expect(result.narration).toMatch(/October 1.*concrete.*hold/i);
  expect(result.narration).toMatch(/Foundation.*critical/i);
  expect(result.narration).toMatch(/Next:.*confirm.*concrete.*Foundation/i);
  expect(result.narration.split(/\s+/).length).toBeLessThanOrEqual(130);
});

test('unknown or stale weather cannot create an exposure or delay scenario', async () => {
  const { service } = setup({ fetchForecast: async () => { throw new Error('offline'); }, query: linkedQueries([
    { id: 1, name: 'Foundation', planned_start: '2026-10-01', planned_finish: '2026-10-04', total_float: 0, is_critical: true },
  ]) });
  const result = await service('job-a', { scheduleProjectId: '7' });
  expect(result.schedule.weather_exposure).toEqual([]);
  expect(result.schedule.forecast_finish).toBeNull();
  expect(result.narration).not.toMatch(/days? (?:of )?delay|weather hold/);
});

test('hold weather without an explicit schedule link produces no claimed activity exposure', async () => {
  const wet = forecast();
  wet.days[0].rain_chance = 90;
  const { service, query } = setup({ fetchForecast: async () => wet });
  const result = await service('job-a', { trade: 'roofing' });
  expect(result.schedule.weather_exposure).toEqual([]);
  expect(result.narration).toMatch(/October 1.*roofing.*hold/i);
  expect(query).not.toHaveBeenCalled();
});

test('actual form readiness values are recognized while unrecorded engineering stays unknown', async () => {
  const { service } = setup();
  const result = await service('job-a');
  expect(result.controls.readiness.slice(0, 4).every(row => row.status === 'confirmed')).toBe(true);
  expect(result.controls.readiness[4]).toMatchObject({ field: 'engineering_status', status: 'unknown' });
});

test('invalid recorded dates do not suppress the remaining valid schedule', async () => {
  const { service } = setup({ query: linkedQueries([
    { id: 1, name: 'Invalid date', planned_start: '2026-99-12', planned_finish: '2026-02-30', total_float: null },
    { id: 2, name: 'Valid date', planned_start: '2026-10-01', planned_finish: '2026-10-03', total_float: 0 },
  ]) });
  const result = await service('job-a', { scheduleProjectId: '7' });
  expect(result.schedule.status).toBe('available');
  expect(result.schedule.planned_finish).toBe('2026-10-03');
  expect(result.schedule.upcoming.map(row => row.id)).toEqual([2]);
});

test('weather exposure with missing float stays unquantified', async () => {
  const wet = forecast();
  wet.days[0].rain_chance = 90;
  const { service } = setup({ fetchForecast: async () => wet, query: linkedQueries([
    { id: 1, name: 'Foundation', planned_start: '2026-10-01', planned_finish: '2026-10-02', total_float: null },
  ]) });
  const result = await service('job-a', { trade: 'concrete', scheduleProjectId: '7' });
  expect(result.schedule.weather_exposure[0]).toMatchObject({ candidate_hold_day_count: 1, total_float: null, scenario_days_beyond_float: null, is_critical: false });
});

test('the planning dates follow Albuquerque calendar days across the daylight-saving transition', async () => {
  const transition = new Date('2026-11-01T07:30:00Z');
  const { service } = setup({ now: () => transition, fetchForecast: async () => { throw new Error('offline'); } });
  const result = await service('job-a');
  expect(result.weather.planning.map(day => day.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
});
