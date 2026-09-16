import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useCommandCenter from './useCommandCenter';

const initialState = {
  version: 'Version 10',
  builder: { company: 'ABQ ADU', phone: '505-555-0100' },
  projects: [{ id: 'project-1', client: 'Homeowner', address: 'Albuquerque', bid_total: 125000 }],
  receipts: [{ id: 'receipt-1', vendor: 'Supply store', amount: 25 }],
  mileage: [],
  activity: [],
};

const response = (payload, ok = true) => Promise.resolve({
  ok,
  status: ok ? 200 : 500,
  json: async () => payload,
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

describe('Command Center persistence', () => {
  let container;
  let root;
  let current;
  let server;
  let requests;
  let handleRequest;
  const originalFetch = global.fetch;

  function Harness() {
    current = useCommandCenter();
    return <>
      <output data-testid="state">{JSON.stringify(current.state)}</output>
      <output data-testid="error">{current.error}</output>
      <output data-testid="status">{current.status}</output>
    </>;
  }

  const visibleState = () => JSON.parse(container.querySelector('[data-testid="state"]').textContent);
  const putRequests = () => requests.filter(request => request.method === 'PUT');
  const advanceDebounce = () => act(async () => { jest.advanceTimersByTime(400); });

  beforeEach(async () => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    window.sessionStorage.clear();
    server = JSON.parse(JSON.stringify(initialState));
    requests = [];
    handleRequest = null;
    global.fetch = (path, options = {}) => {
      const request = { path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined };
      requests.push(request);
      if (handleRequest) {
        const custom = handleRequest(request);
        if (custom) return custom;
      }
      if (request.method === 'PUT') server = { ...server, ...request.body };
      return response(JSON.parse(JSON.stringify(server)));
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<Harness />); });
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  test('loads the initial state and coalesces rapid edits into changed top-level keys only', async () => {
    expect(visibleState()).toEqual(initialState);
    act(() => {
      current.updateList('projects', 'project-1', 'client', 'A');
      current.updateList('projects', 'project-1', 'client', 'Alice');
      current.updateList('projects', 'project-1', 'address', '123 Main Street');
      current.updateList('receipts', 'receipt-1', 'vendor', 'Local supply');
    });

    expect(visibleState().projects[0]).toMatchObject({ client: 'Alice', address: '123 Main Street' });
    expect(visibleState().receipts[0].vendor).toBe('Local supply');
    expect(putRequests()).toHaveLength(0);
    expect(current.status).toMatch(/unsaved/i);

    await advanceDebounce();

    expect(putRequests()).toHaveLength(1);
    expect(Object.keys(putRequests()[0].body).sort()).toEqual(['projects', 'receipts']);
    expect(server.projects[0]).toMatchObject({ client: 'Alice', address: '123 Main Street' });
    expect(current.saving).toBe(false);
    expect(current.status).toMatch(/all changes saved/i);
  });

  test('serializes saves and never lets an older response erase a newer edit', async () => {
    const firstSave = deferred();
    handleRequest = request => request.method === 'PUT' && putRequests().length === 1 ? firstSave.promise : null;
    act(() => { current.updateList('projects', 'project-1', 'client', 'First'); });
    await advanceDebounce();
    expect(current.saving).toBe(true);

    act(() => { current.updateList('projects', 'project-1', 'client', 'Latest'); });
    await advanceDebounce();
    expect(putRequests()).toHaveLength(1);

    await act(async () => {
      server = { ...server, ...putRequests()[0].body };
      firstSave.resolve(await response(server));
    });

    expect(visibleState().projects[0].client).toBe('Latest');
    expect(putRequests()).toHaveLength(2);
    expect(server.projects[0].client).toBe('Latest');
    expect(current.saving).toBe(false);
  });

  test.each(['http', 'network'])('retains edits after a %s save failure and retries them', async failure => {
    handleRequest = request => {
      if (request.method !== 'PUT') return null;
      return failure === 'http' ? response({ error: 'Storage unavailable' }, false) : Promise.reject(new Error('Network offline'));
    };
    act(() => { current.updateList('projects', 'project-1', 'client', 'Keep this name'); });
    await advanceDebounce();

    expect(visibleState().projects[0].client).toBe('Keep this name');
    expect(container.querySelector('[data-testid="error"]').textContent).toMatch(/Storage unavailable|Network offline/);
    expect(current.saving).toBe(false);
    expect(current.status).toMatch(/unsaved/i);

    handleRequest = null;
    let saved;
    await act(async () => { saved = await current.saveState({}); });
    expect(saved.projects[0].client).toBe('Keep this name');
    expect(server.projects[0].client).toBe('Keep this name');
    expect(current.error).toBe('');
    expect(current.status).toMatch(/all changes saved/i);
  });

  test('flushes the latest edits before an action and preserves edits made while its response is pending', async () => {
    const firstSave = deferred();
    const invoiceAction = deferred();
    handleRequest = request => {
      if (request.method === 'PUT' && putRequests().length === 1) return firstSave.promise;
      if (request.path.endsWith('/invoice-drafts')) return invoiceAction.promise;
      return null;
    };
    act(() => { current.updateList('projects', 'project-1', 'client', 'Before invoice'); });
    let action;
    await act(async () => { action = current.runAction('/api/command-center/projects/project-1/invoice-drafts', { method: 'POST' }); });
    expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);

    act(() => { current.updateList('projects', 'project-1', 'address', 'Latest address'); });
    await act(async () => {
      server = { ...server, ...putRequests()[0].body };
      firstSave.resolve(await response(server));
    });
    expect(requests.map(request => request.method)).toEqual(['GET', 'PUT', 'PUT', 'POST']);
    expect(server.projects[0].address).toBe('Latest address');

    act(() => { current.updateList('projects', 'project-1', 'client', 'Typed during invoice'); });
    await act(async () => {
      server = { ...server, projects: [{ ...server.projects[0], invoice_drafts: [{ id: 'invoice-1', amount: 10000 }] }] };
      invoiceAction.resolve(await response(server));
      await action;
    });
    expect(visibleState().projects[0]).toMatchObject({ client: 'Typed during invoice', invoice_drafts: [{ id: 'invoice-1', amount: 10000 }] });

    await advanceDebounce();
    expect(server.projects[0]).toMatchObject({ client: 'Typed during invoice', invoice_drafts: [{ id: 'invoice-1', amount: 10000 }] });
  });

  test('blocks a dependent action when its prerequisite save fails', async () => {
    handleRequest = request => request.method === 'PUT' ? response({ error: 'Cannot save' }, false) : null;
    act(() => { current.updateList('projects', 'project-1', 'client', 'Unsaved homeowner'); });
    let result;
    await act(async () => { result = await current.runAction('/api/command-center/projects/project-1/invoice-drafts', { method: 'POST' }); });

    expect(result).toBeNull();
    expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);
    expect(visibleState().projects[0].client).toBe('Unsaved homeowner');
    expect(current.error).toMatch(/Cannot save/);
    expect(current.saving).toBe(false);
  });

  test('returns a preview payload without replacing command-center state', async () => {
    const preview = { client: 'Homeowner', total: 125000, invoice_stages: [] };
    handleRequest = request => request.path.endsWith('/client-view-preview') ? response(preview) : null;
    let result;
    await act(async () => { result = await current.runAction('/api/command-center/projects/project-1/client-view-preview'); });

    expect(result).toEqual(preview);
    expect(visibleState()).toEqual(initialState);
    expect(current.saving).toBe(false);
  });

  test('keeps valid state after a failed action or reload and exposes the error', async () => {
    handleRequest = () => response({ error: 'Session expired' }, false);
    await act(async () => { await current.runAction('/api/command-center/activity', { method: 'POST' }); });
    expect(visibleState()).toEqual(initialState);
    expect(current.error).toMatch(/Session expired/);
    expect(current.saving).toBe(false);

    await act(async () => { await current.load(); });
    expect(visibleState()).toEqual(initialState);
    expect(current.error).toMatch(/Session expired/);
    act(() => { current.clearError(); });
    expect(current.error).toBe('');
  });

  test('does not hide a failed action when a queued background save succeeds', async () => {
    const actionResponse = deferred();
    handleRequest = request => request.method === 'POST' ? actionResponse.promise : null;
    let action;
    await act(async () => { action = current.runAction('/api/command-center/activity', { method: 'POST' }); });
    act(() => { current.updateList('projects', 'project-1', 'client', 'Saved after failed action'); });
    await advanceDebounce();
    await act(async () => {
      actionResponse.resolve(await response({ error: 'Activity could not be added' }, false));
      await action;
    });

    expect(server.projects[0].client).toBe('Saved after failed action');
    expect(current.error).toMatch(/Activity could not be added/);
    expect(current.saving).toBe(false);
  });

  test('warns before closing while edits are unacknowledged and stops warning after saving', async () => {
    act(() => { current.updateList('projects', 'project-1', 'client', 'Unsaved name'); });
    const dirtyUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);

    await advanceDebounce();
    const savedUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(savedUnload);
    expect(savedUnload.defaultPrevented).toBe(false);
  });

  test('merges functional save patches immediately without sending unrelated state', async () => {
    let first;
    let second;
    act(() => {
      first = current.saveState(previous => ({ projects: [{ id: 'project-2', client: 'Added' }, ...previous.projects] }));
      second = current.saveState(previous => ({ receipts: [{ id: 'receipt-2', vendor: 'Added receipt' }, ...previous.receipts] }));
    });
    expect(visibleState().projects.map(project => project.id)).toEqual(['project-2', 'project-1']);
    expect(visibleState().receipts.map(receipt => receipt.id)).toEqual(['receipt-2', 'receipt-1']);
    await act(async () => { await Promise.all([first, second]); });
    expect(Object.keys(putRequests()[0].body).sort()).toEqual(['projects', 'receipts']);
    expect(server.builder).toEqual(initialState.builder);
  });

  test('refreshes server changes while retaining pending field edits', async () => {
    act(() => { current.updateList('projects', 'project-1', 'client', 'Local name'); });
    server.projects[0].invoice_drafts = [{ id: 'external-invoice' }];
    await act(async () => { await current.load(); });
    expect(visibleState().projects[0]).toMatchObject({ client: 'Local name', invoice_drafts: [{ id: 'external-invoice' }] });
    expect(current.status).toMatch(/unsaved/i);
    await advanceDebounce();
    expect(server.projects[0]).toMatchObject({ client: 'Local name', invoice_drafts: [{ id: 'external-invoice' }] });
  });

  test('reconciles nested OCR state before a queued receipt edit can erase the newly parsed receipt', async () => {
    const ocrResponse = deferred();
    const parsedReceipt = { id: 'receipt-ocr', vendor: 'Scanned supplier', amount: 284.76 };
    handleRequest = request => request.path === '/api/integrations/ocr/receipt' ? ocrResponse.promise : null;
    let action;
    let result;
    await act(async () => { action = current.runAction('/api/integrations/ocr/receipt', { method: 'POST' }); });
    act(() => { current.updateList('receipts', 'receipt-1', 'vendor', 'Edited during OCR'); });
    await advanceDebounce();
    expect(putRequests()).toHaveLength(0);

    await act(async () => {
      server = { ...server, receipts: [parsedReceipt, ...server.receipts] };
      ocrResponse.resolve(await response({ ok: true, parsed: { vendor: 'Scanned supplier' }, receipt: parsedReceipt, state: server }));
      result = await action;
    });

    expect(result.receipt).toEqual(parsedReceipt);
    expect(requests.map(request => request.method)).toEqual(['GET', 'POST', 'PUT']);
    expect(server.receipts).toEqual([
      { id: 'receipt-ocr', vendor: 'Scanned supplier', amount: 284.76 },
      { id: 'receipt-1', vendor: 'Edited during OCR', amount: 25 },
    ]);
    expect(visibleState().receipts).toEqual(server.receipts);
    expect(current.error).toBe('');
  });

  test('restores failed edits after internal navigation over the latest server state, then clears the acknowledged draft', async () => {
    handleRequest = request => request.method === 'PUT' ? response({ error: 'Offline' }, false) : null;
    act(() => { current.updateList('projects', 'project-1', 'client', 'Keep my unsaved name'); });
    await advanceDebounce();
    await act(async () => { root.render(<div>Away from Command Center</div>); });
    server.projects[0].invoice_drafts = [{ id: 'new-server-invoice' }];
    server.projects.push({ id: 'server-project', client: 'Added elsewhere' });
    await act(async () => { root.render(<Harness />); });

    expect(visibleState().projects[0]).toMatchObject({ client: 'Keep my unsaved name', invoice_drafts: [{ id: 'new-server-invoice' }] });
    expect(visibleState().projects[1].id).toBe('server-project');
    expect(current.status).toMatch(/unsaved/i);
    expect(current.error).toMatch(/restored|unsaved/i);
    expect(putRequests()).toHaveLength(1);

    handleRequest = null;
    await act(async () => { await current.saveState({}); });
    expect(server.projects[0].client).toBe('Keep my unsaved name');
    expect(window.sessionStorage.length).toBe(0);
    expect(current.error).toBe('');
    await act(async () => { root.render(<div>Away again</div>); });
    server.projects[0].client = 'Changed after saving';
    await act(async () => { root.render(<Harness />); });
    expect(visibleState().projects[0].client).toBe('Changed after saving');
    expect(current.status).toMatch(/all changes saved/i);
  });

  test('restores a failed Add receipt without removing new server rows or overwriting server fields', async () => {
    handleRequest = request => request.method === 'PUT' ? response({ error: 'Offline' }, false) : null;
    await act(async () => {
      await current.saveState(previous => ({ receipts: [{ id: 'local-receipt', vendor: 'Unsaved receipt', amount: 10 }, ...previous.receipts] }));
    });
    await act(async () => { root.render(<div>Away</div>); });
    server.receipts[0].amount = 99;
    server.receipts.unshift({ id: 'server-receipt', vendor: 'Scanned while away', amount: 20 });
    await act(async () => { root.render(<Harness />); });
    expect(visibleState().receipts).toEqual(expect.arrayContaining([
      { id: 'local-receipt', vendor: 'Unsaved receipt', amount: 10 },
      { id: 'receipt-1', vendor: 'Supply store', amount: 99 },
      { id: 'server-receipt', vendor: 'Scanned while away', amount: 20 },
    ]));
    handleRequest = null;
    await act(async () => { await current.saveState({}); });
    expect(server.receipts).toHaveLength(3);
  });

  test('retains failed edits across navigation when session storage is unavailable', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    handleRequest = request => request.method === 'PUT' ? response({ error: 'Offline' }, false) : null;
    act(() => { current.updateList('receipts', 'receipt-1', 'vendor', 'Kept in this tab'); });
    await advanceDebounce();
    await act(async () => { root.render(<div>Away</div>); });
    await act(async () => { root.render(<Harness />); });
    expect(visibleState().receipts[0].vendor).toBe('Kept in this tab');
    expect(current.status).toMatch(/unsaved/i);
    handleRequest = null;
    await act(async () => { await current.saveState({}); });
    expect(server.receipts[0].vendor).toBe('Kept in this tab');
  });

  test('keeps new edits made after remount when the previous mount finishes its save', async () => {
    const previousSave = deferred();
    handleRequest = request => request.method === 'PUT' && putRequests().length === 1 ? previousSave.promise : null;
    act(() => { current.updateList('projects', 'project-1', 'client', 'Saved from previous page'); });
    await advanceDebounce();
    await act(async () => { root.render(<div>Away</div>); });
    await act(async () => { root.render(<Harness />); });
    act(() => { current.updateList('projects', 'project-1', 'address', 'Typed after returning'); });
    await act(async () => {
      server = { ...server, ...putRequests()[0].body };
      previousSave.resolve(await response(server));
    });
    expect(visibleState().projects[0]).toMatchObject({ client: 'Saved from previous page', address: 'Typed after returning' });
    expect(current.status).toMatch(/unsaved/i);
    await advanceDebounce();
    expect(server.projects[0]).toMatchObject({ client: 'Saved from previous page', address: 'Typed after returning' });
    expect(window.sessionStorage.length).toBe(0);
  });

  test('recognizes a draft acknowledged by the previous mount before the restored load starts', async () => {
    const previousSave = deferred();
    handleRequest = request => request.method === 'PUT' ? previousSave.promise : null;
    act(() => { current.updateList('projects', 'project-1', 'client', 'Saved while away'); });
    await advanceDebounce();
    await act(async () => { root.render(<div>Away</div>); });
    await act(async () => { root.render(<Harness />); });
    await act(async () => {
      server = { ...server, ...putRequests()[0].body };
      previousSave.resolve(await response(server));
    });
    expect(visibleState().projects[0].client).toBe('Saved while away');
    expect(current.status).toMatch(/all changes saved/i);
    expect(current.error).toBe('');
    expect(window.sessionStorage.length).toBe(0);
  });
});
