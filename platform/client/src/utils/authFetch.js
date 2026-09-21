let epoch = 0;
let session = Object.freeze({ epoch, userId: null, sessionId: null });
let tokenProvider = null;
let onUnauthorized = null;
const listeners = new Set();
const requests = new Set();

function authError(message, code, status) {
  return Object.assign(new Error(message), { name: 'AuthSessionError', code, status });
}

export const getAuthSession = () => session;
export const isAuthSessionCurrent = owner => Boolean(owner?.userId && owner.epoch === session.epoch && owner.userId === session.userId);
export function assertAuthSession(owner) {
  if (!isAuthSessionCurrent(owner)) throw authError('Your sign-in session changed. Sign in again before continuing.', 'AUTH_SESSION_CHANGED');
}
export function subscribeAuthSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearAuthSession(owner) {
  if (owner && owner.epoch !== session.epoch) return;
  for (const controller of requests) controller.abort();
  requests.clear();
  tokenProvider = null;
  onUnauthorized = null;
  session = Object.freeze({ epoch: ++epoch, userId: null, sessionId: null });
  listeners.forEach(listener => listener());
}

export function setAuthSession({ userId, sessionId, getToken, onUnauthorized: denied }) {
  clearAuthSession();
  if (!userId || !sessionId || typeof getToken !== 'function') return session;
  tokenProvider = getToken;
  onUnauthorized = denied;
  session = Object.freeze({ epoch: ++epoch, userId, sessionId });
  listeners.forEach(listener => listener());
  return session;
}

export async function apiFetch(input, options = {}) {
  const url = new URL(input, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/') || url.username || url.password) {
    throw new Error('Authenticated requests must use a same-origin API address.');
  }
  const { authSession: expected, signal, ...init } = options;
  const owner = expected || session;
  if (expected) assertAuthSession(expected);
  if (!owner.userId || !tokenProvider) throw authError('Sign in to access the builder workspace.', 'AUTH_REQUIRED');
  assertAuthSession(owner);
  const provider = tokenProvider;
  const denied = onUnauthorized;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  requests.add(controller);
  try {
    const token = await provider();
    assertAuthSession(owner);
    if (!token) {
      clearAuthSession(owner);
      denied?.(401);
      throw authError('Your session has ended. Sign in again to continue.', 'AUTH_REQUIRED', 401);
    }
    if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${url.pathname}${url.search}`, {
      ...init, headers, credentials: 'omit', redirect: 'error', mode: 'same-origin', signal: controller.signal,
    });
    assertAuthSession(owner);
    if (response.status === 401 || response.status === 403) {
      clearAuthSession(owner);
      denied?.(response.status);
      throw authError(response.status === 403 ? 'This account does not have workspace access.' : 'Your session has ended. Sign in again to continue.', 'AUTH_DENIED', response.status);
    }
    return response;
  } catch (error) {
    // Never treat an old response or token as work belonging to the next user.
    if (!isAuthSessionCurrent(owner) && !error.code?.startsWith('AUTH_')) assertAuthSession(owner);
    throw error;
  } finally {
    requests.delete(controller);
    signal?.removeEventListener('abort', abort);
  }
}
