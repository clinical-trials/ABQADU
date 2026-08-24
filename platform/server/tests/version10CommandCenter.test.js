const fs = require('fs');
const os = require('os');
const path = require('path');

test('project metrics calculate price per square foot and gross profit', () => {
  const { calculateProjectMetrics } = require('../src/services/estimateEngine');

  const metrics = calculateProjectMetrics({
    sqft: 600,
    bid_total: 185000,
    cogs_low: 90000,
    cogs_high: 102000,
  });

  expect(metrics.price_per_sqft).toBe(308);
  expect(metrics.cogs_low_per_sqft).toBe(150);
  expect(metrics.cogs_high_per_sqft).toBe(170);
  expect(metrics.gross_profit_floor).toBe(83000);
  expect(metrics.gross_profit_ceiling).toBe(95000);
});

test('readiness labels prioritize blocked estimate conditions', () => {
  const { getReadinessLabel } = require('../src/services/estimateEngine');

  expect(getReadinessLabel({ address: '', site_visit_status: 'Not scheduled' })).toBe('Missing site data');
  expect(getReadinessLabel({ address: '435 Amherst Dr NE', engineering_status: 'Needs engineering' })).toBe('Needs engineering');
  expect(getReadinessLabel({ address: '435 Amherst Dr NE', utility_review_status: 'Needs confirmation' })).toBe('Needs utility review');
  expect(getReadinessLabel({ address: '435 Amherst Dr NE', supplier_status: 'Needs supplier comparison' })).toBe('Needs supplier comparison');
  expect(getReadinessLabel({ address: '435 Amherst Dr NE', utility_review_status: 'Confirmed' })).toBe('Ready to send');
});

test('invoice drafts always start with ten thousand dollar preconstruction invoice', () => {
  const { createInvoiceDrafts, buildDrawSchedule } = require('../src/services/estimateEngine');

  const drafts = createInvoiceDrafts({ id: 'amherst-altura', bid_total: 185000 });
  const draws = buildDrawSchedule({ id: 'amherst-altura', bid_total: 185000 });

  expect(drafts[0].label).toBe('Invoice 1: $10,000 Preconstruction');
  expect(drafts[0].amount).toBe(10000);
  expect(drafts[1].amount).toBe(92500);
  expect(drafts[2].label).toContain('Draw');
  expect(draws.reduce((sum, draw) => sum + draw.amount, 0)).toBe(185000);
});

test('client view preview exposes homeowner-facing estimate package', () => {
  const { createClientViewPreview } = require('../src/services/estimateEngine');

  const preview = createClientViewPreview({
    id: 'amherst-altura',
    client: 'Amherst homeowner',
    address: '435 Amherst Dr NE',
    model: 'Altura',
    sqft: 600,
    bid_total: 185000,
    cogs_low: 90000,
    cogs_high: 102000,
    utility_review_status: 'Confirmed',
  });

  expect(preview.type).toBe('Estimate preview');
  expect(preview.brand.company).toBe('ABQ ADU');
  expect(preview.project.client).toBe('Amherst homeowner');
  expect(preview.readiness_label).toBe('Ready to send');
  expect(preview.invoice_drafts[0].amount).toBe(10000);
  expect(preview.metrics.price_per_sqft).toBe(308);
});

test('command center estimate routes expose model, invoice, and preview actions', async () => {
  const routeFile = path.join(__dirname, '..', 'src', 'routes', 'commandCenter.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abqadu-v10-command-center-'));
  process.env.COMMAND_CENTER_STORE_PATH = path.join(tmp, 'store.json');
  jest.resetModules();

  const routeSource = fs.readFileSync(routeFile, 'utf8');
  expect(routeSource).toContain("router.post('/projects/:projectId/apply-model'");
  expect(routeSource).toContain("router.post('/projects/:projectId/invoice-drafts'");
  expect(routeSource).toContain("router.get('/projects/:projectId/client-view-preview'");

  const store = require('../src/services/commandCenterStore');
  const {
    applyModelDefaults,
    createClientViewPreview,
    createInvoiceDrafts,
    buildDrawSchedule,
    calculateProjectMetrics,
  } = require('../src/services/estimateEngine');

  const state = await store.resetCommandCenter();
  const modeledProject = applyModelDefaults(
    state.projects.find(project => project.id === 'mackland-altura'),
    'Altura 650'
  );
  expect(modeledProject.model).toBe('Altura 650');
  expect(modeledProject.sqft).toBe(650);
  expect(calculateProjectMetrics(modeledProject).price_per_sqft).toBe(285);

  const amherst = state.projects.find(project => project.id === 'amherst-altura');
  const invoicedProject = {
    ...amherst,
    invoice_drafts: createInvoiceDrafts(amherst),
    draw_schedule: buildDrawSchedule(amherst),
  };
  expect(invoicedProject.invoice_drafts[0].label).toBe('Invoice 1: $10,000 Preconstruction');
  expect(invoicedProject.draw_schedule.reduce((sum, draw) => sum + draw.amount, 0)).toBe(185000);

  const preview = createClientViewPreview(amherst);
  expect(preview.type).toBe('Estimate preview');
  expect(preview.invoice_drafts[0].amount).toBe(10000);
});

test('supplier engine compares Lowe, RAKS, Rio Grande, SIP/PUR panels, and conventional packages', () => {
  const { buildSupplierBidout, compareBuildMethods } = require('../src/services/supplierEngine');

  const bidout = buildSupplierBidout({
    project: { id: 'mackland-altura', model: 'Altura 2BR', sqft: 650, bid_total: 185250 },
  });
  const suppliers = bidout.packages.map(pkg => pkg.supplier);

  expect(suppliers).toEqual(expect.arrayContaining([
    "Lowe's Pro Desk",
    'RAKS Building Supply',
    'Rio Grande Building Company',
    'SIP/PUR Panel Supplier',
    'Conventional Build Package',
  ]));
  expect(bidout.packages.find(pkg => pkg.supplier === "Lowe's Pro Desk")).toMatchObject({
    delivery: expect.stringContaining('job-site'),
    lead_time: expect.any(String),
    action_label: 'Send to COGS',
  });
  expect(bidout.categories).toEqual(expect.arrayContaining(['lumber', 'sheetrock', 'mud', 'roofing', 'house wrap', 'panelized shell']));

  const comparison = compareBuildMethods({ sqft: 650, bid_total: 185250 });
  expect(comparison.sip_pur.total_cogs).toBeGreaterThan(comparison.conventional.material_cogs);
  expect(comparison.sip_pur.labor_days).toBeLessThan(comparison.conventional.labor_days);
  expect(comparison.sip_pur.gross_profit).toBeGreaterThan(comparison.conventional.gross_profit);
});

test('command center exposes supplier bidout routes and Send to COGS service mutation', async () => {
  const routeFile = path.join(__dirname, '..', 'src', 'routes', 'commandCenter.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abqadu-v10-supplier-command-center-'));
  process.env.COMMAND_CENTER_STORE_PATH = path.join(tmp, 'store.json');
  jest.resetModules();

  const routeSource = fs.readFileSync(routeFile, 'utf8');
  expect(routeSource).toContain("router.get('/supplier-bidout'");
  expect(routeSource).toContain("router.post('/supplier-bidout/send-to-cogs'");

  const store = require('../src/services/commandCenterStore');
  const { buildSupplierBidout, sendSupplierPackageToCogs } = require('../src/services/supplierEngine');

  const state = await store.resetCommandCenter();
  const project = state.projects.find(row => row.id === 'mackland-altura');
  const bidout = buildSupplierBidout({ project });
  expect(bidout.project_id).toBe('mackland-altura');
  expect(bidout.comparison.sip_pur.schedule_effect).toContain('faster');
  expect(bidout.packages.map(pkg => pkg.supplier)).toContain('Rio Grande Building Company');

  const selected = bidout.packages.find(pkg => pkg.id === 'sip-pur-panels');
  const sent = sendSupplierPackageToCogs(state, {
    project_id: 'mackland-altura',
    package_id: selected.id,
  });

  const section = sent.estimate_sections.find(row => row.project_id === 'mackland-altura' && row.section === 'Supplier COGS');
  const updatedProject = sent.projects.find(row => row.id === 'mackland-altura');
  expect(section.items).toEqual(expect.arrayContaining([
    expect.objectContaining({
      source: 'supplier-bidout',
      supplier: 'SIP/PUR Panel Supplier',
      category: 'panelized shell',
      internal_only: true,
      unit_cost: selected.quoted_total,
    }),
  ]));
  expect(updatedProject.supplier_status).toBe('Supplier COGS imported');
  expect(updatedProject.cogs_low).toBeGreaterThanOrEqual(section.subtotal);
  expect(sent.activity[0].detail).toContain('Send to COGS');
});

test('Version 10 model catalog contains canonical ADU models', () => {
  const { MODEL_CATALOG } = require('../src/services/modelCatalog');

  expect(MODEL_CATALOG.map(model => model.family)).toContain('Netherwood');
  expect(MODEL_CATALOG.map(model => model.family)).toContain('Altura');
  expect(MODEL_CATALOG.map(model => model.family)).toContain('Cromwell');
  expect(MODEL_CATALOG.find(model => model.id === 'netherwood-440').sqft).toBe(440);
  expect(MODEL_CATALOG.find(model => model.id === 'netherwood-550').bedrooms).toBe(2);
  expect(MODEL_CATALOG.find(model => model.id === 'altura-576').sqft).toBe(576);
  expect(MODEL_CATALOG.find(model => model.id === 'altura-650').sqft).toBe(650);
  expect(MODEL_CATALOG.find(model => model.id === 'cromwell-1280').type).toBe('Single Family');
});

test('Version 10 starter state exposes model catalog and client contact fields', () => {
  const { starterState } = require('../src/services/commandCenterStore');

  const state = starterState();
  expect(state.version).toBe('Version 10');
  expect(state.model_catalog.length).toBeGreaterThanOrEqual(5);
  expect(state.projects[0]).toHaveProperty('client_phone');
  expect(state.projects[0]).toHaveProperty('client_email');
  expect(state.projects[0]).toHaveProperty('best_contact_time');
  expect(state.projects[0]).toHaveProperty('preferred_contact');
});

test('model defaults update square footage and estimate assumptions', () => {
  const { applyModelDefaults } = require('../src/services/modelCatalog');

  const project = { model: 'Altura', sqft: 1, bid_total: 1, cogs_low: 1, cogs_high: 1 };
  const updated = applyModelDefaults(project, 'Netherwood 550');
  expect(updated.model_id).toBe('netherwood-550');
  expect(updated.model).toBe('Netherwood 550');
  expect(updated.sqft).toBe(550);
  expect(updated.cogs_low).toBeGreaterThan(1);
  expect(updated.cogs_high).toBeGreaterThan(updated.cogs_low);
});

test('model lookup accepts existing display names', () => {
  const { getModelByName } = require('../src/services/modelCatalog');

  expect(getModelByName('Altura 2BR').sqft).toBe(650);
  expect(getModelByName('Netherwood House').sqft).toBe(440);
});
