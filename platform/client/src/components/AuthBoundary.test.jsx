import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AuthBoundary from './AuthBoundary';
import { apiFetch, clearAuthSession } from '../utils/authFetch';

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
function PrivateApp() { React.useEffect(() => { mounts += 1; }, []); return <div>Private project records</div>; }
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
