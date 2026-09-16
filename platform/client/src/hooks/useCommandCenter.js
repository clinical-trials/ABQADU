import { useCallback, useEffect, useRef, useState } from 'react';

const endpoint = '/api/command-center';
const saveDelay = 350;
const draftKey = 'abqadu.command-center.draft.v1';
let memoryDraft = null;
let storageUnavailable = false;
let requestQueue = Promise.resolve();
let editSequence = 0;

function isCommandCenterState(value) {
  return value && Array.isArray(value.projects) && value.builder && typeof value.builder === 'object';
}

function readDraft() {
  if (storageUnavailable) return memoryDraft;
  try {
    const draft = JSON.parse(window.sessionStorage.getItem(draftKey) || 'null');
    memoryDraft = draft?.version === 1 && isCommandCenterState(draft.state) && Array.isArray(draft.edits)
      && draft.edits.every(edit => edit && typeof edit.operationId === 'string' && (edit.patch || (edit.key && edit.field))) ? draft : null;
  } catch {
    storageUnavailable = true;
  }
  return memoryDraft;
}

function writeDraft(edits, state) {
  memoryDraft = edits.length ? { version: 1, edits: [...edits], state } : null;
  try {
    if (memoryDraft) window.sessionStorage.setItem(draftKey, JSON.stringify(memoryDraft));
    else window.sessionStorage.removeItem(draftKey);
    storageUnavailable = false;
  } catch {
    // Private browsing, blocked storage, and quota limits still retain drafts
    // for internal navigation in this tab's running application.
    storageUnavailable = true;
  }
}

function acknowledgeDraft(edits) {
  const draft = readDraft();
  if (!draft) return;
  const acknowledged = new Set(edits.map(edit => edit.operationId));
  writeDraft(draft.edits.filter(edit => !acknowledged.has(edit.operationId)), draft.state);
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

async function request(path, options) {
  const result = await fetch(path, options);
  let payload;
  try {
    payload = await result.json();
  } catch {
    throw new Error(result.ok ? 'The server returned an unreadable response. Please try again.' : `Request failed (${result.status}). Please try again.`);
  }
  if (!result.ok) throw new Error(payload?.error || payload?.detail || `Request failed (${result.status}). Please try again.`);
  return payload;
}

export default function useCommandCenter() {
  const [restored] = useState(readDraft);
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
    const next = requestQueue.then(async () => {
      try {
        const result = await operation();
        // Autosave success must not dismiss an unrelated failed action.
        if (errorKind.current === kind) {
          errorKind.current = null;
          if (mounted.current) setError('');
        }
        return result;
      } catch (failure) {
        errorKind.current = failure.commandCenterOperation || kind;
        if (mounted.current) setError(failure.message || 'Request failed. Please try again.');
        return null;
      } finally {
        if (showSaving) active.current -= 1;
        if (mounted.current) {
          setSaving(active.current > 0);
          setDirty(pending.current.length > 0);
        }
      }
    });
    requestQueue = next;
    return next;
  }, []);

  const reconcile = useCallback(saved => {
    // Replay only unacknowledged edits over the response. Field edits preserve
    // action-generated data on the same row, such as new invoice drafts.
    const next = pending.current.reduce(applyEdit, saved);
    current.current = next;
    if (mounted.current) {
      writeDraft(pending.current, next);
      setState(next);
      setDirty(pending.current.length > 0);
    }
    return next;
  }, []);

  const flush = useCallback(async () => {
    clearTimer();
    while (pending.current.length) {
      const edits = pending.current.slice();
      const keys = new Set(edits.flatMap(edit => edit.patch ? Object.keys(edit.patch) : [edit.key]));
      const patch = Object.fromEntries([...keys].map(key => [key, current.current[key]]));
      const saved = await request(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!isCommandCenterState(saved)) throw new Error('The server returned invalid command-center data. Your edits are still unsaved.');
      pending.current = pending.current.slice(edits.length);
      acknowledgeDraft(edits);
      reconcile(saved);
    }
    return current.current;
  }, [clearTimer, reconcile]);

  const addEdit = useCallback(edit => {
    const recorded = { ...edit, operationId: `${Date.now()}-${++editSequence}` };
    if (edit.patch) recorded.before = Object.fromEntries(Object.keys(edit.patch).map(key => [key, current.current?.[key]]));
    pending.current.push(recorded);
    current.current = applyEdit(current.current, recorded);
    writeDraft(pending.current, current.current);
    if (mounted.current) {
      setState(previous => applyEdit(previous, recorded));
      setDirty(true);
    }
  }, []);

  const load = useCallback(() => enqueue(async () => {
    // A save from the previous mount may have completed while this load waited.
    const remaining = new Set((readDraft()?.edits || []).map(edit => edit.operationId));
    pending.current = pending.current.filter(edit => remaining.has(edit.operationId));
    if (!pending.current.length && errorKind.current === 'save') {
      errorKind.current = null;
      if (mounted.current) setError('');
    }
    const saved = await request(endpoint);
    if (!isCommandCenterState(saved)) throw new Error('The server returned invalid command-center data. Please try again.');
    return reconcile(saved);
  }, false, 'load'), [enqueue, reconcile]);

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
      const result = await request(path, options);
      if (isCommandCenterState(result)) reconcile(result);
      else if (isCommandCenterState(result?.state)) reconcile(result.state);
      return result;
    }, true, 'action');
  }, [clearTimer, enqueue, flush, reconcile]);

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
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', warnUnsaved);
      clearTimer();
    };
  }, [clearTimer, enqueue, flush, load]);

  const status = saving ? 'Saving changes…' : dirty ? 'Unsaved changes' : state ? 'All changes saved' : error ? 'Unable to load' : 'Loading…';
  return { state, saving, error, status, load, saveState, updateList, runAction, clearError };
}
