import { assertAuthSession, isAuthSessionCurrent } from './authFetch';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateManualAmount(value) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(String(value)) || Number(value) <= 0 || Number(value) > 9999999999.99) {
    throw new Error('Enter a positive payment amount with at most two decimal places.');
  }
}

export function newPaymentRequestId() {
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// Memory is scoped to the user, so blocked browser storage still survives an
// expired session and reauthentication within this running page.
export function createManualPaymentStore() {
  const memory = new Map();
  const keyFor = (owner, invoiceId) => `abqadu.manual-payment.v1.${encodeURIComponent(owner.userId)}.${encodeURIComponent(invoiceId)}`;
  function readManualPayment(owner, invoiceId) {
    if (!isAuthSessionCurrent(owner)) return null;
    const key = keyFor(owner, invoiceId);
    const cached = memory.get(key);
    if (cached?.storageUnavailable) return cached.attempt;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) { memory.delete(key); return null; }
      const value = JSON.parse(raw);
      if (value?.version !== 1 || value.ownerId !== owner.userId || String(value.invoiceId) !== String(invoiceId)
        || !uuid.test(value.body?.request_id || '') || !['check', 'card', 'ach', 'cash'].includes(value.body?.method)) throw new Error('Invalid saved payment attempt');
      validateManualAmount(value.body.amount);
      const attempt = { ...value, storageUnavailable: false };
      memory.set(key, { attempt, storageUnavailable: false });
      return attempt;
    } catch {
      if (cached) {
        const attempt = cached.attempt ? { ...cached.attempt, storageUnavailable: true } : null;
        memory.set(key, { attempt, storageUnavailable: true });
        return attempt;
      }
      // An unreadable saved attempt must not silently become a new payment.
      return { invalid: true, storageUnavailable: true };
    }
  }
  function saveManualPayment(owner, invoiceId, body) {
    assertAuthSession(owner);
    validateManualAmount(body.amount);
    if (!uuid.test(body.request_id) || !['check', 'card', 'ach', 'cash'].includes(body.method)) throw new Error('Invalid payment request.');
    const key = keyFor(owner, invoiceId);
    const existing = readManualPayment(owner, invoiceId);
    if (existing && JSON.stringify(existing.body) !== JSON.stringify(body)) throw new Error('Review the unresolved payment before starting a different payment.');
    const attempt = { version: 1, ownerId: owner.userId, invoiceId: String(invoiceId), body: { ...body }, storageUnavailable: false };
    try { window.sessionStorage.setItem(key, JSON.stringify(attempt)); }
    catch { attempt.storageUnavailable = true; }
    memory.set(key, { attempt, storageUnavailable: attempt.storageUnavailable });
    return attempt;
  }
  function clearManualPayment(owner, invoiceId, requestId) {
    if (!isAuthSessionCurrent(owner)) return false;
    const current = readManualPayment(owner, invoiceId);
    if (!current || (current.invalid ? requestId !== null : current.body.request_id !== requestId)) return false;
    const key = keyFor(owner, invoiceId);
    let storageUnavailable = false;
    try { window.sessionStorage.removeItem(key); }
    catch { storageUnavailable = true; }
    // Retain a tombstone when deletion fails so stale storage isn't reopened.
    memory.set(key, { attempt: null, storageUnavailable });
    return true;
  }
  return { readManualPayment, saveManualPayment, clearManualPayment };
}
export const { readManualPayment, saveManualPayment, clearManualPayment } = createManualPaymentStore();
