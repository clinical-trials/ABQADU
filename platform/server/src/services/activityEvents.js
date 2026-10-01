const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const context = new AsyncLocalStorage();
function activityContextMiddleware(req, _res, next) {
  context.run({ actor_id: req.workspaceAuth?.userId || 'system' }, next);
}
const activityActor = () => context.getStore()?.actor_id || 'system';
const rows = (state, key) => Array.isArray(state[key]) ? state[key] : [];

function createActivityEvent({ project_id, type, summary, actor_id = activityActor(), text, request_id, changed_fields }) {
  return {
    id: randomUUID(), project_id: project_id || null, type, summary, actor_id,
    occurred_at: new Date().toISOString(),
    ...(text === undefined ? {} : { text }),
    ...(request_id === undefined ? {} : { request_id }),
    ...(changed_fields === undefined ? {} : { changed_fields: [...changed_fields] }),
  };
}

const PROJECT_FIELDS = {
  site_visit_status: { label: 'site visit', values: ['Needs scheduling', 'Scheduled', 'Completed'] },
  engineering_status: { label: 'engineering review', values: ['Needs engineering', 'In review', 'Confirmed', 'Completed', 'Not required'] },
  utility_review_status: { label: 'utility review', values: ['Needs confirmation', 'Needs utility review', 'In review', 'Confirmed'] },
  sewer_confirmation_status: { label: 'sewer review', values: ['Needs sewer confirmation study', 'Needs sewer confirmation', 'In review', 'Confirmed'] },
  setbacks_site_plan_status: { label: 'site plan', values: ['Needs site plan', 'In review', 'Confirmed', 'Completed'] },
  permit_status: { label: 'permit review', values: ['Not started', 'In review', 'Approved', 'Submitted'] },
  status: { label: 'project status', values: ['Needs site data', 'Needs supplier comparison', 'Ready to send', 'In progress', 'On hold', 'Completed'] },
  next_action: { label: 'next action' },
  client_target_budget: { label: 'client target budget' },
  bid_total: { label: 'customer price', money: true },
  cogs_low: { label: 'low cost estimate', money: true },
  cogs_high: { label: 'high cost estimate', money: true },
  model: { label: 'house model' },
  model_id: { label: 'house model' },
  sqft: { label: 'floor area', area: true },
  confidence: { label: 'estimate confidence', values: ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D', 'F'] },
  client: { label: 'client details' },
  address: { label: 'site location' },
  client_phone: { label: 'contact details' },
  client_email: { label: 'contact details' },
  preferred_contact: { label: 'contact details' },
  best_contact_time: { label: 'contact details' },
  internal_notes: { label: 'internal notes' },
  notes: { label: 'project notes' },
  supplier_status: { label: 'supplier status' },
  invoice_drafts: { label: 'invoice drafts' },
  draw_schedule: { label: 'proposed payment schedule' },
};
const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
function describeProjectChanges(previous, project, excluded = []) {
  const ignored = new Set(['id', 'metrics', 'readiness_label', ...excluded]);
  const changed = new Set([...Object.keys(previous), ...Object.keys(project)]
    .filter(key => !ignored.has(key) && !isDeepStrictEqual(previous[key], project[key])));
  const fields = Object.keys(PROJECT_FIELDS).filter(key => changed.has(key));
  const descriptions = fields.map(key => {
    const field = PROJECT_FIELDS[key];
    const value = project[key];
    // Only known enum choices and finite numeric estimates become values in the
    // summary. Free text may contain contacts, locations, or unverified claims.
    if (field.values?.includes(value)) return `${field.label} to ${value}`;
    const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) ? Number(value) : NaN;
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 1e12) {
      if (field.money) return `${field.label} to ${moneyFormat.format(numeric)}`;
      if (field.area) return `${field.label} to ${numeric.toLocaleString('en-US')} sq ft`;
    }
    return field.label;
  });
  if ([...changed].some(key => !Object.prototype.hasOwnProperty.call(PROJECT_FIELDS, key))) {
    fields.push('other_details');
    descriptions.push('other project details');
  }
  const concise = [...new Set(descriptions)];
  return {
    changed_fields: fields,
    summary: `Updated ${concise.slice(0, 4).join('; ')}${concise.length > 4 ? `; and ${concise.length - 4} other fields` : ''}.`,
  };
}

function deriveActivityEvents(before, after) {
  const events = [];
  const supplierEvents = new Map();
  const add = (project_id, type, summary, actor_id) => {
    const event = createActivityEvent({ project_id, type, summary, ...(actor_id ? { actor_id } : {}) });
    events.push(event);
    return event;
  };
  const oldProjects = new Map(rows(before, 'projects').map(project => [project.id, project]));
  for (const section of rows(after, 'estimate_sections')) {
    if (section.section !== 'Supplier COGS' || !section.project_id) continue;
    const previous = rows(before, 'estimate_sections').find(row => row.section === section.section && row.project_id === section.project_id);
    if (!isDeepStrictEqual(previous, section)) {
      supplierEvents.set(section.project_id, add(section.project_id, 'supplier.cogs_updated', 'Updated supplier costs in the estimate.'));
    }
  }
  for (const project of rows(after, 'projects')) {
    const previous = oldProjects.get(project.id);
    if (!previous) {
      add(project.id, 'project.created', 'Created project.');
      continue;
    }
    const preparedInvoices = !isDeepStrictEqual(previous.invoice_drafts, project.invoice_drafts) && Array.isArray(project.invoice_drafts);
    if (preparedInvoices) {
      add(project.id, 'invoice_drafts.prepared', 'Prepared invoice drafts for review.');
    }
    const changes = describeProjectChanges(previous, project, preparedInvoices ? ['invoice_drafts', 'draw_schedule'] : []);
    if (changes.changed_fields.length) {
      const supplierEvent = supplierEvents.get(project.id);
      if (supplierEvent) {
        supplierEvent.summary += ` ${changes.summary}`;
        supplierEvent.changed_fields = changes.changed_fields;
      } else events.push(createActivityEvent({ project_id: project.id, type: 'project.updated', ...changes }));
    }
  }
  for (const project of rows(before, 'projects')) {
    if (!rows(after, 'projects').some(row => row.id === project.id)) add(project.id, 'project.removed', 'Removed project from the workspace.');
  }
  for (const [field, createdType, createdSummary, updatedType, updatedSummary] of [
    ['bid_requests', 'bid_request.prepared', 'Prepared contractor bid request.', null, null],
    ['weather_holds', 'weather_hold.confirmed', 'Confirmed a weather hold.', 'weather_hold.updated', 'Updated a weather hold.'],
    ['sms_inbox', 'text.received', 'Received a text reply.', 'text.reviewed', 'Reviewed a text reply.'],
    ['receipts', 'receipt.saved', 'Saved receipt for review.', 'receipt.updated', 'Updated receipt details.'],
    ['mileage', 'mileage.saved', 'Saved mileage record.', 'mileage.updated', 'Updated mileage record.'],
  ]) {
    const previous = new Map(rows(before, field).map(row => [row.id, row]));
    for (const row of rows(after, field)) {
      const old = previous.get(row.id);
      if (!old) add(row.project_id, createdType, createdSummary, field === 'sms_inbox' ? 'system:twilio' : undefined);
      else if (updatedType && !isDeepStrictEqual(old, row)) {
        const cancelled = field === 'weather_holds' && row.status === 'Cancelled' && old.status !== 'Cancelled';
        add(row.project_id, cancelled ? 'weather_hold.cancelled' : updatedType, cancelled ? 'Cancelled a weather hold.' : updatedSummary);
      }
    }
  }
  return events;
}

module.exports = { activityContextMiddleware, activityActor, createActivityEvent, deriveActivityEvents };
