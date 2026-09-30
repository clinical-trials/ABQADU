const { randomUUID } = require('node:crypto');
const createRouter = require('../asyncRouter');
const { loadCommandCenter, saveCommandCenter } = require('../services/commandCenterStore');
const { createActivityEvent } = require('../services/activityEvents');

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const MAX_SCHEDULE_ID = 2147483647;
const LOOKUP_TIMEOUT_MS = 5000;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const linksIn = state => Array.isArray(state.schedule_links) ? state.schedule_links : [];
const linkFor = (state, id) => linksIn(state).find(link => link.project_id === id) || null;
function requireProject(state, id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 120 || /[\u0000-\u001f\u007f]/.test(id)) fail(400, 'Invalid project ID.');
  if (!(state.projects || []).some(project => project.id === id)) fail(404, 'The saved project does not exist.');
}
function inputFor(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Expected a schedule-link update.');
  if (body.schedule_project_id !== null && (!Number.isInteger(body.schedule_project_id) || body.schedule_project_id <= 0 || body.schedule_project_id > MAX_SCHEDULE_ID)) fail(400, 'Choose a schedule project ID between 1 and 2147483647, or null to unlink.');
  if (body.expected_version !== null && (typeof body.expected_version !== 'string' || !UUID.test(body.expected_version))) fail(400, 'Include the last saved link version, or null if no association exists.');
  if (typeof body.request_id !== 'string' || !UUID.test(body.request_id)) fail(400, 'A UUID request_id is required to save the association safely.');
  return { schedule_project_id: body.schedule_project_id, expected_version: body.expected_version?.toLowerCase() || null, request_id: body.request_id.toLowerCase() };
}

function checkChange(current, projectId, actor, input) {
  requireProject(current, projectId);
  const previous = linkFor(current, projectId);
  const priorRequest = (current.activity_events || []).find(row => row.request_id === input.request_id);
  if (priorRequest) {
    if (priorRequest.project_id !== projectId || priorRequest.actor_id !== actor
      || !['project.schedule_linked', 'project.schedule_unlinked'].includes(priorRequest.type)
      || priorRequest.schedule_link?.schedule_project_id !== input.schedule_project_id
      || priorRequest.schedule_link?.expected_version !== input.expected_version) {
      fail(409, 'This request ID already belongs to a different action.');
    }
    return 'replay';
  }
  if ((previous?.version || null) !== input.expected_version) fail(409, 'The schedule association changed. Reload it before saving again.');
  return (previous?.schedule_project_id ?? null) === input.schedule_project_id ? 'unchanged' : 'change';
}

function createProjectScheduleLinkRouter({
  query = (text, values) => require('../db').pool.query({ text, values, query_timeout: LOOKUP_TIMEOUT_MS }),
  lookupTimeoutMs = LOOKUP_TIMEOUT_MS,
} = {}) {
  const router = createRouter();
  async function lookup(id) {
    let timer;
    try {
      // The outer deadline also bounds waiting for a pool connection. This read
      // happens outside the JSON write queue and cannot publish a late result.
      const result = await Promise.race([
        Promise.resolve().then(() => query('SELECT id, name FROM projects WHERE id=$1', [id])),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Schedule lookup timed out.')), lookupTimeoutMs); }),
      ]);
      return result.rows[0] || null;
    }
    catch { fail(503, 'Schedule data is temporarily unavailable. The saved association has not changed.'); }
    finally { clearTimeout(timer); }
  }
  async function describe(link, knownTarget) {
    if (!link) return null;
    if (link.schedule_project_id === null) return { ...link, schedule_name: null, status: 'available' };
    try {
      const target = knownTarget === undefined ? await lookup(link.schedule_project_id) : knownTarget;
      return { ...link, schedule_name: typeof target?.name === 'string' ? target.name.trim().slice(0, 200) : null, status: target ? 'available' : 'missing' };
    } catch { return { ...link, schedule_name: null, status: 'unavailable' }; }
  }
  function handle(action) {
    return async (req, res) => {
      res.set('Cache-Control', 'private, no-store');
      try { await action(req, res); }
      catch (error) {
        const expected = [400, 404, 409, 503].includes(error.status);
        res.status(expected ? error.status : 503).json({ error: expected ? error.message : 'The schedule association is temporarily unavailable. Reload before trying again.' });
      }
    };
  }
  router.get('/projects/:projectId/schedule-link', handle(async (req, res) => {
    const state = await loadCommandCenter();
    requireProject(state, req.params.projectId);
    res.json({ link: await describe(linkFor(state, req.params.projectId)) });
  }));
  router.put('/projects/:projectId/schedule-link', handle(async (req, res) => {
    const input = inputFor(req.body);
    const projectId = req.params.projectId, actor = req.workspaceAuth.userId;
    let nextLink, event, target, replayed = false;
    const preflight = checkChange(await loadCommandCenter(), projectId, actor, input);
    if (preflight === 'change' && input.schedule_project_id !== null) {
      target = await lookup(input.schedule_project_id);
      if (!target) fail(404, 'The selected schedule project does not exist.');
    }
    const saved = await saveCommandCenter(current => {
      // Recheck against the newest JSON state after the independent SQL read.
      const change = checkChange(current, projectId, actor, input);
      if (change === 'replay') {
        // Return the current association. Replaying an earlier successful request
        // must never restore its old target after somebody changes the link.
        replayed = true;
        return null;
      }
      if (change === 'unchanged') return null;
      nextLink = {
        project_id: projectId, schedule_project_id: input.schedule_project_id, version: randomUUID(),
        linked_by: actor, linked_at: new Date().toISOString(),
      };
      event = {
        ...createActivityEvent({ project_id: projectId, actor_id: actor, request_id: input.request_id,
          type: input.schedule_project_id === null ? 'project.schedule_unlinked' : 'project.schedule_linked',
          summary: input.schedule_project_id === null ? 'Removed the saved schedule association.' : `Linked schedule project #${input.schedule_project_id}.`,
        }),
        schedule_link: { schedule_project_id: input.schedule_project_id, expected_version: input.expected_version, version: nextLink.version },
      };
      return {};
    }, {
      scheduleLinks: current => [...linksIn(current).filter(link => link.project_id !== projectId), nextLink],
      events: () => event ? [event] : [],
    });
    const currentLink = linkFor(saved, projectId);
    res.json({ link: await describe(currentLink, currentLink?.schedule_project_id === input.schedule_project_id ? target : undefined), replayed });
  }));
  return router;
}

module.exports = { createProjectScheduleLinkRouter };
