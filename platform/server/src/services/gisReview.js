const fs = require('node:fs/promises');
const { randomUUID, createHash } = require('node:crypto');
const { createActivityEvent, activityActor } = require('./activityEvents');

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const CHECKS = ['parcel', 'zoning', 'access', 'easements', 'utilities'];
const UTILITIES = ['water', 'electric', 'sewer'];
const UTILITY_STATUSES = ['unknown', 'in_review', 'needs_work', 'confirmed'];
const SIZE_FIELDS = ['primary_house_sqft', 'adu_sqft'];
const FIELDS = ['status', 'jurisdiction', 'parcel_id', 'width_ft', 'depth_ft', 'notes', 'checks', 'utility_reviews', 'size_review'];
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
class GisReviewError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new GisReviewError(status, message); };
const normalizeAddress = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
const addressLabel = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
function text(value, field, limit) {
  if (typeof value !== 'string' || value.length > limit || CONTROLS.test(value)) fail(400, `${field} must be text of at most ${limit} characters without control characters.`);
  return value.trim();
}
function feet(value, field) {
  const cleaned = text(value, field, 20);
  if (!cleaned) return '';
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(cleaned)) fail(400, `${field} must be a decimal number of feet with at most two decimal places.`);
  const [whole, fraction = ''] = cleaned.split('.');
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (hundredths <= 0 || hundredths > 1000000) fail(400, `${field} must be greater than zero and at most 10,000 feet.`);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
}
const unknownSizes = () => ({ primary_house_sqft: '', adu_sqft: '' });
function normalizeSizes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !SIZE_FIELDS.includes(key))) fail(400, 'Provide only primary house and ADU square footage.');
  return Object.fromEntries(SIZE_FIELDS.map(field => {
    const label = field === 'primary_house_sqft' ? 'Primary house size' : 'ADU size';
    const cleaned = text(input[field], label, 20);
    if (!cleaned) return [field, ''];
    if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(cleaned)) fail(400, `${label} must be decimal square feet with at most two decimal places.`);
    const [whole, fraction = ''] = cleaned.split('.');
    const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (hundredths <= 0 || hundredths > 100000000) fail(400, `${label} must be greater than zero and at most 1,000,000 square feet.`);
    return [field, `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`];
  }));
}
const unknownUtilities = () => Object.fromEntries(UTILITIES.map(id => [id, { status: 'unknown', notes: '' }]));
function normalizeUtilities(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !UTILITIES.includes(key))) fail(400, 'Provide separate water, electric and sewer reviews.');
  return Object.fromEntries(UTILITIES.map(id => {
    const item = input[id];
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['status', 'notes'].includes(key)) || !UTILITY_STATUSES.includes(item.status)) fail(400, `Choose a supported ${id} review status.`);
    const notes = text(item.notes, `${id} review notes`, 2000);
    if (item.status === 'confirmed' && notes.length < 10) fail(400, `Record the ${id} source, date and findings in at least 10 characters before marking the builder review confirmed.`);
    return [id, { status: item.status, notes }];
  }));
}
function utilitySummary(state, project = {}) {
  const history = Array.isArray(state?.gis_reviews) ? state.gis_reviews : [];
  const review = history.filter(row => row && row.project_id === project.id).at(-1);
  const address = normalizeAddress(project.address);
  const invalidated = Boolean(review && (review.invalidated_at || !address || normalizeAddress(review.address_snapshot) !== address));
  const items = UTILITIES.map(id => {
    const item = review?.utility_reviews?.[id];
    const valid = !invalidated && item && UTILITY_STATUSES.includes(item.status) && typeof item.notes === 'string'
      && item.notes.length <= 2000 && !CONTROLS.test(item.notes) && (item.status !== 'confirmed' || item.notes.trim().length >= 10);
    return { id, title: id[0].toUpperCase() + id.slice(1), status: valid ? item.status : 'unknown', notes: valid ? item.notes.trim() : '' };
  });
  const status = !review ? 'missing' : invalidated ? 'stale' : items.every(item => item.status === 'confirmed') ? 'recorded' : 'needs_review';
  const message = status === 'recorded' ? 'Builder-recorded water, electric and sewer findings for this address. Utility-provider and permit approvals remain separate.'
    : status === 'stale' ? 'The prior utility findings are stale. Restart review for the current address before relying on them.'
      : 'Record separate water, electric and sewer findings for this address. Legacy utility flags do not establish these findings; provider approvals remain separate.';
  return { status, items, message };
}
function normalizeReview(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !FIELDS.includes(key))) fail(400, 'Provide only the supported GIS review fields.');
  if (!['queued', 'in_review', 'reviewed'].includes(input.status)) fail(400, 'Choose a supported GIS review status.');
  if (!['unknown', 'albuquerque', 'bernalillo_county', 'other'].includes(input.jurisdiction)) fail(400, 'Choose a supported jurisdiction.');
  if (!input.checks || typeof input.checks !== 'object' || Array.isArray(input.checks)
    || Object.keys(input.checks).some(key => !CHECKS.includes(key)) || CHECKS.some(key => typeof input.checks[key] !== 'boolean')) fail(400, 'Provide a true or false value for each GIS review check.');
  const review = {
    status: input.status, jurisdiction: input.jurisdiction, parcel_id: text(input.parcel_id, 'Parcel ID', 100),
    width_ft: feet(input.width_ft, 'Yard width'), depth_ft: feet(input.depth_ft, 'Yard depth'), notes: text(input.notes, 'Review notes', 4000),
    checks: Object.fromEntries(CHECKS.map(key => [key, input.checks[key]])),
  };
  // Omission must retain the original fingerprint shape for legacy receipts.
  // Resolve preservation/defaulting against the latest record inside the queue.
  if (Object.prototype.hasOwnProperty.call(input, 'utility_reviews')) review.utility_reviews = normalizeUtilities(input.utility_reviews);
  if (Object.prototype.hasOwnProperty.call(input, 'size_review')) review.size_review = normalizeSizes(input.size_review);
  if (review.status === 'reviewed' && (!review.checks.parcel || review.notes.length < 10)) fail(400, 'Confirm the parcel and enter at least 10 characters of review notes before marking the desktop review reviewed.');
  return review;
}
function rows(state) {
  if (state.gis_reviews === undefined) return [];
  if (!Array.isArray(state.gis_reviews)) fail(503, 'Saved GIS review data is temporarily unavailable.');
  return state.gis_reviews;
}
const latest = (state, id) => rows(state).filter(row => row.project_id === id).at(-1) || null;
function findProject(state, id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 120 || /[\u0000-\u001f\u007f]/.test(id)) fail(400, 'Invalid project ID.');
  const project = state.projects?.find(row => row.id === id);
  if (!project) fail(404, 'The saved project does not exist.');
  return project;
}
const stale = (record, project) => Boolean(record && (record.invalidated_at || normalizeAddress(record.address_snapshot) !== normalizeAddress(project.address)));
function publicRecord(record) {
  if (!record) return null;
  const { project_id, version, address_snapshot, status, jurisdiction, parcel_id, width_ft, depth_ft, notes, checks, updated_at } = record;
  return { project_id, version, address_snapshot, status, jurisdiction, parcel_id, width_ft, depth_ft, notes, checks,
    utility_reviews: record.utility_reviews === undefined ? unknownUtilities() : record.utility_reviews,
    size_review: record.size_review === undefined ? unknownSizes() : record.size_review, updated_at };
}
function describe(state, projectId) {
  const project = findProject(state, projectId), review = latest(state, projectId);
  return { project: { id: project.id, client: typeof project.client === 'string' ? project.client : '', address: addressLabel(project.address) }, review: publicRecord(review), stale: stale(review, project) };
}

// Runs within the same serialized store publication as an address edit. The
// immutable invalidation stays stale even if the address later returns to A.
// GIS records retain their reviewed snapshot; they never approve a new site.
function invalidateGisReviews(before, after, records) {
  const current = new Map(records.map(row => [row.project_id, row]));
  const oldProjects = new Map((before.projects || []).map(row => [row.id, row]));
  const newProjects = new Map((after.projects || []).map(row => [row.id, row]));
  const appended = [], events = [];
  for (const [projectId, record] of current) {
    if (record.invalidated_at) continue;
    const oldProject = oldProjects.get(projectId), newProject = newProjects.get(projectId);
    const changed = Boolean(oldProject) !== Boolean(newProject)
      || normalizeAddress(oldProject?.address) !== normalizeAddress(newProject?.address);
    if (!changed) continue;
    const version = randomUUID(), at = new Date().toISOString();
    const { request_id, request_fingerprint, expected_version, ...snapshot } = record;
    appended.push({ ...snapshot, version, updated_at: at, saved_by: activityActor(), invalidated_at: at, invalidated_from: record.version });
    events.push({ ...createActivityEvent({ project_id: projectId, type: 'gis.review_invalidated', summary: 'Marked the GIS review stale after the saved site address changed.' }), gis_review_version: version });
  }
  return { records: [...records, ...appended], events };
}

function createGisReviewService(options = {}) {
  // Loaded lazily because the shared store also uses the pure invalidation helper.
  const { storePath, saveCommandCenter } = require('./commandCenterStore');
  const { readState = async () => JSON.parse(await fs.readFile(storePath, 'utf8')), saveState = saveCommandCenter,
    now = () => new Date(), readTimeoutMs = 5000 } = options;
  async function read() {
    let timer;
    try {
      const state = await Promise.race([
        Promise.resolve().then(readState),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Read deadline')), readTimeoutMs); }),
      ]);
      if (!state || !Array.isArray(state.projects)) throw new Error('Invalid workspace');
      rows(state);
      return state;
    } catch { fail(503, 'Saved GIS review data is temporarily unavailable.'); }
    finally { clearTimeout(timer); }
  }
  async function getReview(projectId) { return describe(await read(), projectId); }
  async function saveReview(projectId, body, actorId) {
    if (typeof actorId !== 'string' || !actorId.trim()) fail(403, 'An authenticated workspace user is required.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Expected a GIS review update.');
    if (typeof body.request_id !== 'string' || !UUID.test(body.request_id)) fail(400, 'A UUID request_id is required for safe retries.');
    if (body.expected_version !== null && (typeof body.expected_version !== 'string' || !UUID.test(body.expected_version))) fail(400, 'Include the saved GIS review version, or null for a new review.');
    const expectedAddress = normalizeAddress(text(body.expected_address, 'Expected address', 500));
    if (!expectedAddress) fail(400, 'Save a nonblank project address before starting GIS review.');
    const review = normalizeReview(body.review), requestId = body.request_id.toLowerCase(), expectedVersion = body.expected_version?.toLowerCase() || null;
    const fingerprint = createHash('sha256').update(JSON.stringify({ project_id: projectId, expected_version: expectedVersion, expected_address: expectedAddress, review })).digest('hex');
    findProject(await read(), projectId);
    let nextRecord, event, replayed = false;
    const saved = await saveState(current => {
      const project = findProject(current, projectId), all = rows(current), previous = latest(current, projectId);
      const prior = all.find(row => row.request_id === requestId);
      if (prior) {
        if (prior.project_id !== projectId || prior.saved_by !== actorId || prior.request_fingerprint !== fingerprint) fail(409, 'This request ID belongs to a different saved action.');
        replayed = true;
        return null;
      }
      if ((current.activity_events || []).some(row => row.request_id === requestId)) fail(409, 'This request ID belongs to a different saved action.');
      const address = text(project.address, 'Saved project address', 500);
      if (!address) fail(400, 'Save a nonblank project address before starting GIS review.');
      if (normalizeAddress(address) !== expectedAddress) fail(409, 'The saved project address changed. Reload it before starting GIS review.');
      if ((previous?.version || null) !== expectedVersion) fail(409, 'The GIS review changed. Reload it before saving again.');
      const isStale = stale(previous, project);
      const utilityReviews = review.utility_reviews || (isStale ? unknownUtilities() : previous?.utility_reviews || unknownUtilities());
      const sizeReview = review.size_review || (isStale ? unknownSizes() : previous?.size_review || unknownSizes());
      if (isStale && (review.status !== 'queued' || review.jurisdiction !== 'unknown'
        || review.parcel_id || review.width_ft || review.depth_ft || review.notes || CHECKS.some(key => review.checks[key])
        || UTILITIES.some(id => utilityReviews[id].status !== 'unknown' || utilityReviews[id].notes)
        || SIZE_FIELDS.some(field => sizeReview[field]))) {
        fail(409, 'The prior review is stale. Start an empty queued review for the current address before adding findings.');
      }
      if (all.length >= 10000) fail(503, 'The saved GIS review revision limit has been reached. Preserve and review the history before adding more.');
      nextRecord = { project_id: projectId, version: randomUUID(), address_snapshot: addressLabel(address), ...review, utility_reviews: utilityReviews, size_review: sizeReview,
        updated_at: now().toISOString(), saved_by: actorId, request_id: requestId, request_fingerprint: fingerprint, expected_version: expectedVersion };
      const type = review.status === 'queued' ? 'gis.review_queued' : review.status === 'reviewed' ? 'gis.reviewed' : 'gis.review_updated';
      const summary = review.status === 'queued' ? 'Queued GIS desktop review for the saved site address.'
        : review.status === 'reviewed' ? 'Saved GIS desktop review findings; site and permit approvals remain separate.' : 'Updated GIS desktop review findings.';
      event = { ...createActivityEvent({ project_id: projectId, actor_id: actorId, request_id: requestId, type, summary }), gis_review_version: nextRecord.version };
      return {};
    }, { requireExisting: true, gisReviews: current => [...rows(current), nextRecord], events: () => event ? [event] : [] });
    return { ...describe(saved, projectId), replayed };
  }
  return { getReview, saveReview };
}

module.exports = { createGisReviewService, invalidateGisReviews, normalizeReview, normalizeAddress, utilitySummary, GisReviewError };
