import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { requestJson } from '../utils/api';
import { getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';

// Load once per workspace page, rather than once for every invoice or client.
// Optional provider availability must never gate the built-in ledger.
export default function useBillingIntegrations() {
  const [owner] = useState(getAuthSession);
  useSyncExternalStore(subscribeAuthSession, getAuthSession);
  const [state, setState] = useState({ integrations: null, loading: true, error: '' });
  const controller = useRef(null);
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    if (!mounted.current || !isAuthSessionCurrent(owner)) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ integrations: null, loading: true, error: '' });
    try {
      const result = await requestJson('/api/integrations/status', { authSession: owner, signal: abort.signal });
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Optional service status could not be checked.');
      if (mounted.current && !abort.signal.aborted && isAuthSessionCurrent(owner)) {
        setState({ integrations: result, loading: false, error: '' });
      }
    } catch (error) {
      if (mounted.current && !abort.signal.aborted && isAuthSessionCurrent(owner)) {
        setState({ integrations: null, loading: false, error: error.message });
      }
    }
  }, [owner]);
  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; controller.current?.abort(); };
  }, [reload]);
  return { ...(isAuthSessionCurrent(owner) ? state : { integrations: null, loading: false, error: '' }), reload };
}
