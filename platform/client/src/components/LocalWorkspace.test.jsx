import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AuthBoundary from './AuthBoundary';
import { apiFetch, clearAuthSession, getAuthSession } from '../utils/authFetch';

jest.mock('@clerk/react', () => ({
  ClerkProvider: () => { throw new Error('Local access must not use Clerk.'); },
  SignIn: () => null, useAuth: () => { throw new Error('Unexpected Clerk hook'); }, useClerk: () => null,
}));

const token = 'local-fixture-token-with-at-least-thirty-two-characters';
const session = { userId: 'local-owner', sessionId: 'local-session-fixture', token };
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
let root, container, mounts;
function PrivateApp() { React.useEffect(() => { mounts += 1; }, []); return <p>Existing saved project workspace</p>; }
const render = () => act(async () => root.render(<AuthBoundary><PrivateApp /></AuthBoundary>));
const sessionPosts = () => fetch.mock.calls.filter(([url, options]) => url === '/api/auth/local-session' && options.method === 'POST');

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  clearAuthSession(); mounts = 0;
  global.fetch = jest.fn(async (url, options = {}) => {
    if (url === '/api/auth/config') return reply({ configured: true, mode: 'local', publishableKey: null });
    if (url === '/api/auth/local-session') return reply(options.method === 'DELETE' ? null : session);
    if (url === '/api/auth/session') return reply({ userId: 'local-owner' });
    return reply({ records: [] });
  });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); clearAuthSession(); });

test('explicit local configuration opens the existing workspace using a verified in-memory session', async () => {
  await render();
  expect(mounts).toBe(1);
  expect(container.textContent).toContain('Local workspace');
  expect(container.textContent).toContain('this Mac only');
  const [, options] = sessionPosts()[0];
  expect(options).toMatchObject({ method: 'POST', mode: 'same-origin', credentials: 'omit', redirect: 'error' });
  expect(options.headers['X-ABQ-Local-Access']).toBe('1');
  await apiFetch('/api/projects');
  expect(fetch.mock.calls.find(([url]) => url === '/api/projects')[1].headers.get('Authorization')).toBe(`Bearer ${token}`);
  expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage) + container.innerHTML).not.toContain(token);
});

test('local handshake alone cannot mount children before the server confirms identity', async () => {
  const original = fetch.getMockImplementation(); let finish;
  fetch.mockImplementation((url, options) => url === '/api/auth/session' ? new Promise(resolve => { finish = resolve; }) : original(url, options));
  await render(); expect(mounts).toBe(0);
  await act(async () => finish(reply({ userId: 'unexpected-user' })));
  expect(mounts).toBe(0);
  expect(container.textContent).toContain('Unable to open local workspace');
  expect(getAuthSession().userId).toBeNull();
});

test('closing local access removes private components and revokes without silently opening another session', async () => {
  await render();
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Close workspace').click());
  expect(container.textContent).not.toContain('Existing saved project workspace');
  expect(getAuthSession().userId).toBeNull();
  expect(sessionPosts()).toHaveLength(1);
  const revoked = fetch.mock.calls.filter(([url, options]) => url === '/api/auth/local-session' && options.method === 'DELETE');
  expect(revoked).toHaveLength(1);
  expect(revoked[0][1].headers.Authorization).toBe(`Bearer ${token}`);
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Reopen local workspace').click());
  expect(sessionPosts()).toHaveLength(2);
  expect(container.textContent).toContain('Existing saved project workspace');
});

test('expired business access stays closed until the user reopens it and never retries a write', async () => {
  await render();
  const original = fetch.getMockImplementation();
  fetch.mockImplementation((url, options) => url === '/api/projects' ? Promise.resolve(reply({}, 401)) : original(url, options));
  await act(async () => { await expect(apiFetch('/api/projects', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 401 }); });
  expect(container.textContent).not.toContain('Existing saved project workspace');
  expect(sessionPosts()).toHaveLength(1);
  expect(fetch.mock.calls.filter(([url]) => url === '/api/projects')).toHaveLength(1);
  expect(container.textContent).toContain('Reopen local workspace');
});

test('leaving the page revokes the session with keepalive and a restored page requires reopening', async () => {
  await render();
  await act(async () => window.dispatchEvent(new Event('pagehide')));
  expect(getAuthSession().userId).toBeNull();
  expect(container.textContent).not.toContain('Existing saved project workspace');
  const revoked = fetch.mock.calls.filter(([url, options]) => url === '/api/auth/local-session' && options.method === 'DELETE');
  expect(revoked).toHaveLength(1);
  expect(revoked[0][1]).toMatchObject({ keepalive: true, headers: { Authorization: `Bearer ${token}` } });
  await act(async () => window.dispatchEvent(new Event('pageshow')));
  expect(sessionPosts()).toHaveLength(1);
  expect(container.textContent).toContain('Reopen local workspace');
});

test('a handshake completed after unmount cannot install a stale local session', async () => {
  const original = fetch.getMockImplementation(); let finish;
  fetch.mockImplementation((url, options) => url === '/api/auth/local-session' && options.method === 'POST'
    ? new Promise(resolve => { finish = resolve; }) : original(url, options));
  await render();
  await act(async () => root.render(<p>Left the workspace</p>));
  await act(async () => finish(reply(session)));
  expect(mounts).toBe(0);
  expect(getAuthSession().userId).toBeNull();
  expect(fetch.mock.calls.some(([url, options]) => url === '/api/auth/local-session' && options.method === 'DELETE')).toBe(true);
});

test('incomplete local credentials cannot unlock the workspace', async () => {
  const original = fetch.getMockImplementation();
  fetch.mockImplementation((url, options) => url === '/api/auth/local-session' ? Promise.resolve(reply({ userId: 'local-owner' })) : original(url, options));
  await render();
  expect(mounts).toBe(0);
  expect(container.textContent).toContain('Unable to open local workspace');
});
