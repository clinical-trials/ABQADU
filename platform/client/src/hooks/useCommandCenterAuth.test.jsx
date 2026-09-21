import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useCommandCenter from './useCommandCenter';
import { clearAuthSession, getAuthSession, setAuthSession } from '../utils/authFetch';

const data = client => ({ builder: { company: 'ABQ ADU' }, projects: [{ id: 'p', client }], receipts: [], mileage: [], activity: [] });
const response = value => ({ ok: true, status: 200, json: async () => value });
let root, container, current;
const identify = userId => setAuthSession({ userId, sessionId: `session-${userId}`, getToken: async () => `token-${userId}` });
function Harness() { current = useCommandCenter(); return <output>{JSON.stringify(current.state)}</output>; }
const render = () => act(async () => root.render(<Harness key={getAuthSession().epoch} />));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear(); identify('staff-a');
  global.fetch = jest.fn(async () => response(data('Server record')));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); clearAuthSession(); jest.restoreAllMocks(); });

test('unowned legacy drafts are preserved and disclosed without applying or sending them', async () => {
  const legacy = JSON.stringify({ version: 1, state: data('Legacy private draft'), edits: [{ operationId: 'legacy', key: 'projects', id: 'p', field: 'client', value: 'Legacy private draft' }] });
  sessionStorage.setItem('abqadu.command-center.draft.v1', legacy);
  await render();
  expect(current.state.projects[0].client).toBe('Server record');
  expect(current.legacyDraftNotice).toMatch(/older.*draft.*preserved/i);
  expect(sessionStorage.getItem('abqadu.command-center.draft.v1')).toBe(legacy);
  expect(fetch.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false);
});

test('a different user cannot restore a prior user’s draft, including before their load finishes', async () => {
  await render();
  act(() => current.updateList('projects', 'p', 'client', 'Staff A unsaved draft'));
  await act(async () => { identify('staff-b'); });
  expect(container.textContent).not.toContain('Staff A unsaved draft');
  let finish;
  fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(); expect(current.state).toBeNull();
  await act(async () => finish(response(data('Staff B server record'))));
  expect(current.state.projects[0].client).toBe('Staff B server record');
  expect([...Array(sessionStorage.length)].map((_, i) => sessionStorage.getItem(sessionStorage.key(i))).join('')).toContain('Staff A unsaved draft');
});

test('old-user queued actions and late saves cannot run under a new identity', async () => {
  await render();
  let finishSave;
  fetch.mockImplementation(async (url, options) => options.method === 'PUT'
    ? new Promise(resolve => { finishSave = resolve; }) : response(data('Staff B server record')));
  let save, action;
  await act(async () => {
    save = current.saveState({ projects: [{ id: 'p', client: 'Staff A pending save' }] });
    action = current.runAction('/api/command-center/old-action', { method: 'POST' });
    await Promise.resolve(); await Promise.resolve();
  });
  await act(async () => identify('staff-b')); await render();
  expect(current.state.projects[0].client).toBe('Staff B server record');
  await act(async () => { finishSave(response(data('Old A response'))); await save; await action; });
  expect(current.state.projects[0].client).toBe('Staff B server record');
  expect(fetch.mock.calls.some(([url]) => url === '/api/command-center/old-action')).toBe(false);
});

test.each(['blocked', 'quota'])('session expiry retains a %s-storage memory draft for only the same user after reauthentication', async mode => {
  const user = `staff-memory-${mode}`;
  identify(user);
  if (mode === 'blocked') {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  }
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  await render();
  fetch.mockImplementation(async (url, options) => options.method === 'PUT'
    ? { ok: false, status: 401, json: async () => ({ error: 'Session expired' }) }
    : response(data('Server record')));
  await act(async () => { await current.saveState({ projects: [{ id: 'p', client: 'Recover after sign-in' }] }); });
  expect(current.state).toBeNull();
  await act(async () => identify(`other-${mode}`)); await render();
  expect(container.textContent).not.toContain('Recover after sign-in');
  await act(async () => identify(user)); await render();
  expect(current.state.projects[0].client).toBe('Recover after sign-in');
  expect(current.status).toMatch(/unsaved/i);
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1);
});
