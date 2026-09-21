import { apiFetch, setAuthSession, clearAuthSession, getAuthSession } from './authFetch';
import { requestJson, requestPdf } from './api';

const identify = (userId = 'staff-a', getToken = async () => `token-${userId}`) => setAuthSession({ userId, sessionId: `session-${userId}`, getToken });
const reply = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });

beforeEach(() => { clearAuthSession(); global.fetch = jest.fn(async () => reply()); });
afterEach(() => clearAuthSession());

test('business API requests fail closed without a session', async () => {
  await expect(apiFetch('/api/clients')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(fetch).not.toHaveBeenCalled();
});

test('only current bearer credentials are sent to a same-origin API', async () => {
  identify();
  await apiFetch('/api/clients', { headers: { Authorization: 'untrusted', 'Content-Type': 'application/json' }, credentials: 'include', redirect: 'follow' });
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/clients');
  expect(options.headers.get('authorization')).toBe('Bearer token-staff-a');
  expect(options.headers.get('content-type')).toBe('application/json');
  expect(options.credentials).toBe('omit');
  expect(options.redirect).toBe('error');
});

test.each(['https://outside.example/api/clients', '//outside.example/api/clients', '/not-an-api', 'https://user:pass@localhost/api/clients'])('rejects unsafe destination %s without sending credentials', async url => {
  const token = jest.fn(async () => 'secret'); identify('staff-a', token);
  await expect(apiFetch(url)).rejects.toThrow();
  expect(token).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test('an account switch while awaiting a token cannot issue the old request', async () => {
  let finishToken; identify('staff-a', () => new Promise(resolve => { finishToken = resolve; }));
  const oldRequest = apiFetch('/api/clients');
  identify('staff-b'); finishToken('old-token');
  await expect(oldRequest).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
  expect(fetch).not.toHaveBeenCalled();
});

test('queued operations cannot opt into a new identity when they finally run', async () => {
  identify('staff-a'); const owner = getAuthSession(); identify('staff-b');
  await expect(apiFetch('/api/clients', { authSession: owner })).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
  expect(fetch).not.toHaveBeenCalled();
});

test('session loss aborts in-flight requests and rejects late responses', async () => {
  identify(); let finishRequest;
  fetch.mockImplementation(() => new Promise(resolve => { finishRequest = resolve; }));
  const request = apiFetch('/api/clients'); await Promise.resolve();
  const signal = fetch.mock.calls[0][1].signal;
  clearAuthSession(); expect(signal.aborted).toBe(true); finishRequest(reply());
  await expect(request).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
});

test('server authorization denial invalidates the session and reports access loss', async () => {
  const onUnauthorized = jest.fn(); setAuthSession({ userId: 'staff-a', sessionId: 's', getToken: async () => 'token', onUnauthorized });
  fetch.mockResolvedValue({ ok: false, status: 403 });
  await expect(apiFetch('/api/clients')).rejects.toMatchObject({ status: 403 });
  expect(getAuthSession().userId).toBeNull();
  expect(onUnauthorized).toHaveBeenCalledWith(403);
});

test('JSON body completion after an identity change cannot deliver old private data', async () => {
  identify(); let finish, bodyStarted;
  const started = new Promise(resolve => { bodyStarted = resolve; });
  fetch.mockResolvedValue({ ok: true, status: 200, json: () => new Promise(resolve => { finish = resolve; bodyStarted(); }) });
  const request = requestJson('/api/clients');
  await started;
  identify('staff-b'); finish({ private: 'staff-a' });
  await expect(request).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
});

test('a PDF finishing after sign-out is not downloaded', async () => {
  identify(); let finish, bodyStarted;
  const started = new Promise(resolve => { bodyStarted = resolve; });
  URL.createObjectURL = jest.fn();
  fetch.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/pdf' }), blob: () => new Promise(resolve => { finish = resolve; bodyStarted(); }) });
  const request = requestPdf('/api/invoices/1/pdf', { method: 'POST' }, 'invoice.pdf');
  await started;
  clearAuthSession(); finish(new Blob(['private pdf']));
  await expect(request).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
