import React, { useEffect, useId, useRef, useState } from 'react';
import { requestJson } from '../utils/api';
import './DocumentActivity.css';

const NOTE_LIMIT = 2000;
const TEMPLATES = {
  'Site visit': 'Site visit\nDate/time: \nObservations: \nNext step: ',
  Materials: 'Materials\nItem: \nQuantity: \nStatus to confirm: ',
  Inspection: 'Inspection\nType: \nRequested date: \nResult / follow-up: ',
};

function newRequestId() {
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validEvent(item, projectId) {
  return item && typeof item.id === 'string' && item.id.length > 0
    && String(item.project_id) === String(projectId)
    && typeof item.type === 'string' && typeof item.summary === 'string'
    && typeof item.occurred_at === 'string' && Number.isFinite(Date.parse(item.occurred_at));
}

function checkedHistory(payload, projectId) {
  if (!payload || !Array.isArray(payload.events) || !payload.events.every(item => validEvent(item, projectId))
    || !(payload.next_cursor === null || typeof payload.next_cursor === 'string')) {
    throw new Error('Activity could not be verified for this project. Try loading it again.');
  }
  return { events: payload.events, nextCursor: payload.next_cursor || null };
}

function ProjectActivity({ projectId, revision, drafts }) {
  const baseUrl = `/api/project-helper/projects/${encodeURIComponent(projectId)}`;
  const projectKey = String(projectId);
  const fieldId = useId();
  const [history, setHistory] = useState({ events: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [olderError, setOlderError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [draft, setDraft] = useState(() => drafts.get(projectKey)?.text || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState(() => drafts.get(projectKey)?.attempt
    ? 'A previous save was not confirmed. Review and choose Save note to retry.' : '');
  const [listening, setListening] = useState(false);
  const [dictationStatus, setDictationStatus] = useState('');
  const mounted = useRef(false);
  const requests = useRef(new Set());
  const historyGeneration = useRef(0);
  const olderRequest = useRef(null);
  const saveRequest = useRef(null);
  const noteAttempt = useRef(drafts.get(projectKey)?.attempt || null);
  const dictation = useRef(null);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  useEffect(() => {
    mounted.current = true;
    const activeRequests = requests.current;
    return () => {
      mounted.current = false;
      activeRequests.forEach(controller => controller.abort());
      activeRequests.clear();
      const current = dictation.current;
      dictation.current = null;
      if (current) {
        current.onresult = null; current.onend = null; current.onerror = null;
        try { current.abort(); } catch { /* A browser may have already stopped recording. */ }
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++historyGeneration.current;
    requests.current.add(controller);
    olderRequest.current?.abort(); olderRequest.current = null;
    setLoading(true); setLoadingOlder(false); setHistoryError(''); setOlderError('');
    requestJson(`${baseUrl}/activity?limit=5`, { signal: controller.signal })
      .then(payload => {
        const result = checkedHistory(payload, projectId);
        if (mounted.current && !controller.signal.aborted && generation === historyGeneration.current) setHistory(result);
      })
      .catch(error => {
        if (mounted.current && !controller.signal.aborted && generation === historyGeneration.current) setHistoryError(error.message);
      })
      .finally(() => {
        requests.current.delete(controller);
        if (mounted.current && !controller.signal.aborted && generation === historyGeneration.current) setLoading(false);
      });
    return () => controller.abort();
  }, [baseUrl, projectId, revision, refresh]);

  async function loadOlder() {
    if (!history.nextCursor || loading || olderRequest.current) return;
    const controller = new AbortController();
    const generation = historyGeneration.current;
    olderRequest.current = controller; requests.current.add(controller);
    setLoadingOlder(true); setOlderError('');
    try {
      const payload = await requestJson(`${baseUrl}/activity?limit=5&cursor=${encodeURIComponent(history.nextCursor)}`, { signal: controller.signal });
      const result = checkedHistory(payload, projectId);
      if (!mounted.current || controller.signal.aborted || generation !== historyGeneration.current) return;
      setHistory(current => {
        const ids = new Set(current.events.map(item => item.id));
        return { events: [...current.events, ...result.events.filter(item => !ids.has(item.id))], nextCursor: result.nextCursor };
      });
    } catch (error) {
      if (mounted.current && !controller.signal.aborted && generation === historyGeneration.current) setOlderError(error.message);
    } finally {
      requests.current.delete(controller);
      if (olderRequest.current === controller) olderRequest.current = null;
      if (mounted.current && !controller.signal.aborted && generation === historyGeneration.current) setLoadingOlder(false);
    }
  }

  function rememberDraft(text) {
    if (text || noteAttempt.current) drafts.set(projectKey, { text, attempt: noteAttempt.current });
    else drafts.delete(projectKey);
  }

  function editDraft(text) {
    if (noteAttempt.current && text.trim() !== noteAttempt.current.text) noteAttempt.current = null;
    rememberDraft(text);
    setDraft(text); setSaveError(''); setSaveStatus('');
  }

  async function saveNote(event) {
    event.preventDefault();
    if (saveRequest.current || dictation.current) return;
    const text = draft.trim();
    if (!text || text.length > NOTE_LIMIT) {
      setSaveError(`Enter a note between 1 and ${NOTE_LIMIT} characters.`);
      return;
    }
    let attempt;
    try {
      if (!noteAttempt.current || noteAttempt.current.text !== text) noteAttempt.current = { request_id: newRequestId(), text };
      attempt = noteAttempt.current;
      // Preserve the exact attempt before sending: aborting a request cannot prove it was not saved.
      rememberDraft(draft);
    } catch {
      setSaveError('A secure request could not be prepared. Keep your draft and try again.');
      return;
    }
    const controller = new AbortController();
    saveRequest.current = controller; requests.current.add(controller);
    setSaving(true); setSaveError(''); setSaveStatus('');
    try {
      const result = await requestJson(`${baseUrl}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt), signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) return;
      if (!validEvent(result?.event, projectId) || result.event.type !== 'note.saved'
        || result.event.request_id !== attempt.request_id || result.event.text !== attempt.text) {
        throw new Error('The server did not confirm this note. Your draft is still here; retry the same note to check its save.');
      }
      noteAttempt.current = null;
      rememberDraft('');
      setDraft(''); setSaveStatus('Note saved.'); setDictationStatus(''); setRefresh(value => value + 1);
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setSaveError(error.message);
    } finally {
      requests.current.delete(controller);
      if (saveRequest.current === controller) saveRequest.current = null;
      if (mounted.current && !controller.signal.aborted) setSaving(false);
    }
  }

  function toggleDictation() {
    if (dictation.current) {
      const recognition = dictation.current;
      try { recognition.stop(); setDictationStatus('Stopping dictation…'); }
      catch {
        dictation.current = null; setListening(false);
        try {
          recognition.abort();
          setDictationStatus('Dictation stopped. Review the captured draft before saving.');
        } catch {
          setDictationStatus('Use your browser microphone control to stop recording. Your note has not been saved.');
        }
      }
      return;
    }
    if (!Recognition || saveRequest.current) return;
    let recognition;
    try { recognition = new Recognition(); }
    catch { setDictationStatus('Dictation could not start. You can still type your note.'); return; }
    const base = draft.trimEnd();
    const current = () => mounted.current && dictation.current === recognition;
    recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = event => {
      if (!current()) return;
      const words = Array.from(event.results).map(result => result[0]?.transcript || '').join(' ').trim();
      editDraft([base, words].filter(Boolean).join('\n'));
    };
    recognition.onend = () => {
      if (!current()) return;
      dictation.current = null; setListening(false);
      setDictationStatus('Dictation stopped. Review and edit the draft, then choose Save note.');
    };
    recognition.onerror = event => {
      if (!current()) return;
      dictation.current = null; setListening(false);
      setDictationStatus(['not-allowed', 'service-not-allowed'].includes(event.error)
        ? 'Microphone permission was not granted. You can still type and save your note.'
        : 'Dictation stopped before completion. Review the words captured or continue typing.');
      try { recognition.abort(); } catch { /* Recording may already have ended. */ }
    };
    dictation.current = recognition;
    setListening(true); setDictationStatus('Listening. Your words stay in this draft until you review and save.');
    try { recognition.start(); }
    catch {
      dictation.current = null; setListening(false);
      setDictationStatus('Dictation could not start. You can still type your note.');
      try { recognition.abort(); } catch { /* Nothing started. */ }
    }
  }

  return <section className="project-activity" id="document-activity" aria-label="Project activity">
    <div className="project-activity__heading">
      <div><h3>Project activity</h3><p>Saved notes and project changes.</p></div>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh activity</button>
    </div>
    {loading && <p role="status">Loading recent activity…</p>}
    {historyError && <div role="alert"><p>{historyError}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>Retry activity</button></div>}
    {!loading && !historyError && !history.events.length && <p>No saved activity yet.</p>}
    <ol className="project-activity__events">
      {history.events.map(item => <li key={item.id}>
        <div className="project-activity__event-meta"><strong>{item.type === 'note.saved' ? 'Project note' : 'Saved activity'}</strong><time dateTime={item.occurred_at}>{new Date(item.occurred_at).toLocaleString()}</time></div>
        <p>{item.type === 'note.saved' && typeof item.text === 'string' ? item.text : item.summary}</p>
      </li>)}
    </ol>
    {olderError && <p role="alert">{olderError}</p>}
    {history.nextCursor && <button type="button" disabled={loading || loadingOlder} onClick={loadOlder}>{loadingOlder ? 'Loading older activity…' : olderError ? 'Retry older activity' : 'Load older activity'}</button>}
    <form className="project-activity__note" aria-label="Add project note" onSubmit={saveNote}>
      <label htmlFor={fieldId}>Add a project note</label>
      <p id={`${fieldId}-help`}>Choose a prompt or write your own. Review the draft before saving it to this project.</p>
      <div className="project-activity__templates" aria-label="Note prompts">
        {Object.entries(TEMPLATES).map(([label, text]) => <button key={label} type="button" disabled={saving || listening} onClick={() => editDraft([draft.trimEnd(), text].filter(Boolean).join('\n\n'))}>{label}</button>)}
      </div>
      <textarea id={fieldId} rows={5} maxLength={NOTE_LIMIT} value={draft} disabled={saving || listening}
        aria-describedby={`${fieldId}-help ${fieldId}-count`} onChange={event => editDraft(event.target.value)} />
      <p id={`${fieldId}-count`} className="project-activity__count">{draft.trim().length} / {NOTE_LIMIT} characters{draft.trim().length > NOTE_LIMIT ? ' — shorten the note before saving.' : ''}</p>
      <div className="project-activity__actions">
        <button type="button" disabled={!Recognition || saving} onClick={toggleDictation}>{listening ? 'Stop dictation' : 'Dictate note'}</button>
        <button type="submit" className="project-activity__save" disabled={saving || listening || !draft.trim() || draft.trim().length > NOTE_LIMIT}>{saving ? 'Saving note…' : 'Save note'}</button>
      </div>
      {Recognition && <p>Your browser may process speech online. Review the draft before saving.</p>}
      {!Recognition && <p>Dictation is unavailable in this browser. You can type your note instead.</p>}
      {dictationStatus && <p role="status">{dictationStatus}</p>}
      {saveError && <p role="alert">{saveError}</p>}
      {saveStatus && <p role="status">{saveStatus}</p>}
    </form>
  </section>;
}

export default function DocumentActivity({ projectId, revision }) {
  // Keep drafts only for this mounted signed-in session, never in shared browser storage.
  const drafts = useRef(new Map());
  useEffect(() => {
    const sessionDrafts = drafts.current;
    return () => sessionDrafts.clear();
  }, []);
  if (projectId === null || projectId === undefined || projectId === '') return null;
  // Remount active requests and dictation on a project switch; retain each project's draft above.
  return <ProjectActivity key={String(projectId)} projectId={projectId} revision={revision} drafts={drafts.current} />;
}
