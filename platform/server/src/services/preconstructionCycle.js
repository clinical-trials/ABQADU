const fs = require('node:fs/promises');
const { randomUUID, createHash } = require('node:crypto');
const { createActivityEvent } = require('./activityEvents');

const TIME_ZONE = 'America/Denver';
const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_RECORDS = 10000;
const HOUR = 3600000;
const UNAVAILABLE = 'The preconstruction timing records are temporarily unavailable. Elapsed times remain unknown.';
const TARGET = { deposit_cents: 1000000, goal_hours: 20, stretch_hours: 15 };
class PreconstructionCycleError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new PreconstructionCycleError(status, message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const projectIdValid = value => typeof value === 'string' && value.trim() && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const blankMilestones = () => ({ signed_at: null, deposit_received_at: null, evidence: '' });
const projectName = project => (typeof project.client === 'string'
  ? project.client.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 200) : '') || 'Unnamed project';
function clockDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(503, UNAVAILABLE);
  return value;
}
function timestamp(value, label) {
  if (typeof value !== 'string') fail(400, `${label} must be an ISO timestamp with an explicit time zone.`);
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) fail(400, `${label} must be an ISO timestamp with an explicit time zone.`);
  const [, y, m, d, h, minute, second, , zone] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(h) > 23 || Number(minute) > 59 || Number(second) > 59
    || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59 || (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0)))) {
    fail(400, `${label} must be a valid calendar date and time.`);
  }
  const parsed = new Date(value);
  // Offset conversion must remain readable by this same four-digit-year parser.
  if (!Number.isFinite(parsed.getTime()) || parsed.getUTCFullYear() < 1 || parsed.getUTCFullYear() > 9999) fail(400, `${label} must be a valid calendar date and time.`);
  return parsed.toISOString();
}
function normalizeMilestones(input, nowDate) {
  if (!object(input) || Object.keys(input).some(key => !['signed_at', 'deposit_received_at', 'evidence'].includes(key))) fail(400, 'Provide only signing time, full-deposit receipt time and evidence.');
  const signed_at = input.signed_at === null ? null : timestamp(input.signed_at, 'Signing time');
  const deposit_received_at = input.deposit_received_at === null ? null : timestamp(input.deposit_received_at, 'Full-deposit receipt time');
  if (typeof input.evidence !== 'string' || input.evidence.length > 500 || CONTROLS.test(input.evidence)) fail(400, 'Evidence must contain at most 500 characters without control characters.');
  const evidence = input.evidence.trim();
  if ((signed_at || deposit_received_at) && !evidence) fail(400, 'Record the source or reference supporting these manually entered milestones.');
  if (deposit_received_at && !signed_at) fail(400, 'Record the signed preconstruction agreement time before its full-deposit receipt time.');
  if ((signed_at && Date.parse(signed_at) > nowDate.getTime()) || (deposit_received_at && Date.parse(deposit_received_at) > nowDate.getTime())) fail(400, 'Milestone times cannot be in the future.');
  if (deposit_received_at && Date.parse(deposit_received_at) < Date.parse(signed_at)) fail(400, 'Full-deposit receipt cannot precede the recorded agreement signing.');
  return { signed_at, deposit_received_at, evidence };
}
function inspectState(state, nowDate) {
  try {
    if (!object(state) || !Array.isArray(state.projects) || state.projects.length > 5000) throw new Error();
    const projects = new Map();
    for (const project of state.projects) {
      if (!object(project) || !projectIdValid(project.id) || projects.has(project.id)) throw new Error();
      projects.set(project.id, project);
    }
    const history = state.preconstruction_cycles === undefined ? [] : state.preconstruction_cycles;
    if (!Array.isArray(history) || history.length > MAX_RECORDS) throw new Error();
    const latest = new Map(), requests = new Set(), ids = new Set();
    for (const entry of history) {
      if (!object(entry) || !UUID.test(entry.id) || !projectIdValid(entry.project_id) || typeof entry.project_name !== 'string' || entry.project_name.length > 200 || CONTROLS.test(entry.project_name)
        || !Number.isSafeInteger(entry.version) || entry.version < 1 || entry.version > MAX_RECORDS
        || entry.expected_version !== entry.version - 1 || (latest.get(entry.project_id)?.version || 0) !== entry.expected_version
        || typeof entry.saved_by !== 'string' || !entry.saved_by.trim() || entry.saved_by.length > 200 || CONTROLS.test(entry.saved_by)
        || !UUID.test(entry.request_id) || !/^[a-f\d]{64}$/.test(entry.request_fingerprint) || requests.has(entry.request_id.toLowerCase()) || ids.has(entry.id.toLowerCase())) throw new Error();
      timestamp(entry.saved_at, 'Recorded time');
      const milestones = normalizeMilestones(entry.milestones, nowDate);
      requests.add(entry.request_id.toLowerCase()); ids.add(entry.id.toLowerCase());
      latest.set(entry.project_id, { ...entry, milestones });
    }
    return { projects, latest, history };
  } catch { fail(503, UNAVAILABLE); }
}
const denverDate = value => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function monday(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDate(date, -((weekday + 6) % 7));
}
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), index = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[index] : (sorted[index - 1] + sorted[index]) / 2;
}
function summarizePreconstructionCycle(state, nowDate = new Date()) {
  clockDate(nowDate);
  const { projects: savedProjects, latest } = inspectState(state, nowDate);
  const currentMonday = monday(denverDate(nowDate));
  const buckets = Array.from({ length: 8 }, (_, index) => ({ start: shiftDate(currentMonday, -7 * index), end: shiftDate(currentMonday, 7 - 7 * index), values: [] }));
  // Completed records remain in history even if a job is later removed. Only
  // an explicit corrected revision changes the current measurement.
  for (const entry of latest.values()) {
    const { signed_at, deposit_received_at } = entry.milestones;
    if (!deposit_received_at) continue;
    const date = denverDate(new Date(deposit_received_at));
    const bucket = buckets.find(item => date >= item.start && date < item.end);
    if (bucket) bucket.values.push((Date.parse(deposit_received_at) - Date.parse(signed_at)) / HOUR);
  }
  const weeks = buckets.map(({ start, end, values }) => {
    const within = values.filter(hours => hours <= TARGET.goal_hours).length;
    return { start, end, count: values.length, median_hours: values.length ? round(median(values)) : null,
      fastest_hours: values.length ? round(Math.min(...values)) : null, within_target_count: within,
      within_target_pct: values.length ? round(within / values.length * 100, 1) : null };
  });
  const projects = [...savedProjects.values()].map(project => {
    const entry = latest.get(project.id), milestones = entry?.milestones || blankMilestones();
    const status = milestones.deposit_received_at ? 'complete' : milestones.signed_at ? 'awaiting_deposit' : 'not_started';
    const elapsed = milestones.signed_at ? ((milestones.deposit_received_at ? Date.parse(milestones.deposit_received_at) : nowDate.getTime()) - Date.parse(milestones.signed_at)) / HOUR : null;
    return { id: project.id, name: projectName(project), version: entry?.version || 0,
      milestones, hours: elapsed === null ? null : round(elapsed), status,
      target_status: status !== 'complete' ? null : elapsed <= TARGET.stretch_hours ? 'stretch' : elapsed <= TARGET.goal_hours ? 'on_target' : 'over_target' };
  });
  const current = weeks[0], previous = weeks[1];
  const currentMedian = median(buckets[0].values), previousMedian = median(buckets[1].values);
  const improvement = currentMedian === null || previousMedian === null ? null : round(previousMedian - currentMedian);
  const awaiting = projects.filter(project => project.status === 'awaiting_deposit');
  const waitingOverTarget = awaiting.filter(project => (nowDate.getTime() - Date.parse(project.milestones.signed_at)) / HOUR > TARGET.goal_hours).length;
  const narration = `Staff-recorded elapsed time from signed agreement to reported full $10,000 receipt; not work hours or bank confirmation. `
    + `This week to date: ${current.count} completions${current.median_hours === null ? ', median unknown' : `, median ${current.median_hours} hours`}. `
    + `Previous full week: ${previous.count} completions${previous.median_hours === null ? ', median unknown' : `, median ${previous.median_hours} hours`}. `
    + `Goal: 20 hours; stretch: 15. ${awaiting.length} open jobs; ${waitingOverTarget} past 20 hours.`;
  return { generated_at: nowDate.toISOString(), time_zone: TIME_ZONE, target: { ...TARGET }, current_week: current, previous_week: previous, weeks,
    improvement_hours: improvement, projects, narration };
}

function createPreconstructionCycleService(options = {}) {
  const { storePath, saveCommandCenter } = require('./commandCenterStore');
  const { readState = async () => JSON.parse(await fs.readFile(storePath, 'utf8')), saveState = saveCommandCenter,
    now = () => new Date(), readTimeoutMs = 5000 } = options;
  async function read(at) {
    let timer;
    try {
      const state = await Promise.race([Promise.resolve().then(readState),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Read deadline')), readTimeoutMs); })]);
      inspectState(state, at);
      return state;
    } catch { fail(503, UNAVAILABLE); }
    finally { clearTimeout(timer); }
  }
  async function getReport() {
    const at = clockDate(now());
    return summarizePreconstructionCycle(await read(at), at);
  }
  async function saveProject(projectId, body, actorId) {
    if (typeof actorId !== 'string' || !actorId.trim() || actorId.length > 200 || CONTROLS.test(actorId)) fail(403, 'An authenticated workspace user is required.');
    if (!projectIdValid(projectId)) fail(400, 'Invalid project ID.');
    if (!object(body) || Object.keys(body).some(key => !['request_id', 'expected_version', 'milestones'].includes(key))) fail(400, 'Provide only request identity, expected version and milestone fields.');
    if (typeof body.request_id !== 'string' || !UUID.test(body.request_id)) fail(400, 'A UUID request_id is required for safe retries.');
    if (!Number.isSafeInteger(body.expected_version) || body.expected_version < 0 || body.expected_version >= MAX_RECORDS) fail(400, 'Include a nonnegative integer saved version, or zero for a new record.');
    const at = clockDate(now()), milestones = normalizeMilestones(body.milestones, at), requestId = body.request_id.toLowerCase();
    const fingerprint = createHash('sha256').update(JSON.stringify({ project_id: projectId, expected_version: body.expected_version, milestones })).digest('hex');
    const existing = await read(at);
    if (!existing.projects.some(project => project.id === projectId)) fail(404, 'The saved project does not exist.');
    let nextRecord, event;
    try {
      const saved = await saveState(current => {
        const recordedAt = clockDate(now()), { projects, history, latest } = inspectState(current, recordedAt);
        const project = projects.get(projectId);
        if (!project) fail(404, 'The saved project does not exist.');
        const prior = history.find(entry => entry.request_id.toLowerCase() === requestId);
        if (prior) {
          if (prior.project_id !== projectId || prior.saved_by !== actorId || prior.request_fingerprint !== fingerprint) fail(409, 'This request ID belongs to a different saved action.');
          return null;
        }
        if ((current.activity_events || []).some(entry => entry.request_id === requestId)) fail(409, 'This request ID belongs to a different saved action.');
        if ((latest.get(projectId)?.version || 0) !== body.expected_version) fail(409, 'The milestone record changed. Review the latest version before saving again.');
        if (history.length >= MAX_RECORDS) fail(503, 'The milestone history limit has been reached. Preserve and review existing records before adding more.');
        normalizeMilestones(milestones, recordedAt);
        nextRecord = { id: randomUUID(), project_id: projectId, project_name: projectName(project), version: body.expected_version + 1,
          milestones, saved_at: recordedAt.toISOString(), saved_by: actorId, request_id: requestId, request_fingerprint: fingerprint, expected_version: body.expected_version };
        event = { ...createActivityEvent({ project_id: projectId, actor_id: actorId, request_id: requestId,
          type: 'preconstruction.cycle_recorded', summary: 'Saved staff-reported preconstruction signing and full-deposit timing for review.' }),
        preconstruction_cycle_id: nextRecord.id, preconstruction_cycle_version: nextRecord.version };
        return {};
      }, { requireExisting: true, preconstructionCycles: current => [...(current.preconstruction_cycles || []), nextRecord], events: () => event ? [event] : [] });
      return summarizePreconstructionCycle(saved, clockDate(now()));
    } catch (error) {
      if (error instanceof PreconstructionCycleError) throw error;
      fail(503, UNAVAILABLE);
    }
  }
  return { getReport, saveProject };
}

module.exports = { createPreconstructionCycleService, summarizePreconstructionCycle, PreconstructionCycleError };
