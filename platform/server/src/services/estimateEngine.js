const { MODEL_CATALOG, getModelById, getModelByName } = require('./modelCatalog');

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

function getReadinessLabel(project = {}) {
  if (!project.address || project.site_visit_status === 'Not scheduled') return 'Missing site data';
  if (project.engineering_status === 'Needs engineering') return 'Needs engineering';
  if (project.utility_review_status && project.utility_review_status !== 'Confirmed') return 'Needs utility review';
  if (project.supplier_status === 'Needs supplier comparison') return 'Needs supplier comparison';
  return 'Ready to send';
}

function applyModelDefaults(project = {}, modelIdOrName) {
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
    readiness_label: getReadinessLabel(updated),
    metrics: calculateProjectMetrics(updated),
  };
}

function buildDrawSchedule(project = {}) {
  const total = numeric(project.bid_total);
  const preconstruction = Math.min(10000, total);
  const mobilization = Math.round(total * 0.5);
  const dryIn = Math.round(total * 0.25);
  const finalDraw = Math.max(total - preconstruction - mobilization - dryIn, 0);

  return [
    {
      id: `draw-${project.id || 'project'}-1`,
      label: 'Invoice 1: $10,000 Preconstruction',
      amount: preconstruction,
      suggested_send_day: 0,
      status: 'Draft',
      notes: 'Due with signed preconstruction contract.',
    },
    {
      id: `draw-${project.id || 'project'}-2`,
      label: 'Invoice 2: 50% Contract Mobilization',
      amount: mobilization,
      suggested_send_day: 14,
      status: 'Draft',
      notes: 'Send after final contract approval and permit pathway confirmation.',
    },
    {
      id: `draw-${project.id || 'project'}-3`,
      label: 'Invoice 3: Dry-In Draw',
      amount: dryIn,
      suggested_send_day: 45,
      status: 'Draft',
      notes: 'Draw payment tied to dry-in and field progress.',
    },
    {
      id: `draw-${project.id || 'project'}-4`,
      label: 'Invoice 4: Final Draw',
      amount: finalDraw,
      suggested_send_day: 75,
      status: 'Draft',
      notes: 'Final payment tied to punch list, inspection closeout, and handoff.',
    },
  ];
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

function createClientViewPreview(project = {}) {
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
    readiness_label: getReadinessLabel(project),
    metrics: calculateProjectMetrics(project),
    invoice_drafts: createInvoiceDrafts(project),
    draw_schedule: buildDrawSchedule(project),
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
};
