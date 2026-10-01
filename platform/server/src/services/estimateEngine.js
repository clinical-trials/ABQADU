const { MODEL_CATALOG, getModelById, getModelByName } = require('./modelCatalog');
const { utilitySummary } = require('./gisReview');
const { buildFourInvoiceSchedule } = require('./drawSchedule');

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dollarsPerSqft(amount, sqft) {
  const area = numeric(sqft);
  if (!area) return 0;
  return Math.round(numeric(amount) / area);
}

function resolveModel(modelIdOrName) {
  const found = MODEL_CATALOG.find(model => model.id === modelIdOrName);
  if (found) return found;
  try {
    return getModelById(modelIdOrName);
  } catch {
    return getModelByName(modelIdOrName);
  }
}

function calculateProjectMetrics(project = {}) {
  const bid = numeric(project.bid_total);
  const cogsLow = numeric(project.cogs_low);
  const cogsHigh = numeric(project.cogs_high);
  return {
    price_per_sqft: dollarsPerSqft(bid, project.sqft),
    cogs_low_per_sqft: dollarsPerSqft(cogsLow, project.sqft),
    cogs_high_per_sqft: dollarsPerSqft(cogsHigh, project.sqft),
    gross_profit_floor: bid - cogsHigh,
    gross_profit_ceiling: bid - cogsLow,
  };
}

function getReadinessLabel(project = {}, state = {}) {
  const hasIncompleteCheck = (field, completed) => (
    Object.prototype.hasOwnProperty.call(project, field) && !completed.includes(project[field])
  );
  if (!project.address || hasIncompleteCheck('site_visit_status', ['Completed'])) return 'Missing site data';
  if (project.engineering_status === 'Needs engineering') return 'Needs engineering';
  // Read the server-owned, current-address revision. Legacy combined flags and
  // any derived summary supplied on the project cannot confirm these findings.
  if (utilitySummary(state, project).status !== 'recorded') return 'Needs utility review';
  if (hasIncompleteCheck('setbacks_site_plan_status', ['Confirmed', 'Completed'])) return 'Needs site plan';
  if (project.supplier_status === 'Needs supplier comparison') return 'Needs supplier comparison';
  return 'Ready to send';
}

function applyModelDefaults(project = {}, modelIdOrName, state = {}) {
  const model = resolveModel(modelIdOrName || project.model_id || project.model);
  const updated = {
    ...project,
    model_id: model.id,
    model: model.name,
    sqft: model.sqft,
    bedrooms: model.bedrooms,
    bathrooms: model.bathrooms,
    bid_total: numeric(project.bid_total) > 1 ? numeric(project.bid_total) : model.base_price,
    cogs_low: model.default_cogs_low,
    cogs_high: model.default_cogs_high,
  };
  return {
    ...updated,
    readiness_label: getReadinessLabel(updated, state),
    metrics: calculateProjectMetrics(updated),
  };
}

function buildDrawSchedule(project = {}) {
  const labels = [
    'Invoice 1: $10,000 Preconstruction',
    'Invoice 2: 50% Remaining Balance — Mobilization',
    'Invoice 3: 25% Remaining Balance — Dry-In Draw',
    'Invoice 4: 25% Remaining Balance — Final Draw',
  ];
  const milestones = [
    '',
    'Send after final contract approval and permit pathway confirmation.',
    'Draw payment tied to dry-in and field progress.',
    'Final payment tied to punch list, inspection closeout, and handoff.',
  ];
  return buildFourInvoiceSchedule(project.bid_total).map((draw, index) => ({
    id: `draw-${project.id || 'project'}-${index + 1}`,
    label: labels[index], amount: draw.amount,
    suggested_send_day: draw.suggested_send_day, status: 'Draft',
    notes: index === 0
      ? 'Preconstruction deposit credited toward the project total. Due with the signed preconstruction contract.'
      : `${milestones[index]} Percentage applies to the balance after the $10,000 deposit; confirm the milestone before issuing.`,
  }));
}

function createInvoiceDrafts(project = {}) {
  return buildDrawSchedule(project).map((draw, index) => ({
    id: `invoice-${project.id || 'project'}-${index + 1}`,
    label: draw.label,
    amount: draw.amount,
    suggested_send_day: draw.suggested_send_day,
    status: draw.status,
    notes: draw.notes,
  }));
}

function validateSavedSchedules(project) {
  for (const field of ['invoice_drafts', 'draw_schedule']) {
    const rows = project[field];
    if (rows == null) continue;
    const valid = Array.isArray(rows) && rows.every(row => row && typeof row === 'object' && !Array.isArray(row)
      && (row.id == null || typeof row.id === 'string' || (typeof row.id === 'number' && Number.isFinite(row.id)))
      && (typeof row.amount === 'number' || (typeof row.amount === 'string' && /^\d+(?:\.\d{1,2})?$/.test(row.amount)))
      && Number.isFinite(Number(row.amount)) && Number(row.amount) >= 0
      && ['label', 'stage', 'status', 'notes'].every(key => row[key] == null || typeof row[key] === 'string')
      && (row.suggested_send_day == null || (typeof row.suggested_send_day === 'number' && Number.isFinite(row.suggested_send_day))));
    if (!valid) throw Object.assign(new Error('The saved schedule needs review before preparing or previewing invoices.'), { status: 409 });
  }
}

function createClientViewPreview(project = {}, state = {}) {
  validateSavedSchedules(project);
  // A preview must reflect saved payment terms, even after generator defaults change.
  const publicDraw = ({ id, label, stage, amount, suggested_send_day, status, notes }) => ({ id, label: label || stage, amount, suggested_send_day, status, notes });
  const savedDrafts = Array.isArray(project.invoice_drafts) && project.invoice_drafts.length ? project.invoice_drafts.map(publicDraw) : null;
  const savedDraws = Array.isArray(project.draw_schedule) && project.draw_schedule.length ? project.draw_schedule.map(publicDraw) : null;
  let draftSchedule = [];
  if (!savedDrafts && !savedDraws) {
    try { draftSchedule = createInvoiceDrafts(project); }
    catch (error) { if (error.status !== 400) throw error; }
  }
  return {
    id: `client-preview-${project.id || 'project'}`,
    type: 'Estimate preview',
    status: 'Draft',
    generated_at: new Date().toISOString(),
    brand: {
      company: 'ABQ ADU',
      phone: '505-977-7659',
      address: '131 Madison NE, Albuquerque, NM 87108',
    },
    project: {
      id: project.id,
      client: project.client,
      address: project.address,
      model: project.model,
      sqft: numeric(project.sqft),
      bid_total: numeric(project.bid_total),
    },
    readiness_label: getReadinessLabel(project, state),
    metrics: { price_per_sqft: dollarsPerSqft(project.bid_total, project.sqft) },
    invoice_drafts: savedDrafts || savedDraws || draftSchedule,
    draw_schedule: savedDraws || savedDrafts || draftSchedule,
    notes: 'Preview only. Final contract depends on site review, utilities, sewer confirmation, permitting, and engineering review.',
  };
}

module.exports = {
  MODEL_DEFAULTS: MODEL_CATALOG,
  applyModelDefaults,
  calculateProjectMetrics,
  getReadinessLabel,
  buildDrawSchedule,
  createInvoiceDrafts,
  createClientViewPreview,
  validateSavedSchedules,
};
