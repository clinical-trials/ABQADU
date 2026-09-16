import { useCallback, useEffect, useRef, useState } from 'react';
import { requestList } from '../utils/api';

export default function useApiList(url) {
  const [state, setState] = useState({ url, data: [], loading: Boolean(url), error: '' });
  const currentUrl = useRef(url);
  currentUrl.current = url;
  const sequence = useRef(0);
  const controller = useRef(null);
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    if (!url || !mounted.current || currentUrl.current !== url) return null;
    const request = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState(previous => ({ url, data: previous.url === url ? previous.data : [], loading: true, error: '' }));
    try {
      const data = await requestList(url, { signal: abort.signal });
      if (!mounted.current || request !== sequence.current || currentUrl.current !== url) return null;
      setState({ url, data, loading: false, error: '' });
      return data;
    } catch (error) {
      if (mounted.current && request === sequence.current && currentUrl.current === url && error.name !== 'AbortError') {
        setState(previous => ({ ...previous, loading: false, error: error.message }));
      }
      return null;
    }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; sequence.current += 1; controller.current?.abort(); };
  }, [reload]);

  return { ...(state.url === url ? state : { data: [], loading: Boolean(url), error: '' }), reload };
}
