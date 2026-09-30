const fs = require('node:fs/promises');
const { randomUUID, createHash } = require('node:crypto');
const { storePath, saveCommandCenter } = require('./commandCenterStore');
const { createActivityEvent } = require('./activityEvents');

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const MAX_CENTS = 10000000000;
const MAX_REVISIONS = 1000;
const TEXT_FIELDS = {
  contractor_name: 200, contractor_address: 500, contractor_phone: 40, contractor_email: 200,
  license_number: 100, license_classification: 100, owner_name: 200, owner_email: 200, owner_phone: 40,
  property_address: 500, project_description: 2000, scope: 6000, exclusions: 4000, schedule: 2000,
  payment_terms: 3000, termination_terms: 4000, estimate_assumptions: 4000, third_party_costs: 3000, notice_details: 4000,
};
const ENUMS = { fee_credit: ['unconfirmed', 'separate', 'credited'], tax_treatment: ['unconfirmed', 'included', 'additional'], notice_review: ['unconfirmed', 'required', 'not_applicable'] };
const ALLOWED = new Set([...Object.keys(TEXT_FIELDS), ...Object.keys(ENUMS), 'fee', 'construction_estimate', 'tax_amount']);
class PreconstructionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new PreconstructionError(status, message); };
function usd(value, field, optional = false, positive = false) {
  if (optional && value === '') return { value: '', cents: null };
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) fail(400, `${field} must be a USD decimal with at most two decimal places.`);
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (cents > MAX_CENTS || cents < (positive ? 1 : 0)) fail(400, `${field} must be ${positive ? 'positive and ' : ''}at most $100,000,000.00.`);
  return { value: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`, cents };
}
function normalizeTerms(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Agreement terms must be an object.');
  if (Object.keys(input).some(key => !ALLOWED.has(key))) fail(400, 'Agreement terms contain an unsupported field.');
  const terms = {};
  for (const [field, limit] of Object.entries(TEXT_FIELDS)) {
    const value = input[field] === undefined ? '' : input[field];
    if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(400, `${field} must contain at most ${limit} characters without control characters.`);
    terms[field] = value.trim();
  }
  for (const [field, choices] of Object.entries(ENUMS)) {
    const value = input[field] === undefined ? 'unconfirmed' : input[field];
    if (!choices.includes(value)) fail(400, `Choose a supported ${field} value.`);
    terms[field] = value;
  }
  const fee = usd(input.fee, 'Preconstruction fee', false, true);
  const estimate = usd(input.construction_estimate === undefined ? '' : input.construction_estimate, 'Construction estimate', true);
  const tax = usd(input.tax_amount === undefined ? '' : input.tax_amount, 'Tax amount', true);
  if (terms.tax_treatment === 'included' && tax.cents !== null && tax.cents > fee.cents) fail(400, 'Included tax cannot exceed the preconstruction fee.');
  if (terms.tax_treatment === 'additional' && tax.cents !== null && fee.cents + tax.cents > MAX_CENTS) fail(400, 'The draft invoice total cannot exceed $100,000,000.00.');
  return { ...terms, fee: fee.value, construction_estimate: estimate.value, tax_amount: tax.value };
}
function defaultTerms(project = {}) {
  const safe = (value, maximum) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, maximum) : '';
  let estimate = '';
  try { estimate = usd(String(project.bid_total ?? ''), 'Construction estimate', true).value; } catch { /* Unknown estimate remains blank. */ }
  return normalizeTerms({
    fee: '10000.00', construction_estimate: estimate, tax_amount: '', fee_credit: 'unconfirmed', tax_treatment: 'unconfirmed', notice_review: 'unconfirmed',
    owner_name: safe(project.client, 200), owner_email: safe(project.client_email, 200), owner_phone: safe(project.client_phone, 40),
    property_address: safe(project.address, 500), project_description: safe(project.model ? `Proposed ${project.model} ADU. Confirm the final project description and scope.` : '', 2000),
    scope: 'Draft scope for review: site feasibility, preliminary planning, utility and permit coordination, and an initial project estimate. Confirm specific deliverables before use.',
    exclusions: 'Construction, stamped engineering plans, permit fees, surveys and third-party services unless expressly included in the reviewed scope.',
    payment_terms: 'Draft for discussion only. No payment is due from this packet. Confirm payment timing in the final signed agreement.',
    estimate_assumptions: 'The construction estimate is for planning and remains subject to reviewed scope, site conditions, design, permits and engineering.',
  });
}
function describeAgreement(input) {
  const terms = normalizeTerms(input);
  const fee = usd(terms.fee, 'Preconstruction fee').cents;
  const estimate = usd(terms.construction_estimate, 'Construction estimate', true).cents;
  // A retained draft entry is not confirmed tax until its treatment is chosen.
  const tax = terms.tax_treatment === 'unconfirmed' ? null : usd(terms.tax_amount, 'Tax amount', true).cents;
  const total = terms.tax_treatment === 'included' ? fee : terms.tax_treatment === 'additional' && tax !== null ? fee + tax : null;
  const review_items = [];
  const required = {
    contractor_name: 'Confirm the contracting entity’s legal name.', contractor_address: 'Confirm the contractor address.',
    license_number: 'Confirm the contractor license number.', license_classification: 'Confirm the license classification.',
    owner_name: 'Confirm the owner’s legal name.', property_address: 'Confirm the property address.', project_description: 'Confirm the project description.',
    scope: 'Define the included scope and deliverables.', exclusions: 'Confirm the exclusions.', schedule: 'Confirm the preconstruction schedule.',
    payment_terms: 'Review the proposed payment terms.', termination_terms: 'Review termination and cancellation terms.',
    estimate_assumptions: 'Confirm the estimate assumptions.', third_party_costs: 'Confirm responsibility for third-party costs.',
  };
  for (const [field, message] of Object.entries(required)) if (!terms[field]) review_items.push(message);
  if (!terms.contractor_phone && !terms.contractor_email) review_items.push('Confirm contractor contact details.');
  if (!terms.owner_phone && !terms.owner_email) review_items.push('Confirm owner contact details.');
  if (estimate === null) review_items.push('The construction estimate is not confirmed.');
  if (terms.fee_credit === 'unconfirmed') review_items.push('Confirm whether the fee is separate or credited toward construction.');
  if (terms.tax_treatment === 'unconfirmed') review_items.push('Confirm tax treatment before determining an invoice total.');
  else if (tax === null) review_items.push(terms.tax_treatment === 'included' ? 'Confirm any tax amount included in the fee.' : 'Confirm the additional tax amount before determining an invoice total.');
  if (terms.notice_review === 'unconfirmed') review_items.push('Review whether any transaction-specific notices are required.');
  if (terms.notice_review === 'required' && !terms.notice_details) review_items.push('Identify and attach the required notices.');
  review_items.push('Obtain final legal review before using this draft as an agreement.', 'Attach reviewed plans, scope and any required notices to the final agreement.');
  return { totals: { fee_cents: fee, construction_estimate_cents: estimate, tax_cents: tax, invoice_total_cents: total, currency: 'USD' }, review_items };
}

function records(state) {
  if (state.preconstruction_agreements === undefined) return [];
  if (!Array.isArray(state.preconstruction_agreements)) fail(503, 'Saved agreement history is unavailable.');
  return state.preconstruction_agreements;
}
function projectFor(state, id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 120 || /[\u0000-\u001f\u007f]/.test(id)) fail(400, 'Invalid project ID.');
  const project = state.projects?.find(row => row.id === id);
  if (!project) fail(404, 'The saved project does not exist.');
  return project;
}
const latestFor = (state, id) => records(state).filter(record => record.project_id === id).at(-1) || null;
function publicRecord(record) {
  if (!record) return null;
  const { id, project_id, version, revision, saved_at, terms, totals, review_items } = record;
  return { id, project_id, version, revision, saved_at, terms, totals, review_items };
}
async function bounded(work, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(new PreconstructionError(503, message)), milliseconds); })]);
  } finally { clearTimeout(timer); }
}
function createPreconstructionAgreementService({
  readState = async () => JSON.parse(await fs.readFile(storePath, 'utf8')),
  saveState = saveCommandCenter,
  renderPdf = record => require('./preconstructionPacketPdf').createPreconstructionPacketPdf(record),
  now = () => new Date(), readTimeoutMs = 5000, renderTimeoutMs = 55000,
} = {}) {
  async function read() {
    try {
      const state = await bounded(readState, readTimeoutMs, 'Saved workspace data is temporarily unavailable.');
      if (!state || !Array.isArray(state.projects)) throw new Error('Invalid workspace.');
      records(state);
      return state;
    } catch (error) {
      if (error instanceof PreconstructionError) throw error;
      fail(503, 'Saved workspace data is temporarily unavailable.');
    }
  }
  async function listProjects() {
    const state = await read();
    return { projects: state.projects.map(({ id, client = '', address = '', model = '' }) => ({ id, client, address, model })) };
  }
  async function getAgreement(projectId) {
    const state = await read(), project = projectFor(state, projectId);
    return {
      project: { id: project.id, client: project.client || '', address: project.address || '' },
      agreement: publicRecord(latestFor(state, projectId)), defaults: defaultTerms(project),
      history: records(state).filter(record => record.project_id === projectId).slice().reverse().map(({ version, revision, saved_at }) => ({ version, revision, saved_at })),
    };
  }
  async function saveAgreement(projectId, body, actorId) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Expected an agreement update.');
    if (typeof body.request_id !== 'string' || !UUID.test(body.request_id)) fail(400, 'A UUID request_id is required for safe retries.');
    if (body.expected_version !== null && (typeof body.expected_version !== 'string' || !UUID.test(body.expected_version))) fail(400, 'Include the last saved agreement version, or null for a new draft.');
    const requestId = body.request_id.toLowerCase(), expectedVersion = body.expected_version?.toLowerCase() || null;
    const terms = normalizeTerms(body.terms), description = describeAgreement(terms);
    const fingerprint = createHash('sha256').update(JSON.stringify({ project_id: projectId, expected_version: expectedVersion, terms })).digest('hex');
    projectFor(await read(), projectId);
    let nextRecord, event, replayed = false;
    const saved = await saveState(current => {
      projectFor(current, projectId);
      const all = records(current), previous = latestFor(current, projectId);
      const prior = all.find(record => record.request_id === requestId);
      if (prior) {
        if (prior.project_id !== projectId || prior.saved_by !== actorId || prior.request_fingerprint !== fingerprint) fail(409, 'This request ID belongs to a different saved action.');
        replayed = true;
        return null;
      }
      if ((current.activity_events || []).some(row => row.request_id === requestId)) fail(409, 'This request ID belongs to a different saved action.');
      if ((previous?.version || null) !== expectedVersion) fail(409, 'The agreement draft changed. Review the latest saved revision before saving again.');
      if (all.length >= MAX_REVISIONS) fail(503, 'The saved agreement revision limit has been reached. Preserve and review the existing history before adding more.');
      nextRecord = {
        id: previous?.id || randomUUID(), project_id: projectId, version: randomUUID(), revision: (previous?.revision || 0) + 1,
        saved_at: now().toISOString(), terms, ...description, template_version: 1, saved_by: actorId,
        request_id: requestId, request_fingerprint: fingerprint, expected_version: expectedVersion,
      };
      event = { ...createActivityEvent({ project_id: projectId, actor_id: actorId, request_id: requestId,
        type: 'preconstruction.draft_saved', summary: `Saved preconstruction agreement draft, revision ${nextRecord.revision}.` }),
      agreement_id: nextRecord.id, agreement_version: nextRecord.version };
      return {};
    }, { requireExisting: true, preconstructionAgreements: current => [...records(current), nextRecord], events: () => event ? [event] : [] });
    return { agreement: publicRecord(latestFor(saved, projectId)), replayed };
  }
  async function generatePacket(projectId, version, actorId) {
    if (typeof version !== 'string' || !UUID.test(version)) fail(400, 'Choose a saved agreement version.');
    const state = await read();
    projectFor(state, projectId);
    const record = records(state).find(item => item.project_id === projectId && item.version === version.toLowerCase());
    if (!record) fail(404, 'The saved agreement revision does not exist.');
    const agreement = publicRecord(record);
    let pdf;
    try {
      pdf = await bounded(() => renderPdf(agreement), renderTimeoutMs, 'The draft packet PDF is temporarily unavailable.');
      if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF.');
    } catch { fail(503, 'The draft packet PDF is temporarily unavailable. Try again after reviewing the saved revision.'); }
    await saveState(current => {
      if (!records(current).some(item => item.project_id === projectId && item.version === record.version)) fail(409, 'The saved agreement revision is no longer available.');
      return {};
    }, { requireExisting: true, events: [{ ...createActivityEvent({ project_id: projectId, actor_id: actorId,
      type: 'preconstruction.pdf_generated', summary: `Generated preconstruction draft packet, revision ${record.revision}.` }), agreement_id: record.id, agreement_version: record.version }] });
    return { pdf, agreement };
  }
  return { listProjects, getAgreement, saveAgreement, generatePacket };
}

module.exports = { normalizeTerms, defaultTerms, describeAgreement, createPreconstructionAgreementService, PreconstructionError };
