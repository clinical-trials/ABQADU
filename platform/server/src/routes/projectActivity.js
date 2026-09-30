const router = require('../asyncRouter')();
const { loadCommandCenter, saveCommandCenter } = require('../services/commandCenterStore');
const { createActivityEvent } = require('../services/activityEvents');

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function projectExists(state, id) {
  if (!id || id.length > 120) fail(400, 'Invalid project ID.');
  if (!(state.projects || []).some(project => project.id === id)) fail(404, 'Project not found.');
}
function handle(action) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    try { await action(req, res); }
    catch (error) {
      if ([400, 404, 409].includes(error.status)) return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  };
}

router.get('/projects/:projectId/activity', handle(async (req, res) => {
  const state = await loadCommandCenter();
  const id = req.params.projectId;
  projectExists(state, id);
  const value = req.query.limit === undefined ? '5' : req.query.limit;
  if (typeof value !== 'string' || !/^[1-9]\d?$/.test(value) || Number(value) > 50) fail(400, 'Activity limit must be between 1 and 50.');
  const events = (state.activity_events || []).filter(event => event.project_id === id).slice().reverse();
  let offset = 0;
  if (req.query.cursor !== undefined) {
    try {
      if (typeof req.query.cursor !== 'string' || req.query.cursor.length > 512 || !/^[\w-]+$/.test(req.query.cursor)) throw new Error();
      const cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'));
      if (cursor.v !== 1 || cursor.project_id !== id || typeof cursor.after !== 'string') throw new Error();
      const index = events.findIndex(event => event.id === cursor.after);
      if (index < 0) throw new Error();
      offset = index + 1;
    } catch { fail(400, 'Invalid activity cursor. Reload recent activity.'); }
  }
  const page = events.slice(offset, offset + Number(value));
  const next_cursor = offset + page.length < events.length
    ? Buffer.from(JSON.stringify({ v: 1, project_id: id, after: page.at(-1).id })).toString('base64url') : null;
  res.json({ events: page, next_cursor });
}));

router.post('/projects/:projectId/notes', handle(async (req, res) => {
  const { request_id, text } = req.body || {};
  if (typeof request_id !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(request_id)) fail(400, 'A UUID request_id is required to save a note safely.');
  const requestId = request_id.toLowerCase();
  if (typeof text !== 'string' || !text.trim() || text.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) fail(400, 'Note text must contain 1 to 2000 characters without control characters.');
  const note = text.trim();
  let event, created = false;
  await saveCommandCenter(current => {
    projectExists(current, req.params.projectId);
    const prior = (current.activity_events || []).find(row => row.request_id === requestId);
    if (prior) {
      if (prior.project_id !== req.params.projectId || prior.actor_id !== req.workspaceAuth.userId || prior.text !== note) fail(409, 'This request ID already belongs to a different note.');
      event = prior;
      return {};
    }
    created = true;
    event = createActivityEvent({ project_id: req.params.projectId, actor_id: req.workspaceAuth.userId,
      type: 'note.saved', summary: `Saved note: ${note.slice(0, 160)}${note.length > 160 ? '…' : ''}`, text: note, request_id: requestId });
    return {};
  }, { events: () => created ? [event] : [] });
  res.status(created ? 201 : 200).json({ event });
}));

module.exports = router;
