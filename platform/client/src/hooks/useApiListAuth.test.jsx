import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useApiList from './useApiList';
import { setAuthSession } from '../utils/authFetch';

test('a captured list reload cannot send an old component request with a new identity', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => [{ id: 'private-a' }] }));
  let list;
  function Harness() { list = useApiList('/api/clients'); return <output>{JSON.stringify(list.data)}</output>; }
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness />));
    const reload = list.reload; fetch.mockClear();
    await act(async () => setAuthSession({ userId: 'staff-b', sessionId: 'b', getToken: async () => 'token-b' }));
    await act(async () => reload());
    expect(fetch).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('private-a');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
