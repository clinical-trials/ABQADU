import { clearAuthSession, getAuthSession, setAuthSession } from './authFetch';
import { readManualPayment, saveManualPayment, clearManualPayment, createManualPaymentStore } from './manualPaymentDraft';

const identify = id => setAuthSession({ userId: id, sessionId: `session-${id}`, getToken: async () => `token-${id}` });
const body = { request_id: 'a1505a11-a000-4000-8000-100000000000', amount: '20', method: 'check' };
beforeEach(() => { sessionStorage.clear(); identify(`owner-${Math.random()}`); });
afterEach(() => { jest.restoreAllMocks(); clearAuthSession(); });

test('saved manual attempt belongs to one user and survives their next session', () => {
  const owner = getAuthSession();
  saveManualPayment(owner, 12, body);
  identify('different-user');
  expect(readManualPayment(getAuthSession(), 12)).toBeNull();
  identify(owner.userId);
  expect(readManualPayment(getAuthSession(), 12).body).toEqual(body);
});
test('blocked storage retains the owned attempt across reauthentication in this page', () => {
  const owner = getAuthSession();
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const saved = saveManualPayment(owner, 12, body);
  expect(saved.storageUnavailable).toBe(true);
  identify(owner.userId);
  expect(readManualPayment(getAuthSession(), 12).body).toEqual(body);
});
test('a new page store restores the exact serialized payment body', () => {
  const owner = getAuthSession();
  saveManualPayment(owner, 12, body);
  const reloaded = createManualPaymentStore();
  expect(reloaded.readManualPayment(owner, 12).body).toEqual(body);
});
test('a later read failure reports that the retained retry depends on page memory', () => {
  const owner = getAuthSession();
  saveManualPayment(owner, 12, body);
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  expect(readManualPayment(owner, 12)).toMatchObject({ body, storageUnavailable: true });
});
test('acknowledgment only clears the same request in the current owner session', () => {
  const owner = getAuthSession();
  saveManualPayment(owner, 12, body);
  expect(clearManualPayment(owner, 12, 'different-request')).toBe(false);
  expect(readManualPayment(owner, 12).body).toEqual(body);
  identify('different-user');
  expect(clearManualPayment(owner, 12, body.request_id)).toBe(false);
  identify(owner.userId);
  const current = getAuthSession();
  expect(clearManualPayment(current, 12, body.request_id)).toBe(true);
  expect(readManualPayment(current, 12)).toBeNull();
});
