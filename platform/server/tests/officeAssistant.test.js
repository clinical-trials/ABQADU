const { updateOfficeTasks } = require('../src/services/officeAssistant');
const state = { projects: [{ id: 'p' }] };
const task = { id: 'task-1', project_id: 'p', kind: 'payment', due_date: '2026-11-20', message: 'Please contact us about your check.' };
test('persists a follow-up without claiming delivery', () => {
 const result = updateOfficeTasks(state, task);
 expect(result.office_tasks[0]).toMatchObject({ ...task, status: 'open' });
 expect(result.office_tasks[0].sent_at).toBeUndefined();
});
test('retries are idempotent and conflicting IDs rejected', () => {
 const next = { ...state, ...updateOfficeTasks(state, task) };
 expect(updateOfficeTasks(next, task).office_tasks).toHaveLength(1);
 expect(() => updateOfficeTasks(next, { ...task, message: 'Changed' })).toThrow();
});
test('rejects missing projects, invalid dates and task types', () => {
 for (const change of [{ project_id: 'missing' }, { due_date: '2026-02-30' }, { kind: 'arbitrary' }, { message: '' }]) expect(() => updateOfficeTasks(state, { ...task, ...change })).toThrow();
});
test('records completed or paused follow-ups without marking invoices paid', () => {
 const next = { ...state, ...updateOfficeTasks(state, task) };
 expect(updateOfficeTasks(next, { id: task.id, status: 'done' }).office_tasks[0].status).toBe('done');
 expect(updateOfficeTasks(next, { id: task.id, status: 'paused' }).office_tasks[0].status).toBe('paused');
 expect(() => updateOfficeTasks(next, { id: task.id, status: 'sent' })).toThrow();
});

test('follow-ups survive reloads, unrelated saves, and workspace reset', async () => {
 const fs = require('fs'); const os = require('os'); const path = require('path');
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abq-office-test-'));
 const previous = process.env.COMMAND_CENTER_STORE_PATH;
 process.env.COMMAND_CENTER_STORE_PATH = path.join(dir, 'state.json');
 jest.resetModules();
 try {
  const store = require('../src/services/commandCenterStore');
  const initial = await store.loadCommandCenter();
  await store.saveCommandCenter(current => updateOfficeTasks(current, {...task,project_id:initial.projects[0].id}));
  await store.saveCommandCenter({builder:initial.builder});
  expect((await store.loadCommandCenter()).office_tasks).toHaveLength(1);
  await store.resetCommandCenter();
  expect((await store.loadCommandCenter()).office_tasks).toHaveLength(1);
 } finally {
  if (previous === undefined) delete process.env.COMMAND_CENTER_STORE_PATH; else process.env.COMMAND_CENTER_STORE_PATH = previous;
  fs.rmSync(dir,{recursive:true,force:true}); jest.resetModules();
 }
});
