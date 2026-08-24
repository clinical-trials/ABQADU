const router = require('express').Router();
const {
  loadCommandCenter,
  saveCommandCenter,
  resetCommandCenter,
} = require('../services/commandCenterStore');
const {
  applyModelDefaults,
  buildDrawSchedule,
  calculateProjectMetrics,
  createClientViewPreview,
  createInvoiceDrafts,
  getReadinessLabel,
} = require('../services/estimateEngine');

function findProject(state, projectId) {
  return (state.projects || []).find(project => project.id === projectId);
}

function updateProject(state, projectId, updateFn) {
  let found = false;
  const projects = (state.projects || []).map(project => {
    if (project.id !== projectId) return project;
    found = true;
    return updateFn(project);
  });
  return { found, projects };
}
const {
  buildSupplierBidout,
  sendSupplierPackageToCogs,
} = require('../services/supplierEngine');

router.get('/', async (_req, res) => {
  res.json(await loadCommandCenter());
});

router.get('/supplier-bidout', async (req, res) => {
  const state = await loadCommandCenter();
  const projectId = req.query?.project_id || req.query?.projectId;
  const projects = Array.isArray(state.projects) ? state.projects : [];
  const project = projects.find(row => row.id === projectId) || projects[0] || {};
  res.json(buildSupplierBidout({
    project,
    customPackages: Array.isArray(state.supplier_packages) ? state.supplier_packages : [],
  }));
});

router.post('/supplier-bidout/send-to-cogs', async (req, res) => {
  const state = await loadCommandCenter();
  try {
    const nextState = sendSupplierPackageToCogs(state, {
      project_id: req.body?.project_id || req.body?.projectId,
      package_id: req.body?.package_id || req.body?.packageId || req.body?.quote_id || req.body?.quoteId,
    });
    res.status(201).json(await saveCommandCenter(nextState));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.post('/projects/:projectId/send-supplier-to-cogs', async (req, res) => {
  const state = await loadCommandCenter();
  try {
    const nextState = sendSupplierPackageToCogs(state, {
      project_id: req.params.projectId,
      package_id: req.body?.package_id || req.body?.packageId || req.body?.quote_id || req.body?.quoteId,
    });
    res.status(201).json(await saveCommandCenter(nextState));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.put('/', async (req, res) => {
  res.json(await saveCommandCenter(req.body || {}));
});

router.post('/reset', async (_req, res) => {
  res.json(await resetCommandCenter());
});

router.post('/activity', async (req, res) => {
  const state = await loadCommandCenter();
  const activity = Array.isArray(state.activity) ? state.activity : [];
  const item = {
    id: `activity-${Date.now()}`,
    type: req.body?.type || 'Builder note',
    detail: req.body?.detail || 'Version 10 builder activity logged.',
    at: new Date().toISOString(),
  };
  res.status(201).json(await saveCommandCenter({
    activity: [item, ...activity].slice(0, 40),
  }));
});

router.post('/projects/:projectId/apply-model', async (req, res) => {
  const model = req.body?.model_id || req.body?.model;
  if (!model) return res.status(400).json({ error: 'model or model_id is required' });

  try {
    const state = await loadCommandCenter();
    const { found, projects } = updateProject(state, req.params.projectId, project => (
      applyModelDefaults(project, model)
    ));
    if (!found) return res.status(404).json({ error: 'Project not found' });

    res.json(await saveCommandCenter({ projects }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/projects/:projectId/invoice-drafts', async (req, res) => {
  const state = await loadCommandCenter();
  const project = findProject(state, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const invoiceDrafts = createInvoiceDrafts(project);
  const drawSchedule = buildDrawSchedule(project);
  const { projects } = updateProject(state, req.params.projectId, item => ({
    ...item,
    invoice_drafts: invoiceDrafts,
    draw_schedule: drawSchedule,
    readiness_label: getReadinessLabel(item),
    metrics: calculateProjectMetrics(item),
  }));

  res.status(201).json(await saveCommandCenter({ projects }));
});

router.get('/projects/:projectId/client-view-preview', async (req, res) => {
  const state = await loadCommandCenter();
  const project = findProject(state, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  res.json(createClientViewPreview(project));
});

module.exports = router;
