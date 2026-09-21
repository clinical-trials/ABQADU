import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { apiFetch, assertAuthSession, getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';

const endpoint = '/api/command-center';
const saveDelay = 350;
const legacyDraftKey = 'abqadu.command-center.draft.v1';
// Work cannot cross session epochs; an unsaved draft can survive reauthentication
// only for its original user while this tab remains open.
const sessionRecords = new Map();
const userDraftRecords = new Map();
let editSequence = 0;

function sessionRecord(owner) {
  if (!sessionRecords.has(owner.epoch)) sessionRecords.set(owner.epoch, { queue: Promise.resolve() });
  return sessionRecords.get(owner.epoch);
}
function draftRecord(owner) {
  if (!userDraftRecords.has(owner.userId)) userDraftRecords.set(owner.userId, { memoryDraft: null, storageUnavailable: false });
  return userDraftRecords.get(owner.userId);
}
const draftKey = owner => `abqadu.command-center.draft.v2.${encodeURIComponent(owner.userId)}`;

function legacyDraftNotice() {
  try {
    return window.sessionStorage.getItem(legacyDraftKey) !== null
      ? 'An older unowned draft was preserved on this device. It has not been opened or applied to this account. Ask the workspace owner to recover it before clearing browser data.' : '';
  } catch { return ''; }
}

function isCommandCenterState(value) {
  return value && Array.isArray(value.projects) && value.builder && typeof value.builder === 'object';
}

function readDraft(owner) {
  if (!isAuthSessionCurrent(owner)) return null;
  const record = draftRecord(owner);
  if (record.storageUnavailable) return record.memoryDraft;
  try {
    const draft = JSON.parse(window.sessionStorage.getItem(draftKey(owner)) || 'null');
    record.memoryDraft = draft?.version === 2 && draft.ownerId === owner.userId && isCommandCenterState(draft.state) && Array.isArray(draft.edits)
      && draft.edits.every(edit => edit && typeof edit.operationId === 'string' && (edit.patch || (edit.key && edit.field))) ? draft : null;
  } catch {
    record.storageUnavailable = true;
  }
  return record.memoryDraft;
}

function writeDraft(owner, edits, state) {
  if (!isAuthSessionCurrent(owner)) return;
  const record = draftRecord(owner);
  record.memoryDraft = edits.length ? { version: 2, ownerId: owner.userId, edits: [...edits], state } : null;
  try {
    if (record.memoryDraft) window.sessionStorage.setItem(draftKey(owner), JSON.stringify(record.memoryDraft));
    else window.sessionStorage.removeItem(draftKey(owner));
    record.storageUnavailable = false;
  } catch {
    // Private browsing, blocked storage, and quota limits still retain drafts
    // for internal navigation in this tab's running application.
    record.storageUnavailable = true;
  }
}

function acknowledgeDraft(owner, edits) {
  const draft = readDraft(owner);
  if (!draft) return;
  const acknowledged = new Set(edits.map(edit => edit.operationId));
  writeDraft(owner, draft.edits.filter(edit => !acknowledged.has(edit.operationId)), draft.state);
}

function rebaseRows(current, desired, before) {
  const original = new Map(before.map(row => [row.id, row]));
  const latest = new Map(current.map(row => [row.id, row]));
  const desiredIds = new Set(desired.map(row => row.id));
  const rows = desired.map(row => {
    const previous = original.get(row.id);
    if (!previous) return { ...latest.get(row.id), ...row };
    const changes = Object.fromEntries(Object.entries(row).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key])));
    return { ...(latest.get(row.id) || row), ...changes };
  });
  return [...rows, ...current.filter(row => !original.has(row.id) && !desiredIds.has(row.id))];
}

function applyEdit(state, edit) {
  if (edit.patch) {
    const patch = { ...edit.patch };
    for (const key of Object.keys(patch)) {
      const lists = [state?.[key], patch[key], edit.before?.[key]];
      if (lists.every(list => Array.isArray(list) && list.every(row => row && row.id != null))) {
        patch[key] = rebaseRows(...lists);
      }
    }
    return { ...state, ...patch };
  }
  return {
    ...state,
    [edit.key]: (state?.[edit.key] || []).map(item => (
      item.id === edit.id ? { ...item, [edit.field]: edit.value } : item
    )),
  };
}

async function request(owner, path, options) {
  const result = await apiFetch(path, { ...options, authSession: owner });
  let payload;
  try {
    payload = await result.json();
  } catch {
    throw new Error(result.ok ? 'The server returned an unreadable response. Please try again.' : `Request failed (${result.status}). Please try again.`);
  }
  assertAuthSession(owner);
  if (!result.ok) throw new Error(payload?.error || payload?.detail || `Request failed (${result.status}). Please try again.`);
  return payload;
}

export default function useCommandCenter() {
  const [owner] = useState(getAuthSession);
  useSyncExternalStore(subscribeAuthSession, getAuthSession);
  const [restored] = useState(() => readDraft(owner));
  const [legacyNotice] = useState(legacyDraftNotice);
  const [state, setState] = useState(restored?.state || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(restored ? 'Unsaved changes restored in this tab. Retry saving when ready.' : '');
  const [dirty, setDirty] = useState(Boolean(restored?.edits.length));
  const current = useRef(restored?.state || null);
  const pending = useRef(restored?.edits.slice() || []);
  const active = useRef(0);
  const timer = useRef(null);
  const mounted = useRef(true);
  const errorKind = useRef(restored ? 'save' : null);

  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // Requests share one queue, including actions and refreshes. A failed request
  // resolves to null so callers can safely use these methods in event handlers.
  const enqueue = useCallback((operation, showSaving = true, kind = 'save') => {
    if (showSaving) {
      active.current += 1;
      if (mounted.current) setSaving(true);
    }
    const record = sessionRecord(owner);
    const next = record.queue.then(async () => {
      try {
        assertAuthSession(owner);
        const result = await operation();
        assertAuthSession(owner);
        // Autosave success must not dismiss an unrelated failed action.
        if (errorKind.current === kind) {
          errorKind.current = null;
          if (mounted.current && isAuthSessionCurrent(owner)) setError('');
        }
        return result;
      } catch (failure) {
        errorKind.current = failure.commandCenterOperation || kind;
        if (mounted.current && isAuthSessionCurrent(owner)) setError(failure.message || 'Request failed. Please try again.');
        return null;
      } finally {
        if (showSaving) active.current -= 1;
        if (mounted.current && isAuthSessionCurrent(owner)) {
          setSaving(active.current > 0);
          setDirty(pending.current.length > 0);
        }
      }
    });
    record.queue = next;
    return next;
  }, [owner]);

  const reconcile = useCallback(saved => {
    assertAuthSession(owner);
    // Replay only unacknowledged edits over the response. Field edits preserve
    // action-generated data on the same row, such as new invoice drafts.
    const next = pending.current.reduce(applyEdit, saved);
    current.current = next;
    if (mounted.current) {
      writeDraft(owner, pending.current, next);
      setState(next);
      setDirty(pending.current.length > 0);
    }
    return next;
  }, [owner]);

  const flush = useCallback(async () => {
    clearTimer();
    while (pending.current.length) {
      assertAuthSession(owner);
      const edits = pending.current.slice();
      const keys = new Set(edits.flatMap(edit => edit.patch ? Object.keys(edit.patch) : [edit.key]));
      const patch = Object.fromEntries([...keys].map(key => [key, current.current[key]]));
      const saved = await request(owner, endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!isCommandCenterState(saved)) throw new Error('The server returned invalid command-center data. Your edits are still unsaved.');
      pending.current = pending.current.slice(edits.length);
      acknowledgeDraft(owner, edits);
      reconcile(saved);
    }
    return current.current;
  }, [clearTimer, owner, reconcile]);

  const addEdit = useCallback(edit => {
    assertAuthSession(owner);
    const recorded = { ...edit, operationId: `${Date.now()}-${++editSequence}` };
    if (edit.patch) recorded.before = Object.fromEntries(Object.keys(edit.patch).map(key => [key, current.current?.[key]]));
    pending.current.push(recorded);
    current.current = applyEdit(current.current, recorded);
    writeDraft(owner, pending.current, current.current);
    if (mounted.current) {
      setState(previous => applyEdit(previous, recorded));
      setDirty(true);
    }
  }, [owner]);

  const load = useCallback(() => enqueue(async () => {
    // A save from the previous mount may have completed while this load waited.
    const remaining = new Set((readDraft(owner)?.edits || []).map(edit => edit.operationId));
    pending.current = pending.current.filter(edit => remaining.has(edit.operationId));
    if (!pending.current.length && errorKind.current === 'save') {
      errorKind.current = null;
      if (mounted.current) setError('');
    }
    const saved = await request(owner, endpoint);
    if (!isCommandCenterState(saved)) throw new Error('The server returned invalid command-center data. Please try again.');
    return reconcile(saved);
  }, false, 'load'), [enqueue, owner, reconcile]);

  const saveState = useCallback((patch = {}) => {
    const changes = typeof patch === 'function' ? patch(current.current) : patch;
    if (changes && Object.keys(changes).length) addEdit({ patch: changes });
    clearTimer();
    return enqueue(flush);
  }, [addEdit, clearTimer, enqueue, flush]);

  const updateList = useCallback((key, id, field, value) => {
    addEdit({ key, id, field, value });
    clearTimer();
    timer.current = setTimeout(() => { enqueue(flush); }, saveDelay);
  }, [addEdit, clearTimer, enqueue, flush]);

  const runAction = useCallback((path, options = {}) => {
    clearTimer();
    return enqueue(async () => {
      try {
        await flush();
      } catch (failure) {
        failure.commandCenterOperation = 'save';
        throw failure;
      }
      const result = await request(owner, path, options);
      if (isCommandCenterState(result)) reconcile(result);
      else if (isCommandCenterState(result?.state)) reconcile(result.state);
      return result;
    }, true, 'action');
  }, [clearTimer, enqueue, flush, owner, reconcile]);

  const clearError = useCallback(() => {
    errorKind.current = null;
    setError('');
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const warnUnsaved = event => {
      if (!pending.current.length) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnUnsaved);
    const unsubscribe = subscribeAuthSession(() => {
      if (isAuthSessionCurrent(owner)) return;
      clearTimer();
      current.current = null;
      pending.current = [];
      if (mounted.current) { setState(null); setDirty(false); setSaving(false); setError(''); }
    });
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', warnUnsaved);
      clearTimer();
      unsubscribe();
    };
  }, [clearTimer, enqueue, flush, load, owner]);

  const status = saving ? 'Saving changes…' : dirty ? 'Unsaved changes' : state ? 'All changes saved' : error ? 'Unable to load' : 'Loading…';
  return { state: isAuthSessionCurrent(owner) ? state : null, saving, error, status, load, saveState, updateList, runAction, clearError, legacyDraftNotice: legacyNotice };
}
