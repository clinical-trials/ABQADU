import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import DocumentActivity from './DocumentActivity';

let host, root, props;
const originalCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const event = (id, summary, project = 'job-one') => ({ id, project_id: project, type: 'project.updated', summary, actor_id: 'staff-one', occurred_at: '2026-09-30T16:00:00Z' });
const note = (body, project = 'job-one') => ({ ...event(`note-${body.request_id}`, `Saved note: ${body.text}`, project), type: 'note.saved', text: body.text, request_id: body.request_id });
const posts = () => fetch.mock.calls.filter(([, options]) => options?.method === 'POST');
const button = label => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === label);
const render = async () => act(async () => root.render(<DocumentActivity {...props} />));
const change = async text => act(async () => Simulate.change(host.querySelector('textarea'), { target: { value: text } }));
const save = async () => act(async () => Simulate.submit(host.querySelector('form')));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

beforeEach(() => {
  Object.defineProperty(window, 'crypto', { configurable: true, value: require('crypto').webcrypto });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  props = { projectId: 'job-one', revision: 'revision-1' };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  global.fetch = jest.fn(async (_url, options) => reply(options?.method === 'POST' ? { event: note(JSON.parse(options.body)) } : { events: [], next_cursor: null }));
  delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
  if (originalCrypto) Object.defineProperty(window, 'crypto', originalCrypto);
  else delete window.crypto;
  jest.restoreAllMocks();
});

test('shows the latest five saved events, loads older history, and refreshes on a new revision', async () => {
  fetch.mockImplementation(async url => reply(url.includes('cursor=')
    ? { events: [event('old', 'Earlier site planning')], next_cursor: null }
    : { events: Array.from({ length: 5 }, (_, index) => event(`recent-${index}`, `Saved project change ${index}`)), next_cursor: 'older/date+id' }));
  await render();
  expect(fetch.mock.calls[0][0]).toBe('/api/project-helper/projects/job-one/activity?limit=5');
  expect(host.querySelectorAll('.project-activity__events li')).toHaveLength(5);
  await act(async () => button('Load older activity').click());
  expect(fetch.mock.calls[1][0]).toContain('cursor=older%2Fdate%2Bid');
  expect(host.textContent).toContain('Earlier site planning');
  expect(button('Load older activity')).toBeUndefined();
  fetch.mockResolvedValue(reply({ events: [event('latest', 'Latest saved change')], next_cursor: null }));
  props.revision = 'revision-2'; await render();
  expect(host.textContent).toContain('Latest saved change');
  expect(host.textContent).not.toContain('Earlier site planning');
  expect(posts()).toHaveLength(0);
});

test('quick templates add prompts to an existing draft without claiming work happened or saving', async () => {
  await render();
  await change('Keep my observation.');
  await act(async () => button('Site visit').click());
  expect(host.querySelector('textarea').value).toContain('Keep my observation.');
  expect(host.querySelector('textarea').value).toContain('Observations:');
  await act(async () => button('Materials').click());
  await act(async () => button('Inspection').click());
  expect(host.querySelector('textarea').value).toContain('Quantity:');
  expect(host.querySelector('textarea').value).toContain('Result / follow-up:');
  expect(host.querySelector('textarea').value).not.toMatch(/inspection passed|materials delivered/i);
  expect(posts()).toHaveLength(0);
});

test('failed saves preserve the draft and reuse the exact request body on retry', async () => {
  let firstBody;
  fetch.mockImplementation(async (_url, options) => {
    if (options?.method !== 'POST') return reply({ events: [], next_cursor: null });
    if (!firstBody) { firstBody = options.body; return reply({ error: 'Storage unavailable' }, 503); }
    return reply({ event: note(JSON.parse(options.body)) });
  });
  await render(); await change('  Recheck the utility access.  '); await save();
  expect(host.querySelector('textarea').value).toBe('  Recheck the utility access.  ');
  expect(host.textContent).toContain('Storage unavailable');
  expect(host.textContent).not.toContain('Note saved.');
  await save();
  expect(posts()).toHaveLength(2);
  expect(posts()[1][1].body).toBe(firstBody);
  const body = JSON.parse(firstBody);
  expect(body.text).toBe('Recheck the utility access.');
  expect(body.request_id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
  expect(host.querySelector('textarea').value).toBe('');
  expect(host.textContent).toContain('Note saved.');
});

test('changing a failed draft creates a new request identity and invalid receipts do not clear it', async () => {
  fetch.mockImplementation(async (_url, options) => reply(options?.method === 'POST'
    ? { event: { ...note(JSON.parse(options.body)), request_id: 'wrong-request' } }
    : { events: [], next_cursor: null }));
  await render(); await change('First observation'); await save();
  expect(host.querySelector('textarea').value).toBe('First observation');
  await change('Changed observation'); await save();
  const [first, second] = posts().map(([, options]) => JSON.parse(options.body));
  expect(second.request_id).not.toBe(first.request_id);
  expect(second.text).toBe('Changed observation');
  expect(host.querySelector('textarea').value).toBe('Changed observation');
  expect(host.textContent).not.toContain('Note saved.');
});

test('empty and overlength notes never send a save request', async () => {
  await render(); await change('   '); await save();
  await change('x'.repeat(2001)); await save();
  expect(posts()).toHaveLength(0);
  expect(host.querySelector('textarea').value).toHaveLength(2001);
});

test('project changes abort pending history and ignore its late private content', async () => {
  const old = deferred();
  fetch.mockImplementation(async url => url.includes('/job-one/') ? old.promise : reply({ events: [event('new', 'Second project activity', 'job-two')], next_cursor: null }));
  await render();
  const signal = fetch.mock.calls[0][1].signal;
  props.projectId = 'job-two'; await render();
  expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(reply({ events: [event('old', 'First project private note')], next_cursor: null })));
  expect(host.textContent).toContain('Second project activity');
  expect(host.textContent).not.toContain('First project private note');
});

test('project changes abort pending saves and late receipts cannot clear the new project draft', async () => {
  const old = deferred();
  fetch.mockImplementation(async (_url, options) => options?.method === 'POST' ? old.promise : reply({ events: [], next_cursor: null }));
  await render(); await change('First project note'); await save();
  const [url, options] = posts()[0];
  expect(url).toBe('/api/project-helper/projects/job-one/notes');
  props.projectId = 'job-two'; await render(); await change('Keep second project note');
  expect(options.signal.aborted).toBe(true);
  await act(async () => old.resolve(reply({ event: note(JSON.parse(options.body)) })));
  expect(host.querySelector('textarea').value).toBe('Keep second project note');
  expect(host.textContent).not.toContain('Note saved.');
});

test('unsaved drafts survive project switches without filling or saving another project', async () => {
  await render(); await change('First project observations.');
  props.projectId = 'job-two'; await render();
  expect(host.querySelector('textarea').value).toBe('');
  await change('Second project materials.');
  props.projectId = 'job-one'; await render();
  expect(host.querySelector('textarea').value).toBe('First project observations.');
  props.projectId = 'job-two'; await render();
  expect(host.querySelector('textarea').value).toBe('Second project materials.');
  expect(posts()).toHaveLength(0);
});

test('a failed save keeps its exact retry identity across project switches', async () => {
  fetch.mockImplementation(async (_url, options) => reply(options?.method === 'POST'
    ? { error: 'Receipt unavailable' } : { events: [], next_cursor: null }, options?.method === 'POST' ? 503 : 200));
  await render(); await change('  Check the first project meter.  '); await save();
  const firstBody = posts()[0][1].body;
  props.projectId = 'job-two'; await render();
  props.projectId = 'job-one'; await render();
  expect(host.querySelector('textarea').value).toBe('  Check the first project meter.  ');
  expect(posts()).toHaveLength(1);
  fetch.mockImplementation(async (_url, options) => reply(options?.method === 'POST'
    ? { event: note(JSON.parse(options.body)) } : { events: [], next_cursor: null }));
  await save();
  expect(posts()).toHaveLength(2);
  expect(posts()[1][1].body).toBe(firstBody);
  expect(host.querySelector('textarea').value).toBe('');
  props.projectId = 'job-two'; await render();
  props.projectId = 'job-one'; await render();
  expect(host.querySelector('textarea').value).toBe('');
});

test('an aborted uncertain save retains its draft and retry identity despite a late receipt', async () => {
  const pending = deferred();
  fetch.mockImplementation(async (_url, options) => options?.method === 'POST' ? pending.promise : reply({ events: [], next_cursor: null }));
  await render(); await change('Review first project access.'); await save();
  const first = posts()[0][1];
  props.projectId = 'job-two'; await render(); await change('Keep the second project draft.');
  expect(first.signal.aborted).toBe(true);
  await act(async () => pending.resolve(reply({ event: note(JSON.parse(first.body)) })));
  props.projectId = 'job-one'; await render();
  expect(host.querySelector('textarea').value).toBe('Review first project access.');
  expect(posts()).toHaveLength(1);
  fetch.mockImplementation(async (_url, options) => reply(options?.method === 'POST'
    ? { event: note(JSON.parse(options.body)) } : { events: [], next_cursor: null }));
  await save();
  expect(posts()).toHaveLength(2);
  expect(posts()[1][1].body).toBe(first.body);
  props.projectId = 'job-two'; await render();
  expect(host.querySelector('textarea').value).toBe('Keep the second project draft.');
});

test('unmounting the signed-in activity component discards all in-memory drafts and retry identities', async () => {
  fetch.mockImplementation(async (_url, options) => reply(options?.method === 'POST'
    ? { error: 'Receipt unavailable' } : { events: [], next_cursor: null }, options?.method === 'POST' ? 503 : 200));
  await render(); await change('Private session note.'); await save();
  const firstBody = JSON.parse(posts()[0][1].body);
  props.projectId = 'job-two'; await render(); await change('Another private draft.');
  await act(async () => root.unmount()); root = createRoot(host);
  await render();
  expect(host.querySelector('textarea').value).toBe('');
  props.projectId = 'job-one'; await render();
  expect(host.querySelector('textarea').value).toBe('');
  await change('Private session note.'); await save();
  expect(JSON.parse(posts()[1][1].body).request_id).not.toBe(firstBody.request_id);
});

test('invalid or cross-project history is not displayed and can be retried', async () => {
  fetch.mockResolvedValue(reply({ events: [event('wrong', 'Another project secret', 'wrong-project')], next_cursor: null }));
  await render();
  expect(host.textContent).not.toContain('Another project secret');
  expect(button('Retry activity')).toBeDefined();
  fetch.mockResolvedValue(reply({ events: [event('right', 'Current project change')], next_cursor: null }));
  await act(async () => button('Retry activity').click());
  expect(host.textContent).toContain('Current project change');
});

function speechFixture() {
  const instances = [];
  window.SpeechRecognition = class {
    constructor() { instances.push(this); }
    start = jest.fn();
    stop = jest.fn();
    abort = jest.fn();
  };
  return instances;
}

test('dictation requires a click, keeps a reviewable draft, and never saves automatically', async () => {
  const instances = speechFixture();
  await render();
  expect(instances).toHaveLength(0);
  await change('Existing note.');
  await act(async () => button('Dictate note').click());
  expect(instances).toHaveLength(1);
  const recognition = instances[0];
  await act(async () => recognition.onresult({ results: [Object.assign([{ transcript: 'Check the west gate.' }], { isFinal: true })] }));
  expect(host.querySelector('textarea').value).toContain('Existing note.');
  expect(host.querySelector('textarea').value).toContain('Check the west gate.');
  expect(button('Save note').disabled).toBe(true);
  await act(async () => button('Stop dictation').click());
  expect(recognition.stop).toHaveBeenCalledTimes(1);
  await act(async () => recognition.onend());
  expect(host.textContent).toMatch(/review.*save/i);
  expect(posts()).toHaveLength(0);
  await save();
  expect(JSON.parse(posts()[0][1].body).text).toContain('Check the west gate.');
});

test('dictation is aborted on project change and old transcripts cannot enter the next draft', async () => {
  const instances = speechFixture();
  await render(); await act(async () => button('Dictate note').click());
  const recognition = instances[0];
  const lateResult = recognition.onresult;
  props.projectId = 'job-two'; await render();
  expect(recognition.abort).toHaveBeenCalledTimes(1);
  await act(async () => lateResult({ results: [Object.assign([{ transcript: 'Private first project words' }], { isFinal: true })] }));
  expect(host.querySelector('textarea').value).toBe('');
  expect(posts()).toHaveLength(0);
});

test('microphone denial preserves typed text and falls back to editing', async () => {
  const instances = speechFixture();
  await render(); await change('Keep this typed note.');
  await act(async () => button('Dictate note').click());
  await act(async () => instances[0].onerror({ error: 'not-allowed' }));
  expect(host.querySelector('textarea').value).toBe('Keep this typed note.');
  expect(host.querySelector('textarea').disabled).toBe(false);
  expect(host.textContent).toMatch(/microphone.*permission/i);
  expect(posts()).toHaveLength(0);
});

test('a failed graceful dictation stop aborts recording and preserves the reviewable draft', async () => {
  const instances = speechFixture();
  await render(); await change('Keep the site observations.');
  await act(async () => button('Dictate note').click());
  instances[0].stop.mockImplementation(() => { throw new Error('Cannot stop gracefully'); });
  await act(async () => button('Stop dictation').click());
  expect(instances[0].abort).toHaveBeenCalledTimes(1);
  expect(host.querySelector('textarea').disabled).toBe(false);
  expect(host.querySelector('textarea').value).toBe('Keep the site observations.');
  expect(posts()).toHaveLength(0);
});

test('late older history cannot overwrite a refreshed activity list', async () => {
  const older = deferred();
  fetch.mockImplementation(async url => url.includes('cursor=') ? older.promise : reply({ events: [event('initial', 'Initial activity')], next_cursor: 'older' }));
  await render(); await act(async () => button('Load older activity').click());
  const signal = fetch.mock.calls[1][1].signal;
  fetch.mockResolvedValue(reply({ events: [event('latest', 'Refreshed activity')], next_cursor: null }));
  props.revision = 'revision-2'; await render();
  expect(signal.aborted).toBe(true);
  await act(async () => older.resolve(reply({ events: [event('old', 'Stale older page')], next_cursor: 'more' })));
  expect(host.textContent).toContain('Refreshed activity');
  expect(host.textContent).not.toContain('Stale older page');
  expect(button('Load older activity')).toBeUndefined();
});

test('saved notes show their full text as plain content, not only a truncated summary', async () => {
  const text = `${'Long project note. '.repeat(12)}<img src=x onerror=alert(1)>`;
  fetch.mockResolvedValue(reply({ events: [{ ...note({ request_id: 'receipt', text }), summary: 'Saved note: truncated…' }], next_cursor: null }));
  await render();
  expect(host.querySelector('.project-activity__events').textContent).toContain(text);
  expect(host.querySelector('.project-activity__events img')).toBeNull();
});

test('unmount aborts history and active dictation', async () => {
  const instances = speechFixture();
  const pending = deferred(); fetch.mockReturnValue(pending.promise);
  await render();
  const signal = fetch.mock.calls[0][1].signal;
  await act(async () => button('Dictate note').click());
  await act(async () => root.unmount());
  root = { unmount() {} };
  expect(signal.aborted).toBe(true);
  expect(instances[0].abort).toHaveBeenCalledTimes(1);
});
