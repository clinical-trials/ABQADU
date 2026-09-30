import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, assertAuthSession, getAuthSession, subscribeAuthSession } from '../utils/authFetch';
import { requestPdfBlob } from '../utils/api';

const empty = { loading: false, error: '', url: '', filename: '', blocked: false };
const close = popup => { try { if (popup && !popup.closed) popup.close(); } catch { /* Detached window. */ } };

async function requestDemoPdf(terms, owner, signal) {
  const response = await apiFetch('/api/preconstruction/demo/packet.pdf', {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({terms}),authSession:owner,signal,
  });
  assertAuthSession(owner);
  if (signal.aborted) throw new DOMException('Request cancelled','AbortError');
  if (!response.ok) {
    let message;
    try { message = (await response.json()).error; } catch { /* Non-JSON error page. */ }
    throw new Error(typeof message === 'string' ? message : 'The demo PDF could not be prepared. Please try again.');
  }
  if (response.headers.get('X-Preconstruction-Demo') !== 'true' || !response.headers.get('Content-Type')?.toLowerCase().includes('application/pdf')) {
    throw new Error('The response could not be verified as a demo PDF. Your draft is still here.');
  }
  const blob = await response.blob();
  assertAuthSession(owner);
  if (!blob.size) throw new Error('The demo PDF was empty. Please try again.');
  return blob;
}

export default function usePreconstructionPdf(projectId, { demo = false } = {}) {
  const [pdf, setPdf] = useState(empty);
  const active = useRef(null);
  const release = useCallback(() => {
    const resource = active.current;
    active.current = null;
    if (!resource) return;
    resource.controller.abort();
    if (resource.url) URL.revokeObjectURL(resource.url);
    close(resource.popup);
  }, []);
  const clear = useCallback(() => { release(); setPdf(empty); }, [release]);
  useEffect(() => {
    const unsubscribe = subscribeAuthSession(clear);
    return () => { unsubscribe(); release(); };
  }, [projectId, demo, clear, release]);

  const open = useCallback(revision => {
    if (!projectId || (!demo && !revision?.version) || (demo && !revision) || active.current?.pending) return;
    release();
    const owner = getAuthSession();
    try { assertAuthSession(owner); } catch (error) { setPdf({ ...empty, error: error.message }); return; }
    let popup = null;
    try {
      // Reserve a tab in the click gesture; the authenticated request follows.
      popup = window.open('about:blank', '_blank');
      if (popup) {
        popup.opener = null;
        popup.document.title = demo ? 'ABQ ADU · Demo preconstruction draft' : 'ABQ ADU · Preconstruction draft';
        popup.document.body.textContent = demo ? 'Preparing the editable demo PDF. No job record is saved…' : `Preparing preconstruction draft revision ${revision.revision}…`;
      }
    } catch { close(popup); popup = null; }
    const resource = { popup, controller: new AbortController(), pending: true, url: '' };
    active.current = resource;
    setPdf({ ...empty, loading: true });
    (async () => {
      try {
        const blob = demo
          ? await requestDemoPdf(revision,owner,resource.controller.signal)
          : await requestPdfBlob(`/api/preconstruction/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(revision.version)}/packet.pdf`, { authSession: owner, signal: resource.controller.signal });
        if (active.current !== resource) return;
        assertAuthSession(owner);
        resource.url = URL.createObjectURL(blob);
        resource.pending = false;
        let blocked = !popup || popup.closed;
        if (!blocked) {
          try { popup.location.replace(resource.url); } catch { blocked = true; close(popup); }
        }
        setPdf({ ...empty, url: resource.url, blocked, filename: demo ? 'ABQ-ADU-preconstruction-DEMO.pdf' : `ABQ-ADU-preconstruction-${projectId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}-r${revision.revision}.pdf` });
      } catch (error) {
        if (active.current !== resource) return;
        release();
        setPdf({ ...empty, error: error.message || 'Unable to prepare the PDF. Try again.' });
      }
    })();
  }, [projectId, demo, release]);
  return { ...pdf, open, clear };
}
