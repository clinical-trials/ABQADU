import { useCallback, useEffect, useRef, useState } from 'react';

export default function useApiAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const run = useCallback(async action => {
    if (active.current) return { ok: false };
    active.current = true;
    if (mounted.current) { setPending(true); setError(''); }
    try {
      return { ok: true, value: await action() };
    } catch (failure) {
      if (mounted.current) setError(failure.message || 'Request failed. Please try again. Your entries are unchanged.');
      return { ok: false };
    } finally {
      active.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);
  return { run, pending, error };
}
