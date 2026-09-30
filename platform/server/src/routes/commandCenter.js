const router = require('../asyncRouter')();
const { randomUUID } = require('node:crypto');
const { createClientPacketPdf } = require('../services/clientPacketPdf');
const { OWNED_FIELDS } = require('../services/contractorDesk');
const { createActivityEvent } = require('../services/activityEvents');
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
  try {
    const saved = await saveCommandCenter(current => sendSupplierPackageToCogs(current, {
      project_id: req.body?.project_id || req.body?.projectId,
      package_id: req.body?.package_id || req.body?.packageId || req.body?.quote_id || req.body?.quoteId,
    }));
    res.status(201).json(saved);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.post('/projects/:projectId/send-supplier-to-cogs', async (req, res) => {
  try {
    const saved = await saveCommandCenter(current => sendSupplierPackageToCogs(current, {
      project_id: req.params.projectId,
      package_id: req.body?.package_id || req.body?.packageId || req.body?.quote_id || req.body?.quoteId,
    }));
    res.status(201).json(saved);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.put('/', async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Expected a command-center update object.' });
  }
  if (OWNED_FIELDS.some(key => Object.prototype.hasOwnProperty.call(req.body, key))) {
    return res.status(400).json({ error: 'Bid requests, text replies, contact preferences, and weather holds must use their dedicated workflows.' });
  }
  res.json(await saveCommandCenter(req.body || {}));
});

router.post('/reset', async (_req, res) => {
  res.json(await resetCommandCenter());
});

router.post('/activity', async (req, res) => {
  const body = req.body === undefined ? {} : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected an activity object.' });
  }
  const type = body.type === undefined ? 'Builder note' : body.type;
  const detail = body.detail === undefined ? 'Version 10 builder activity logged.' : body.detail;
  const scoped = Object.prototype.hasOwnProperty.call(body, 'project_id');
  if (typeof type !== 'string' || !type.trim() || type.length > 80 || /[\u0000-\u001f\u007f]/.test(type)) {
    return res.status(400).json({ error: 'Activity type must contain 1 to 80 characters without control characters.' });
  }
  if (typeof detail !== 'string' || !detail.trim() || detail.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(detail)) {
    return res.status(400).json({ error: 'Activity detail must contain 1 to 2000 characters without control characters.' });
  }
  if (scoped && (typeof body.project_id !== 'string' || !body.project_id.trim() || body.project_id.length > 120 || /[\u0000-\u001f\u007f]/.test(body.project_id))) {
    return res.status(400).json({ error: 'Invalid project ID.' });
  }
  let event;
  try {
    const saved = await saveCommandCenter(current => {
      if (scoped && !findProject(current, body.project_id)) {
        throw Object.assign(new Error('Project not found.'), { status: 404 });
      }
      const item = {
        id: `activity-${randomUUID()}`, type: type.trim(), detail: detail.trim(), at: new Date().toISOString(),
        ...(scoped ? { project_id: body.project_id } : {}),
      };
      if (scoped) {
        const textDraft = item.type === 'Builder text';
        event = createActivityEvent({
          project_id: body.project_id, actor_id: req.workspaceAuth.userId,
          type: textDraft ? 'text.draft_logged' : 'note.logged',
          summary: textDraft ? 'Saved text draft for review.' : 'Saved project note.', text: item.detail,
        });
      }
      return { activity: [item, ...(Array.isArray(current.activity) ? current.activity : [])].slice(0, 40) };
    }, { events: () => event ? [event] : [] });
    res.set('Cache-Control', 'private, no-store');
    return res.status(201).json(saved);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    throw error;
  }
});

router.post('/projects/:projectId/apply-model', async (req, res) => {
  const model = req.body?.model_id || req.body?.model;
  if (!model) return res.status(400).json({ error: 'model or model_id is required' });

  try {
    const state = await loadCommandCenter();
    const { found, projects } = updateProject(state, req.params.projectId, project => (
      applyModelDefaults(project, model, state)
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
    readiness_label: getReadinessLabel(item, state),
    metrics: calculateProjectMetrics(item),
  }));

  res.status(201).json(await saveCommandCenter({ projects }));
});

router.get('/projects/:projectId/client-view-preview', async (req, res) => {
  const state = await loadCommandCenter();
  const project = findProject(state, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  res.json(createClientViewPreview(project, state));
});

router.get('/projects/:projectId/client-packet.pdf', async (req, res) => {
  const state = await loadCommandCenter();
  const project = findProject(state, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  try {
    const pdf = await createClientPacketPdf(createClientViewPreview(project, state));
    await saveCommandCenter(() => ({}), { events: [createActivityEvent({
      project_id: project.id, type: 'document.generated', summary: 'Generated client packet PDF.',
      actor_id: req.workspaceAuth.userId,
    })] });
    const filenameId = String(project.id || 'project').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="abq-adu-${filenameId}-packet.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(pdf);
  } catch {
    res.status(503).json({ error: 'Packet PDF is temporarily unavailable. Try again; if this continues, check that the server has Puppeteer Chromium installed.' });
  }
});

module.exports = router;
