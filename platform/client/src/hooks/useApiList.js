import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { requestList } from '../utils/api';
import { getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';

export default function useApiList(url) {
  const [owner] = useState(getAuthSession);
  useSyncExternalStore(subscribeAuthSession, getAuthSession);
  const [state, setState] = useState({ url, data: [], loading: Boolean(url), error: '' });
  const currentUrl = useRef(url);
  currentUrl.current = url;
  const sequence = useRef(0);
  const controller = useRef(null);
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    if (!url || !mounted.current || currentUrl.current !== url || !isAuthSessionCurrent(owner)) return null;
    const request = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState(previous => ({ url, data: previous.url === url ? previous.data : [], loading: true, error: '' }));
    try {
      const data = await requestList(url, { signal: abort.signal, authSession: owner });
      if (!mounted.current || request !== sequence.current || currentUrl.current !== url) return null;
      setState({ url, data, loading: false, error: '' });
      return data;
    } catch (error) {
      if (mounted.current && isAuthSessionCurrent(owner) && request === sequence.current && currentUrl.current === url && error.name !== 'AbortError') {
        setState(previous => ({ ...previous, loading: false, error: error.message }));
      }
      return null;
    }
  }, [url, owner]);

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; sequence.current += 1; controller.current?.abort(); };
  }, [reload]);

  return { ...(isAuthSessionCurrent(owner) && state.url === url ? state : { data: [], loading: isAuthSessionCurrent(owner) && Boolean(url), error: '' }), reload };
}
