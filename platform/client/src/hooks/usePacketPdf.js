import { useCallback, useEffect, useRef, useState } from 'react';
import { assertAuthSession, getAuthSession, subscribeAuthSession } from '../utils/authFetch';
import { requestPdfBlob } from '../utils/api';

const empty = { loading: false, error: '', url: '', filename: '', projectId: '', blocked: false };

function closeWindow(popup) {
  try { if (popup && !popup.closed) popup.close(); } catch { /* Already closed or detached. */ }
}

function reserveWindow() {
  let popup;
  try {
    // Reserve the tab inside the click gesture, before saving or fetching.
    popup = window.open('about:blank', '_blank');
    if (!popup) return null;
    popup.opener = null;
    popup.document.title = 'ABQ ADU · Preparing packet PDF';
    popup.document.body.textContent = 'Preparing your ABQ ADU packet PDF… You can print or save it when it opens.';
    return popup;
  } catch {
    closeWindow(popup);
    return null;
  }
}

export default function usePacketPdf(saveChanges) {
  const [pdf, setPdf] = useState(empty);
  const active = useRef(null);
  const release = useCallback(() => {
    const resource = active.current;
    active.current = null;
    if (!resource) return;
    resource.controller.abort();
    if (resource.url) URL.revokeObjectURL(resource.url);
    closeWindow(resource.popup);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAuthSession(() => { release(); setPdf(empty); });
    return () => { unsubscribe(); release(); };
  }, [release]);

  const open = useCallback(projectId => {
    if (!projectId || active.current?.pending) return;
    release();
    const owner = getAuthSession();
    try { assertAuthSession(owner); } catch (error) { setPdf({ ...empty, error: error.message, projectId }); return; }
    const resource = { popup: reserveWindow(), controller: new AbortController(), pending: true, url: '' };
    active.current = resource;
    setPdf({ ...empty, loading: true, projectId });

    (async () => {
      try {
        const saved = await saveChanges();
        if (active.current !== resource) return;
        if (!saved) throw new Error('Save your project changes before printing. Retry saving, then print again.');
        const blob = await requestPdfBlob(`/api/command-center/projects/${encodeURIComponent(projectId)}/client-packet.pdf`, {
          authSession: owner, signal: resource.controller.signal,
        });
        if (active.current !== resource) return;
        assertAuthSession(owner);
        resource.url = URL.createObjectURL(blob);
        resource.pending = false;
        let blocked = !resource.popup || resource.popup.closed;
        if (!blocked) {
          try { resource.popup.location.replace(resource.url); } catch { blocked = true; closeWindow(resource.popup); }
        }
        setPdf({ ...empty, projectId, url: resource.url, filename: `ABQ-ADU-packet-${String(projectId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}.pdf`, blocked });
      } catch (error) {
        if (active.current !== resource) return;
        release();
        setPdf({ ...empty, projectId, error: error.message || 'Unable to prepare the PDF. Please try again.' });
      }
    })();
  }, [release, saveChanges]);

  return { ...pdf, open };
}
