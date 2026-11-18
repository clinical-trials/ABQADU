const KINDS = ['inquiry', 'appointment', 'estimate', 'update', 'payment'];
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function updateOfficeTasks(state, body, actor = 'contractor') {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Expected a follow-up object.');
  if (typeof body.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(body.id)) fail('Invalid follow-up ID.');
  const rows = Array.isArray(state.office_tasks) ? state.office_tasks : [];
  const existing = rows.find(row => row.id === body.id);
  const now = new Date().toISOString();
  if (body.status !== undefined) {
    if (!existing || !['open', 'done', 'paused'].includes(body.status)) fail('Invalid follow-up status.');
    if (existing.status === body.status) return { office_tasks: rows };
    return { office_tasks: rows.map(row => row.id === body.id ? { ...row, status: body.status, updated_at: now,
      history: [...(row.history || []), { status: body.status, at: now, actor }].slice(-100) } : row) };
  }
  if (!(state.projects || []).some(row => row.id === body.project_id)) fail('Project not found.');
  if (!KINDS.includes(body.kind)) fail('Invalid follow-up type.');
  const day = body.due_date;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) fail('Enter a valid follow-up date.');
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.message)) fail('Enter a message of up to 1600 characters.');
  const fields = { project_id: body.project_id, kind: body.kind, due_date: day, message: body.message.trim() };
  if (existing) {
    if (Object.keys(fields).some(key => fields[key] !== existing[key])) fail('This follow-up ID already exists.');
    return { office_tasks: rows };
  }
  if (rows.length >= 10000) fail('Follow-up storage limit reached.');
  return { office_tasks: [{ id: body.id, ...fields, status: 'open', created_at: now, updated_at: now,
    history: [{ status: 'open', at: now, actor }] }, ...rows] };
}
module.exports = { updateOfficeTasks };
