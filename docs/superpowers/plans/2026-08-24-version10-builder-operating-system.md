# Version 10 Builder Operating System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Version 10 as a mobile-first builder operating system prototype for intake, estimating, supplier bidout, invoices, weather crew actions, and deployable platform review.

**Architecture:** Keep the existing Express + React platform app. Extend the JSON-backed command center store before introducing a database migration. Add small focused services for model catalog, estimates/invoices, supplier COGS, and crew messages, then connect them to the Command Center UI with mobile card layouts.

**Tech Stack:** Node.js, Express, React 18, Jest, local JSON persistence, static assertion tests, existing print/browser APIs.

**Spec:** `docs/superpowers/specs/2026-08-22-version10-builder-operating-system-design.md`

## Global Constraints

- Visible platform copy must say `Version 10`.
- Builder UI must be usable on a normal phone without horizontal table dependency.
- Model square footage and base assumptions must be centralized.
- First invoice must always be `$10,000 Preconstruction`.
- Supplier comparison must include Lowe's, RAKS, Rio Grande, SIP/PUR panels, and conventional build packages.
- Weather risks must map to affected work categories and crew-action messages.
- Static-only GitHub Pages is insufficient for Version 10 builder tools.
- Do not claim full Clerk, Stripe, Twilio, InvoiceShelf, or automated blueprint parsing is complete.

---

## File Structure

- `platform/server/src/services/modelCatalog.js`  
  Owns canonical model data and lookup helpers.

- `platform/server/src/services/estimateEngine.js`  
  Owns project estimate calculations, readiness labels, draw schedule, and invoice draft generation.

- `platform/server/src/services/supplierEngine.js`  
  Owns supplier package totals, `Send to COGS`, and SIP/PUR versus conventional comparison.

- `platform/server/src/services/crewMessageEngine.js`  
  Owns weather-risk-to-trade mapping and text-ready crew messages.

- `platform/server/src/services/commandCenterStore.js`  
  Extends starter data to Version 10 schema while preserving current load/save/reset interface.

- `platform/server/src/routes/commandCenter.js`  
  Adds focused endpoints for model application, supplier-to-COGS, invoice draft, and crew messages.

- `platform/client/src/pages/CommandCenter.jsx`  
  Updates builder UI into Version 10 daily triage, intake, estimate/invoice, supplier, SIP/PUR, weather, and deployment sections.

- `tests/platform-command-center-ui.test.js`  
  Static UI assertions for Version 10 copy and core actions.

- `platform/server/tests/version10CommandCenter.test.js`  
  Server/service tests for model catalog, estimates, invoices, supplier COGS, and crew messages.

- `docs/version-10-platform-deployment.md`  
  Full platform deployment guide that distinguishes local, LAN, and public deployment.

---

### Task 1: Add Central Model Catalog And Version 10 Store Shape

**Files:**
- Create: `platform/server/src/services/modelCatalog.js`
- Modify: `platform/server/src/services/commandCenterStore.js`
- Test: `platform/server/tests/version10CommandCenter.test.js`

**Interfaces:**
- Produces: `MODEL_CATALOG: Array<ModelCatalogItem>`
- Produces: `getModelById(modelId: string): ModelCatalogItem`
- Produces: `getModelByName(modelName: string): ModelCatalogItem`
- Produces: `applyModelDefaults(project: object, modelIdOrName: string): object`
- Consumes existing: `starterState(): object`

`ModelCatalogItem` shape:

```js
{
  id: 'altura-576',
  name: 'Altura 576',
  family: 'Altura',
  sqft: 576,
  bedrooms: 1,
  bathrooms: 1,
  type: 'ADU',
  base_price: 165000,
  default_cogs_low: 86400,
  default_cogs_high: 97920
}
```

- [ ] **Step 1: Write failing model catalog/store tests**

Append this test content to `platform/server/tests/version10CommandCenter.test.js`:

```js
const { MODEL_CATALOG, getModelByName, applyModelDefaults } = require('../src/services/modelCatalog');
const { starterState } = require('../src/services/commandCenterStore');

test('Version 10 model catalog contains canonical ADU models', () => {
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
  const state = starterState();
  expect(state.version).toBe('Version 10');
  expect(state.model_catalog.length).toBeGreaterThanOrEqual(5);
  expect(state.projects[0]).toHaveProperty('client_phone');
  expect(state.projects[0]).toHaveProperty('client_email');
  expect(state.projects[0]).toHaveProperty('best_contact_time');
  expect(state.projects[0]).toHaveProperty('preferred_contact');
});

test('model defaults update square footage and estimate assumptions', () => {
  const project = { model: 'Altura', sqft: 1, bid_total: 1, cogs_low: 1, cogs_high: 1 };
  const updated = applyModelDefaults(project, 'Netherwood 550');
  expect(updated.model_id).toBe('netherwood-550');
  expect(updated.model).toBe('Netherwood 550');
  expect(updated.sqft).toBe(550);
  expect(updated.cogs_low).toBeGreaterThan(1);
  expect(updated.cogs_high).toBeGreaterThan(updated.cogs_low);
});

test('model lookup accepts existing display names', () => {
  expect(getModelByName('Altura 2BR').sqft).toBe(650);
  expect(getModelByName('Netherwood House').sqft).toBe(440);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- version10CommandCenter.test.js --runInBand`

Expected: FAIL because `modelCatalog.js` does not exist and `starterState().version` is still Version 9.

- [ ] **Step 3: Create `modelCatalog.js`**

Create `platform/server/src/services/modelCatalog.js`:

```js
const MODEL_CATALOG = [
  { id: 'netherwood-440', name: 'Netherwood 440', family: 'Netherwood', sqft: 440, bedrooms: 1, bathrooms: 1, type: 'ADU', base_price: 125400, default_cogs_low: 66000, default_cogs_high: 74800, aliases: ['Netherwood House', 'Netherwood 1BR', 'Bryn Mawr'] },
  { id: 'netherwood-550', name: 'Netherwood 550', family: 'Netherwood', sqft: 550, bedrooms: 2, bathrooms: 1, type: 'ADU', base_price: 156750, default_cogs_low: 82500, default_cogs_high: 93500, aliases: ['Netherwood 2BR', 'Netherwood two bedroom'] },
  { id: 'altura-576', name: 'Altura 576', family: 'Altura', sqft: 576, bedrooms: 1, bathrooms: 1, type: 'ADU', base_price: 164160, default_cogs_low: 86400, default_cogs_high: 97920, aliases: ['Altura', 'Altura 1BR'] },
  { id: 'altura-650', name: 'Altura 650', family: 'Altura', sqft: 650, bedrooms: 2, bathrooms: 1, type: 'ADU', base_price: 185250, default_cogs_low: 97500, default_cogs_high: 110500, aliases: ['Altura 2BR', 'Altura two bedroom'] },
  { id: 'cromwell-1280', name: 'Cromwell 1280', family: 'Cromwell', sqft: 1280, bedrooms: 2, bathrooms: 1.5, type: 'Single Family', base_price: 364800, default_cogs_low: 192000, default_cogs_high: 217600, aliases: ['The Cromwell', 'Cromwell'] },
  { id: 'series-750', name: '750 Series', family: '750 Series', sqft: 750, bedrooms: 2, bathrooms: 1, type: 'ADU', base_price: 213750, default_cogs_low: 112500, default_cogs_high: 127500, aliases: ['750 Series 2BR'] },
];

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function getModelById(modelId) {
  const found = MODEL_CATALOG.find(model => model.id === modelId);
  if (!found) throw new Error(`Unknown model id: ${modelId}`);
  return found;
}

function getModelByName(modelName) {
  const key = normalize(modelName);
  const found = MODEL_CATALOG.find(model =>
    normalize(model.name) === key ||
    normalize(model.family) === key ||
    (model.aliases || []).some(alias => normalize(alias) === key)
  );
  if (!found) throw new Error(`Unknown model name: ${modelName}`);
  return found;
}

function resolveModel(modelIdOrName) {
  return MODEL_CATALOG.find(model => model.id === modelIdOrName) || getModelByName(modelIdOrName);
}

function applyModelDefaults(project, modelIdOrName) {
  const model = resolveModel(modelIdOrName);
  return {
    ...project,
    model_id: model.id,
    model: model.name,
    sqft: model.sqft,
    bedrooms: model.bedrooms,
    bathrooms: model.bathrooms,
    bid_total: project.bid_total && project.bid_total > 1 ? project.bid_total : model.base_price,
    cogs_low: model.default_cogs_low,
    cogs_high: model.default_cogs_high,
  };
}

module.exports = {
  MODEL_CATALOG,
  getModelById,
  getModelByName,
  applyModelDefaults,
};
```

- [ ] **Step 4: Extend `commandCenterStore.js` starter state**

Import the catalog:

```js
const { MODEL_CATALOG, applyModelDefaults } = require('./modelCatalog');
```

Update `starterState()`:

```js
return {
  version: 'Version 10',
  updated_at: nowIso(),
  model_catalog: MODEL_CATALOG,
  ...
}
```

For each starter project, add:

```js
client_phone: '505-977-7659',
client_email: '',
preferred_contact: 'Phone',
best_contact_time: 'Morning',
site_visit_status: 'Completed',
utility_review_status: 'Needs confirmation',
sewer_confirmation_status: 'Needs sewer confirmation study',
setbacks_site_plan_status: 'Needs site plan',
```

Before returning the projects array, pass each starter project through `applyModelDefaults(project, project.model)`.

Update `saveCommandCenter()` so it saves `version: 'Version 10'`.

- [ ] **Step 5: Run model catalog tests**

Run: `npm test -- version10CommandCenter.test.js --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add platform/server/src/services/modelCatalog.js platform/server/src/services/commandCenterStore.js platform/server/tests/version10CommandCenter.test.js
git commit -m "Add Version 10 model catalog"
```

---

### Task 2: Add Estimate, Readiness, And Invoice Engine

**Files:**
- Create: `platform/server/src/services/estimateEngine.js`
- Modify: `platform/server/src/routes/commandCenter.js`
- Test: `platform/server/tests/version10CommandCenter.test.js`

**Interfaces:**
- Consumes: `applyModelDefaults(project, modelIdOrName)`
- Produces: `calculateProjectMetrics(project: object): object`
- Produces: `getReadinessLabel(project: object): string`
- Produces: `createInvoiceDrafts(project: object): Array<InvoiceDraft>`
- Produces route: `POST /api/command-center/projects/:projectId/apply-model`
- Produces route: `POST /api/command-center/projects/:projectId/invoice-drafts`

`InvoiceDraft` shape:

```js
{
  id: 'invoice-project-1',
  label: 'Invoice 1: $10,000 Preconstruction',
  amount: 10000,
  suggested_send_day: 0,
  status: 'Draft',
  notes: 'Due with signed preconstruction contract.'
}
```

- [ ] **Step 1: Add failing estimate tests**

Append:

```js
const { calculateProjectMetrics, getReadinessLabel, createInvoiceDrafts } = require('../src/services/estimateEngine');

test('project metrics calculate price per square foot and gross profit', () => {
  const metrics = calculateProjectMetrics({ sqft: 600, bid_total: 185000, cogs_low: 90000, cogs_high: 102000 });
  expect(metrics.price_per_sqft).toBe(308);
  expect(metrics.cogs_low_per_sqft).toBe(150);
  expect(metrics.cogs_high_per_sqft).toBe(170);
  expect(metrics.gross_profit_floor).toBe(83000);
});

test('readiness label prioritizes missing utility and engineering risks', () => {
  expect(getReadinessLabel({ utility_review_status: 'Needs confirmation' })).toBe('Needs utility review');
  expect(getReadinessLabel({ engineering_status: 'Needs engineering' })).toBe('Needs engineering');
  expect(getReadinessLabel({ address: '', site_visit_status: 'Not scheduled' })).toBe('Missing site data');
  expect(getReadinessLabel({ supplier_status: 'Needs supplier comparison' })).toBe('Needs supplier comparison');
  expect(getReadinessLabel({ utility_review_status: 'Confirmed', address: '435 Amherst Dr NE' })).toBe('Ready to send');
});

test('invoice drafts always start with ten thousand dollar preconstruction invoice', () => {
  const drafts = createInvoiceDrafts({ id: 'amherst-altura', bid_total: 185000 });
  expect(drafts[0].label).toBe('Invoice 1: $10,000 Preconstruction');
  expect(drafts[0].amount).toBe(10000);
  expect(drafts[1].amount).toBe(92500);
  expect(drafts[2].label).toContain('Draw');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- version10CommandCenter.test.js --runInBand`

Expected: FAIL because `estimateEngine.js` does not exist.

- [ ] **Step 3: Create `estimateEngine.js`**

Create:

```js
function dollarsPerSqft(amount, sqft) {
  if (!sqft) return 0;
  return Math.round(Number(amount || 0) / Number(sqft));
}

function calculateProjectMetrics(project) {
  const bid = Number(project.bid_total || 0);
  const cogsLow = Number(project.cogs_low || 0);
  const cogsHigh = Number(project.cogs_high || 0);
  return {
    price_per_sqft: dollarsPerSqft(bid, project.sqft),
    cogs_low_per_sqft: dollarsPerSqft(cogsLow, project.sqft),
    cogs_high_per_sqft: dollarsPerSqft(cogsHigh, project.sqft),
    gross_profit_floor: bid - cogsHigh,
    gross_profit_ceiling: bid - cogsLow,
  };
}

function getReadinessLabel(project) {
  if (!project.address || project.site_visit_status === 'Not scheduled') return 'Missing site data';
  if (project.engineering_status === 'Needs engineering') return 'Needs engineering';
  if (project.utility_review_status && project.utility_review_status !== 'Confirmed') return 'Needs utility review';
  if (project.supplier_status === 'Needs supplier comparison') return 'Needs supplier comparison';
  return 'Ready to send';
}

function createInvoiceDrafts(project) {
  const total = Number(project.bid_total || 0);
  const first = 10000;
  const second = Math.round(total * 0.5);
  const remaining = Math.max(total - first - second, 0);
  return [
    { id: `invoice-${project.id}-1`, label: 'Invoice 1: $10,000 Preconstruction', amount: first, suggested_send_day: 0, status: 'Draft', notes: 'Due with signed preconstruction contract.' },
    { id: `invoice-${project.id}-2`, label: 'Invoice 2: 50% Contract Mobilization', amount: second, suggested_send_day: 14, status: 'Draft', notes: 'Send after final contract approval and permit pathway confirmation.' },
    { id: `invoice-${project.id}-3`, label: 'Invoice 3: Draw Payment', amount: remaining, suggested_send_day: 45, status: 'Draft', notes: 'Draw payment tied to field progress and critical path schedule.' },
  ];
}

module.exports = {
  calculateProjectMetrics,
  getReadinessLabel,
  createInvoiceDrafts,
};
```

- [ ] **Step 4: Add command center routes**

In `platform/server/src/routes/commandCenter.js`, import:

```js
const { applyModelDefaults } = require('../services/modelCatalog');
const { createInvoiceDrafts } = require('../services/estimateEngine');
```

Add:

```js
router.post('/projects/:projectId/apply-model', async (req, res) => {
  const state = await loadCommandCenter();
  const projects = (state.projects || []).map(project =>
    project.id === req.params.projectId ? applyModelDefaults(project, req.body?.model || req.body?.model_id) : project
  );
  res.status(200).json(await saveCommandCenter({ projects }));
});

router.post('/projects/:projectId/invoice-drafts', async (req, res) => {
  const state = await loadCommandCenter();
  const project = (state.projects || []).find(item => item.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const invoiceDrafts = createInvoiceDrafts(project);
  const projects = (state.projects || []).map(item =>
    item.id === req.params.projectId ? { ...item, invoice_drafts: invoiceDrafts } : item
  );
  res.status(201).json(await saveCommandCenter({ projects }));
});
```

- [ ] **Step 5: Run tests**

Run: `npm test -- version10CommandCenter.test.js --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add platform/server/src/services/estimateEngine.js platform/server/src/routes/commandCenter.js platform/server/tests/version10CommandCenter.test.js
git commit -m "Add Version 10 estimate and invoice engine"
```

---

### Task 3: Add Supplier COGS And SIP/PUR Comparison Engine

**Files:**
- Create: `platform/server/src/services/supplierEngine.js`
- Modify: `platform/server/src/routes/commandCenter.js`
- Modify: `platform/server/src/services/commandCenterStore.js`
- Test: `platform/server/tests/version10CommandCenter.test.js`

**Interfaces:**
- Produces: `calculateSupplierTotals(packages: Array<object>): object`
- Produces: `applySupplierQuoteToProject(project: object, quote: object): object`
- Produces: `compareBuildMethods(input: object): object`
- Produces route: `POST /api/command-center/projects/:projectId/send-supplier-to-cogs`

- [ ] **Step 1: Add failing supplier tests**

Append:

```js
const { calculateSupplierTotals, applySupplierQuoteToProject, compareBuildMethods } = require('../src/services/supplierEngine');

test('supplier totals include required Version 10 vendors', () => {
  const state = starterState();
  const totals = calculateSupplierTotals(state.supplier_quotes);
  expect(Object.keys(totals.by_supplier)).toContain("Lowe's Pro Desk - 12th Street");
  expect(Object.keys(totals.by_supplier)).toContain('RAKS Building Supply - Jonathan Baca');
  expect(Object.keys(totals.by_supplier)).toContain('Rio Grande Building Supply');
  expect(Object.keys(totals.by_supplier)).toContain('Muras SIP/PUR Panels');
});

test('send supplier quote to COGS updates selected project high and low COGS', () => {
  const project = { cogs_low: 90000, cogs_high: 102000 };
  const quote = { quoted_total: 16000 };
  const updated = applySupplierQuoteToProject(project, quote);
  expect(updated.cogs_low).toBe(106000);
  expect(updated.cogs_high).toBe(118000);
});

test('SIP/PUR comparison accounts for labor savings and schedule compression', () => {
  const comparison = compareBuildMethods({
    conventional_materials: 72000,
    conventional_labor: 42000,
    conventional_days: 24,
    sip_materials: 16000,
    sip_labor: 14000,
    sip_days: 8,
  });
  expect(comparison.conventional_total).toBe(114000);
  expect(comparison.sip_total).toBe(30000);
  expect(comparison.labor_savings).toBe(28000);
  expect(comparison.schedule_days_saved).toBe(16);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- version10CommandCenter.test.js --runInBand`

Expected: FAIL because `supplierEngine.js` does not exist.

- [ ] **Step 3: Create `supplierEngine.js`**

Create:

```js
function calculateSupplierTotals(packages) {
  return (packages || []).reduce((acc, item) => {
    const supplier = item.supplier || 'Unknown supplier';
    acc.total += Number(item.quoted_total || 0);
    acc.by_supplier[supplier] = (acc.by_supplier[supplier] || 0) + Number(item.quoted_total || 0);
    return acc;
  }, { total: 0, by_supplier: {} });
}

function applySupplierQuoteToProject(project, quote) {
  const amount = Number(quote.quoted_total || 0);
  return {
    ...project,
    cogs_low: Number(project.cogs_low || 0) + amount,
    cogs_high: Number(project.cogs_high || 0) + amount,
    supplier_status: 'Supplier quote added to COGS',
  };
}

function compareBuildMethods(input) {
  const conventionalTotal = Number(input.conventional_materials || 0) + Number(input.conventional_labor || 0);
  const sipTotal = Number(input.sip_materials || 0) + Number(input.sip_labor || 0);
  return {
    conventional_total: conventionalTotal,
    sip_total: sipTotal,
    labor_savings: Number(input.conventional_labor || 0) - Number(input.sip_labor || 0),
    schedule_days_saved: Number(input.conventional_days || 0) - Number(input.sip_days || 0),
    cogs_delta: sipTotal - conventionalTotal,
  };
}

module.exports = {
  calculateSupplierTotals,
  applySupplierQuoteToProject,
  compareBuildMethods,
};
```

- [ ] **Step 4: Extend starter suppliers**

In `commandCenterStore.js`, ensure `supplier_quotes` includes:

```js
{
  id: 'rio-grande-building',
  supplier: 'Rio Grande Building Supply',
  package: 'Regional materials quote: lumber, sheetrock, delivery, and availability check',
  status: 'Needs outreach',
  delivery: 'Confirm Bernalillo-area delivery and lead time',
  quoted_total: 0,
  next_action: 'Request comparable package against Lowe’s and RAKS.'
}
```

Ensure the SIP supplier is named exactly `Muras SIP/PUR Panels`.

- [ ] **Step 5: Add `send-supplier-to-cogs` route**

In `commandCenter.js`, import:

```js
const { applySupplierQuoteToProject } = require('../services/supplierEngine');
```

Add:

```js
router.post('/projects/:projectId/send-supplier-to-cogs', async (req, res) => {
  const state = await loadCommandCenter();
  const quote = (state.supplier_quotes || []).find(item => item.id === req.body?.quote_id);
  if (!quote) return res.status(404).json({ error: 'Supplier quote not found' });
  const projects = (state.projects || []).map(project =>
    project.id === req.params.projectId ? applySupplierQuoteToProject(project, quote) : project
  );
  res.status(200).json(await saveCommandCenter({ projects }));
});
```

- [ ] **Step 6: Run tests**

Run: `npm test -- version10CommandCenter.test.js --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add platform/server/src/services/supplierEngine.js platform/server/src/routes/commandCenter.js platform/server/src/services/commandCenterStore.js platform/server/tests/version10CommandCenter.test.js
git commit -m "Add Version 10 supplier COGS engine"
```

---

### Task 4: Add Weather Crew Action Messages

**Files:**
- Create: `platform/server/src/services/crewMessageEngine.js`
- Modify: `platform/server/src/routes/weather.js`
- Test: `platform/server/tests/version10CommandCenter.test.js`

**Interfaces:**
- Consumes: weather forecast object with `risks: Array<{type, impacted_work, delay_days}>`
- Produces: `createCrewMessagesFromForecast(project: object, forecast: object): Array<CrewMessage>`

`CrewMessage` shape:

```js
{
  id: 'crew-roofing-123',
  project_id: 'amherst-altura',
  trade: 'roofing',
  reason: 'Weather risk',
  body: 'Weather risk for Amherst homeowner: roofing may be delayed...',
  status: 'Draft',
  created_at: '2026-08-24T00:00:00.000Z'
}
```

- [ ] **Step 1: Add failing crew message test**

Append:

```js
const { createCrewMessagesFromForecast } = require('../src/services/crewMessageEngine');

test('weather risks create text-ready crew messages for affected trades', () => {
  const messages = createCrewMessagesFromForecast(
    { id: 'amherst-altura', client: 'Amherst homeowner' },
    { risk_level: 'high', delay_days: 7, risks: [{ impacted_work: ['roofing', 'trenching'] }], crew_message: 'Weather risk for 87106: HIGH risk.' }
  );
  expect(messages.map(message => message.trade)).toContain('roofing');
  expect(messages.map(message => message.trade)).toContain('trenching');
  expect(messages[0].body).toContain('Amherst homeowner');
  expect(messages[0].status).toBe('Draft');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- version10CommandCenter.test.js --runInBand`

Expected: FAIL because `crewMessageEngine.js` does not exist.

- [ ] **Step 3: Create `crewMessageEngine.js`**

Create:

```js
function createCrewMessagesFromForecast(project, forecast) {
  const trades = [...new Set((forecast.risks || []).flatMap(risk => risk.impacted_work || []))];
  return trades.map(trade => ({
    id: `crew-${trade.replace(/\s+/g, '-')}-${Date.now()}`,
    project_id: project.id,
    trade,
    reason: 'Weather risk',
    body: `${forecast.crew_message} Project: ${project.client}. ${trade} crew should confirm recovery plan and schedule impact.`,
    status: 'Draft',
    created_at: new Date().toISOString(),
  }));
}

module.exports = {
  createCrewMessagesFromForecast,
};
```

- [ ] **Step 4: Update weather activity route**

In `platform/server/src/routes/weather.js`, import:

```js
const { createCrewMessagesFromForecast } = require('../services/crewMessageEngine');
```

Inside `router.post('/forecast/activity'...)`, find the active project object:

```js
const projectRecord = (state.projects || []).find(projectItem => projectItem.client === project) || state.projects?.[0] || { id: 'unknown-project', client: project };
const crewMessages = createCrewMessagesFromForecast(projectRecord, forecast);
```

Save:

```js
crew_messages: [...crewMessages, ...(state.crew_messages || [])].slice(0, 40),
```

- [ ] **Step 5: Run tests**

Run: `npm test -- version10CommandCenter.test.js --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add platform/server/src/services/crewMessageEngine.js platform/server/src/routes/weather.js platform/server/tests/version10CommandCenter.test.js
git commit -m "Add Version 10 weather crew messages"
```

---

### Task 5: Update Command Center UI To Version 10

**Files:**
- Modify: `platform/client/src/pages/CommandCenter.jsx`
- Modify: `tests/platform-command-center-ui.test.js`

**Interfaces:**
- Consumes: `state.model_catalog`
- Consumes route: `POST /api/command-center/projects/:projectId/apply-model`
- Consumes route: `POST /api/command-center/projects/:projectId/invoice-drafts`
- Consumes route: `POST /api/command-center/projects/:projectId/send-supplier-to-cogs`

- [ ] **Step 1: Add failing UI assertions**

Update `tests/platform-command-center-ui.test.js` to assert these strings:

```js
contains(page, 'Server-backed Version 10');
contains(page, 'Builder Operating System');
contains(page, 'Project Intake');
contains(page, 'Best contact time');
contains(page, 'Apply Model Defaults');
contains(page, 'Create $10k Invoice');
contains(page, 'Send to COGS');
contains(page, 'SIP/PUR vs Conventional');
contains(page, 'Crew Messages');
contains(page, "fetch('/api/command-center/projects/");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/platform-command-center-ui.test.js`

Expected: FAIL because Command Center still has Version 9 copy and lacks the new button labels.

- [ ] **Step 3: Update header and daily triage copy**

In `CommandCenter.jsx`, change:

```jsx
<h1 style={styles.title}>Builder Command Center</h1>
<div style={{ color: '#CFC7BC', marginTop: 6 }}>Server-backed Version 9 demo · mobile-first builder triage</div>
<span style={styles.badge}>Version 9</span>
```

to:

```jsx
<h1 style={styles.title}>Builder Operating System</h1>
<div style={{ color: '#CFC7BC', marginTop: 6 }}>Server-backed Version 10 · mobile-first project, bid, invoice, supplier, and crew triage</div>
<span style={styles.badge}>Version 10</span>
```

- [ ] **Step 4: Add model-default handler**

Add function:

```jsx
const applyModelDefaults = async (projectId, model) => {
  const saved = await fetch(`/api/command-center/projects/${projectId}/apply-model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  }).then(r => r.json());
  setState(saved);
};
```

In `ProjectCard`, replace free-text model entry with a select fed by `state.model_catalog`, and add a button:

```jsx
<button style={styles.ghost} onClick={() => onApplyModel(project.id, project.model)}>Apply Model Defaults</button>
```

Pass `modelCatalog={state.model_catalog || []}` and `onApplyModel={applyModelDefaults}` into `ProjectCard`.

- [ ] **Step 5: Add project intake fields**

In `ProjectCard`, add inputs for:

```jsx
client_phone
client_email
preferred_contact
best_contact_time
site_visit_status
utility_review_status
sewer_confirmation_status
setbacks_site_plan_status
```

Label the section `Project Intake`.

- [ ] **Step 6: Add invoice draft button**

Add function:

```jsx
const createInvoiceDrafts = async (projectId) => {
  const saved = await fetch(`/api/command-center/projects/${projectId}/invoice-drafts`, { method: 'POST' }).then(r => r.json());
  setState(saved);
};
```

Add button:

```jsx
<button style={styles.button} onClick={() => onCreateInvoices(project.id)}>Create $10k Invoice</button>
```

Render `project.invoice_drafts` as compact cards.

- [ ] **Step 7: Add supplier-to-COGS action**

Add function:

```jsx
const sendSupplierToCogs = async (quoteId) => {
  const projectId = state.projects?.[0]?.id;
  const saved = await fetch(`/api/command-center/projects/${projectId}/send-supplier-to-cogs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote_id: quoteId }),
  }).then(r => r.json());
  setState(saved);
};
```

In each supplier row/card, add:

```jsx
<button style={styles.ghost} onClick={() => sendSupplierToCogs(q.id)}>Send to COGS</button>
```

Add a compact section label `SIP/PUR vs Conventional` in the supplier card.

- [ ] **Step 8: Render crew messages**

Add a `Crew Messages` card that renders `(state.crew_messages || []).slice(0, 5)` with trade, status, and body.

- [ ] **Step 9: Run UI test and client build**

Run:

```bash
node tests/platform-command-center-ui.test.js
npm run build
```

Expected: both PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add platform/client/src/pages/CommandCenter.jsx tests/platform-command-center-ui.test.js platform/client/build
git commit -m "Update Command Center for Version 10"
```

---

### Task 6: Add Version 10 Deployment Guide

**Files:**
- Create: `docs/version-10-platform-deployment.md`
- Create: `deploy-platform.example.sh`
- Test: `tests/version10-deployment-docs.test.js`

**Interfaces:**
- Produces documented deployment path for full platform app.
- Produces example script that requires caller-supplied host and does not hard-code private-only deployment as the external review URL.

- [ ] **Step 1: Add failing deployment docs test**

Create `tests/version10-deployment-docs.test.js`:

```js
const assert = require('assert');
const fs = require('fs');

const guide = fs.readFileSync('docs/version-10-platform-deployment.md', 'utf8');
const script = fs.readFileSync('deploy-platform.example.sh', 'utf8');

function contains(file, snippet) {
  assert(file.includes(snippet), `Expected content to contain: ${snippet}`);
}

contains(guide, 'Version 10 Platform Deployment');
contains(guide, 'Local test URL');
contains(guide, 'LAN URL');
contains(guide, 'Public external URL');
contains(guide, 'Static-only GitHub Pages is insufficient');
contains(guide, 'npm run build');
contains(guide, 'npm start');
contains(script, 'TARGET_HOST');
contains(script, 'platform/client/build');
contains(script, 'platform/server');

console.log('Version 10 deployment docs checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/version10-deployment-docs.test.js`

Expected: FAIL because guide and script do not exist.

- [ ] **Step 3: Create deployment guide**

Create `docs/version-10-platform-deployment.md`:

```md
# Version 10 Platform Deployment

Version 10 requires the full platform app: React build output plus the Express API server. Static-only GitHub Pages is insufficient for the builder Command Center because the app saves project, estimate, supplier, weather, receipt, and mileage data through server routes.

## Local test URL

- `http://localhost:4000/command-center`
- Start from `platform/server` with `npm start` after building `platform/client`.

## LAN URL

- Use a LAN host only for devices on the same network.
- The older `10.0.0.166:3001` design server is not a public external URL.

## Public external URL

- Requires a reachable domain, public IP, or tunnel.
- The Express server can run behind nginx, Caddy, Cloudflare Tunnel, or another HTTPS reverse proxy.

## Build and start

1. From `platform/client`, run `npm run build`.
2. Copy `platform/client/build` and `platform/server` to the target host.
3. From `platform/server`, run `npm install --omit=dev`.
4. Start with `npm start` or a systemd service.
5. Verify `/health`, `/command-center`, `/api/command-center`, and `/api/weather/forecast?zip=87106`.

## Required environment variables

- `PORT` defaults to `4000`.
- `COMMAND_CENTER_STORE_PATH` can point to a writable JSON file on the server.
- Optional integration variables remain optional: Clerk, Stripe, Twilio, InvoiceShelf, SMTP, and EspoCRM.
```

- [ ] **Step 4: Create example deployment script**

Create `deploy-platform.example.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-}"
TARGET_DIR="${TARGET_DIR:-/home/ahmad/abqadu-platform}"

if [ -z "$TARGET_HOST" ]; then
  echo "Set TARGET_HOST, for example: TARGET_HOST=ahmad@example.com ./deploy-platform.example.sh" >&2
  exit 1
fi

(cd platform/client && npm run build)

ssh "$TARGET_HOST" "mkdir -p '$TARGET_DIR/platform/client' '$TARGET_DIR/platform/server'"
rsync -az --delete platform/client/build/ "$TARGET_HOST:$TARGET_DIR/platform/client/build/"
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='data' \
  platform/server/ "$TARGET_HOST:$TARGET_DIR/platform/server/"

ssh "$TARGET_HOST" "cd '$TARGET_DIR/platform/server' && npm install --omit=dev"

echo "Deploy copied. Start or restart the server on the host with: cd $TARGET_DIR/platform/server && npm start"
```

- [ ] **Step 5: Run docs test**

Run: `node tests/version10-deployment-docs.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add docs/version-10-platform-deployment.md deploy-platform.example.sh tests/version10-deployment-docs.test.js
git commit -m "Document Version 10 platform deployment"
```

---

### Task 7: Final Version 10 Verification And Push

**Files:**
- Modify if needed: `index.html`
- Modify if needed: `platform.html`
- Modify if needed: static tests covering visible version text

**Interfaces:**
- Produces pushed `Version-10` branch with verified local demo.

- [ ] **Step 1: Check visible version copy**

Run:

```bash
rg -n "Version 9|VERSION 9|Version 8|VERSION 8|Version 7|VERSION 7" index.html platform.html platform/client/src tests
```

Expected: no stale visible platform copy remains except historical docs or intentional test fixture text. If stale visible website/platform copy appears, update it to `Version 10`.

- [ ] **Step 2: Run static tests**

Run:

```bash
node tests/platform-command-center-ui.test.js
node tests/version10-deployment-docs.test.js
```

Expected: PASS.

- [ ] **Step 3: Run server tests**

Run:

```bash
cd platform/server && npm test -- --runInBand
```

Expected: PASS with all suites passing.

- [ ] **Step 4: Run client build**

Run:

```bash
cd platform/client && npm run build
```

Expected: compiled successfully.

- [ ] **Step 5: Verify local endpoints**

Start server from `platform/server`:

```bash
npm start
```

Check:

```bash
curl -sS http://localhost:4000/health
curl -sS -o /tmp/abqadu-v10-command-center.html -w '%{http_code}' http://localhost:4000/command-center
curl -sS http://localhost:4000/api/command-center
curl -sS 'http://localhost:4000/api/weather/forecast?zip=87106'
```

Expected:

- `/health` returns `{"ok":true}`.
- `/command-center` returns HTTP `200`.
- `/api/command-center` returns JSON with `"version":"Version 10"`.
- weather route returns JSON with `source:"wttr.in"` when outbound network is available.

- [ ] **Step 6: Commit any final fixes**

Run:

```bash
git status --short
git add index.html platform.html platform/client/src/pages/CommandCenter.jsx tests/platform-command-center-ui.test.js
git commit -m "Finalize Version 10 builder operating system"
```

Skip `git add` and `git commit` if `git status --short` shows no final Version 10 source changes.

- [ ] **Step 7: Push branch**

Run:

```bash
git push origin Version-10
```

Expected: branch pushed to GitHub.

---

## Self-Review Results

- Spec coverage: covered model catalog, project intake, estimate/invoice workflow, supplier COGS, SIP/PUR comparison, weather crew messages, deployment, Version 10 labels, and verification.
- Placeholder scan: no incomplete markers or undefined future implementation steps remain.
- Type consistency: interfaces use `MODEL_CATALOG`, `applyModelDefaults`, `calculateProjectMetrics`, `createInvoiceDrafts`, `calculateSupplierTotals`, `applySupplierQuoteToProject`, `compareBuildMethods`, and `createCrewMessagesFromForecast` consistently across tasks.
