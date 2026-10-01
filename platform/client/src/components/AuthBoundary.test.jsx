import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AuthBoundary, { WorkspaceSignOut } from './AuthBoundary';
import { apiFetch, clearAuthSession, getAuthSession } from '../utils/authFetch';

let mockAuth, mockProviderIdentity;
const mockSignOut = jest.fn(async () => {});
const mockClerk = {
  signOut: mockSignOut,
  get session() { const current = mockProviderIdentity || mockAuth; return current.sessionId ? { id: current.sessionId } : null; },
  get user() { const current = mockProviderIdentity || mockAuth; return current.userId ? { id: current.userId } : null; },
};
jest.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }) => children,
  SignIn: () => <div>Clerk sign-in form</div>,
  useAuth: () => mockAuth,
  useClerk: () => mockClerk,
}));

let root, container, mounts;
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function PrivateApp() { React.useEffect(() => { mounts += 1; }, []); return <div>Private project records<WorkspaceSignOut /></div>; }
const render = () => act(async () => root.render(<AuthBoundary><PrivateApp /></AuthBoundary>));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  clearAuthSession(); mounts = 0; mockProviderIdentity = null;
  mockAuth = { isLoaded: true, isSignedIn: false, userId: null, sessionId: null, getToken: async () => 'token' };
  global.fetch = jest.fn(async url => reply(url === '/api/auth/config' ? { configured: true, publishableKey: 'pk_test_fixture' } : { userId: mockAuth.userId }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test('unconfigured setup fails closed and never mounts private components', async () => {
  fetch.mockResolvedValue(reply({ configured: false, publishableKey: null }));
  await render();
  expect(container.textContent).toContain('Workspace setup required');
  expect(mounts).toBe(0);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('unavailable public configuration stays locked with retry', async () => {
  fetch.mockRejectedValue(new Error('offline')); await render();
  expect(container.textContent).toContain('Unable to check workspace setup');
  expect(container.textContent).toContain('Retry'); expect(mounts).toBe(0);
});

test('signed-out users see sign-in without mounting private children', async () => {
  await render(); expect(container.textContent).toContain('Clerk sign-in form'); expect(mounts).toBe(0);
});

test.each(['unconfigured', 'unavailable', 'signed-out'])('homeowners can leave the %s builder screen without authenticating', async state => {
  if (state === 'unconfigured') fetch.mockResolvedValue(reply({ configured: false, publishableKey: null }));
  if (state === 'unavailable') fetch.mockRejectedValue(new Error('offline'));
  await render();
  const links = [...container.querySelectorAll('a')];
  expect(links.find(link => link.textContent === 'Open homeowner website')?.getAttribute('href')).toBe('/');
  expect(links.find(link => link.textContent === 'Find a local trade')?.getAttribute('href')).toBe('/#contractors');
  expect(container.textContent).toContain('No account needed');
  expect(mounts).toBe(0);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/auth/config']);
});

test('a Clerk session alone cannot mount children before server authorization', async () => {
  let finish;
  mockAuth = { ...mockAuth, isSignedIn: true, userId: 'staff-a', sessionId: 'a' };
  fetch.mockImplementation(async url => url === '/api/auth/config' ? reply({ configured: true, publishableKey: 'pk_test_fixture' }) : new Promise(resolve => { finish = resolve; }));
  await render(); expect(mounts).toBe(0);
  await act(async () => finish(reply({ userId: 'staff-a' })));
  expect(mounts).toBe(1); expect(container.textContent).toContain('Private project records');
  mockAuth = { ...mockAuth, isSignedIn: false, userId: null, sessionId: null };
  await render(); expect(container.textContent).not.toContain('Private project records');
});

test('non-staff and mismatched server identities never receive the workspace', async () => {
  mockAuth = { ...mockAuth, isSignedIn: true, userId: 'visitor', sessionId: 'v' };
  fetch.mockImplementation(async url => url === '/api/auth/config' ? reply({ configured: true, publishableKey: 'pk_test_fixture' }) : reply({ error: 'Forbidden' }, 403));
  await render(); expect(container.textContent).toContain('No workspace access'); expect(container.textContent).toContain('Sign out'); expect(mounts).toBe(0);
});

test('a mismatched server user ID leaves the workspace locked', async () => {
  mockAuth = { ...mockAuth, isSignedIn: true, userId: 'staff-a', sessionId: 'a' };
  fetch.mockImplementation(async url => url === '/api/auth/config' ? reply({ configured: true, publishableKey: 'pk_test_fixture' }) : reply({ userId: 'another-user' }));
  await render();
  expect(container.textContent).toContain('Unable to verify workspace access');
  expect(mounts).toBe(0);
});

test('an expired API session immediately removes previously mounted private records', async () => {
  mockAuth = { ...mockAuth, isSignedIn: true, userId: 'staff-a', sessionId: 'a' };
  await render(); expect(container.textContent).toContain('Private project records');
  fetch.mockResolvedValue(reply({ error: 'Expired' }, 401));
  await act(async () => { await apiFetch('/api/clients').catch(() => {}); });
  expect(container.textContent).not.toContain('Private project records');
  expect(container.textContent).toContain('Session ended');
});

test('old server authorization cannot authorize a switched account', async () => {
  const pending = [];
  mockAuth = { ...mockAuth, isSignedIn: true, userId: 'staff-a', sessionId: 'a' };
  fetch.mockImplementation(async url => url === '/api/auth/config' ? reply({ configured: true, publishableKey: 'pk_test_fixture' }) : new Promise(resolve => pending.push(resolve)));
  await render();
  mockAuth = { ...mockAuth, userId: 'staff-b', sessionId: 'b' }; await render();
  await act(async () => pending[0](reply({ userId: 'staff-a' }))); expect(mounts).toBe(0);
  await act(async () => pending[1](reply({ userId: 'staff-b' }))); expect(mounts).toBe(1);
});

test('provider identity changes before React catches up cannot supply the next account token', async () => {
  const getToken = jest.fn(async () => `token-${mockAuth.userId}`);
  mockAuth = { ...mockAuth, isSignedIn: true, userId: 'staff-a', sessionId: 'a', getToken };
  await render();
  fetch.mockClear(); getToken.mockClear();
  mockProviderIdentity = { userId: 'staff-b', sessionId: 'b' };
  await act(async () => { await expect(apiFetch('/api/clients')).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' }); });
  expect(getToken).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test('provider identity changing during token retrieval cannot issue the old request', async () => {
  let finish;
  const getToken = jest.fn(async () => 'token-a');
  mockAuth = { ...mockAuth, isSignedIn: true, userId: 'staff-a', sessionId: 'a', getToken };
  await render(); fetch.mockClear();
  getToken.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const request = apiFetch('/api/clients');
  mockProviderIdentity = { userId: 'staff-b', sessionId: 'b' };
  await act(async () => {
    finish('token-b');
    await expect(request).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
  });
  expect(fetch).not.toHaveBeenCalled();
});

const adminSession = { userId: 'admin-owner', sessionId: 'synthetic-session', token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 3600000).toISOString() };
const adminReply = async (url, options) => {
  if (url === '/api/auth/config') return reply({ configured: true, mode: 'admin', publishableKey: null });
  if (url === '/api/auth/admin-session') return reply(options?.method === 'DELETE' ? {} : adminSession, options?.method === 'DELETE' ? 204 : 201);
  return reply({ userId: 'admin-owner' });
};
const submitAdmin = () => act(async () => {
  container.querySelector('[name="password"]').value = 'Synthetic-test-password';
  container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});

test('admin sign-in stays private until verified, then sign-out clears state and revokes the token', async () => {
  fetch.mockImplementation(adminReply);
  const store = jest.spyOn(Storage.prototype, 'setItem');
  await render();
  expect(mounts).toBe(0);
  expect(container.querySelector('[name="username"]').value).toBe('admin');
  expect(container.querySelector('[name="password"]').autocomplete).toBe('current-password');
  await submitAdmin();
  expect(mounts).toBe(1);
  expect(fetch).toHaveBeenCalledWith('/api/auth/admin-session', expect.objectContaining({ method: 'POST', credentials: 'omit', body: JSON.stringify({ username: 'admin', password: 'Synthetic-test-password' }) }));
  expect(store).not.toHaveBeenCalled(); store.mockRestore();
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Sign out').click());
  expect(container.textContent).not.toContain('Private project records');
  expect(getAuthSession().userId).toBeNull();
  expect(fetch).toHaveBeenCalledWith('/api/auth/admin-session', expect.objectContaining({ method: 'DELETE', headers: { Authorization: `Bearer ${adminSession.token}` } }));
});

test.each([401, 429, 503])('admin error %s leaves data locked and removes the entered password', async status => {
  fetch.mockImplementation((url, options) => url === '/api/auth/admin-session' ? reply({ error: 'server arbitrary secret must not echo' }, status) : adminReply(url, options));
  await render(); await submitAdmin();
  expect(mounts).toBe(0);
  expect(container.querySelector('[name="password"]').value).toBe('');
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain('server arbitrary secret');
  expect(fetch.mock.calls.filter(([url]) => url === '/api/auth/session')).toHaveLength(0);
});

test('duplicate admin submissions cannot create concurrent sessions and late authorization cannot reopen an unmounted workspace', async () => {
  let finish;
  fetch.mockImplementation((url, options) => url === '/api/auth/admin-session' && options?.method === 'POST'
    ? new Promise(resolve => { finish = resolve; }) : adminReply(url, options));
  await render(); await submitAdmin(); await submitAdmin();
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  await act(async () => root.render(<div>Left workspace</div>));
  await act(async () => finish(reply(adminSession, 201)));
  expect(mounts).toBe(0);
  expect(getAuthSession().userId).toBeNull();
  expect(fetch).toHaveBeenCalledWith('/api/auth/admin-session', expect.objectContaining({ method: 'DELETE' }));
});

test('admin API expiry closes private records and requires password entry again', async () => {
  fetch.mockImplementation(adminReply); await render(); await submitAdmin();
  fetch.mockImplementation((url, options) => url === '/api/clients' ? reply({}, 401) : adminReply(url, options));
  await act(async () => { await apiFetch('/api/clients').catch(() => {}); });
  expect(container.textContent).not.toContain('Private project records');
  expect(container.textContent).toContain('Session ended');
  expect(container.querySelector('[name="password"]').value).toBe('');
  expect(getAuthSession().userId).toBeNull();
});

test('mismatched admin authorization never mounts records', async () => {
  fetch.mockImplementation((url, options) => url === '/api/auth/session' ? reply({ userId: 'someone-else' }) : adminReply(url, options));
  await render(); await submitAdmin();
  expect(mounts).toBe(0); expect(getAuthSession().userId).toBeNull();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
