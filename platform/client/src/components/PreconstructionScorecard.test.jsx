import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import PreconstructionScorecard from './PreconstructionScorecard';
import { requestJson } from '../utils/api';
import { clearAuthSession, setAuthSession } from '../utils/authFetch';

jest.mock('../utils/api', () => ({ requestJson: jest.fn() }));
jest.mock('./BriefingAudio', () => function Audio({ text }) { return <p>{text}</p>; });
const API = '/api/executive/preconstruction-cycle';
const NOW = '2026-09-30T18:00:00.000Z';
const blank = { signed_at: null, deposit_received_at: null, evidence: '' };
const job = (id = 'job-a', milestones = blank, version = 0) => ({ id, name: id === 'job-a' ? 'Example yard' : 'Second job', milestones: { ...milestones }, version });
const round = value => Math.round(value * 100) / 100;
function fixture(jobs = [job(), job('job-b')], generated = NOW) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(generated));
  const monday = new Date(`${today}T12:00Z`); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const day = offset => new Date(monday.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const projects = jobs.map(project => {
    const m = project.milestones, status = m.deposit_received_at ? 'complete' : m.signed_at ? 'awaiting_deposit' : 'not_started';
    const hours = m.signed_at ? (Date.parse(m.deposit_received_at || generated) - Date.parse(m.signed_at)) / 3600000 : null;
    return { ...project, status, hours: hours === null ? null : round(hours), target_status: status !== 'complete' ? null : hours <= 15 ? 'stretch' : hours <= 20 ? 'on_target' : 'over_target' };
  });
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const start = day(-7 * index), end = day(7 - 7 * index);
    const values = projects.filter(project => project.status === 'complete' && project.milestones.deposit_received_at.slice(0, 10) >= start && project.milestones.deposit_received_at.slice(0, 10) < end).map(project => project.hours).sort((a, b) => a - b);
    const count = values.length, middle = Math.floor(count / 2), within = values.filter(value => value <= 20).length;
    return { start, end, count, median_hours: count ? round(count % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2) : null, fastest_hours: count ? values[0] : null, within_target_count: within, within_target_pct: count ? Math.round(within / count * 1000) / 10 : null };
  });
  return { generated_at: generated, time_zone: 'America/Denver', target: { deposit_cents: 1000000, goal_hours: 20, stretch_hours: 15 }, projects, weeks, current_week: weeks[0], previous_week: weeks[1], improvement_hours: weeks[0].count && weeks[1].count ? round(weeks[1].median_hours - weeks[0].median_hours) : null, narration: 'Company timing is manually recorded, not bank verified.' };
}
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
let host, root, savedCallback, originalCrypto;
const field = name => host.querySelector(`[name="${name}"]`);
const render = async () => act(async () => root.render(<PreconstructionScorecard onSaved={savedCallback} />));
const change = async (name, value) => act(async () => Simulate.change(field(name), { target: { value } }));
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent.includes(text));
const click = async text => act(async () => Simulate.click(button(text)));
const submit = async () => act(async () => Simulate.submit(host.querySelector('form')));
const putCalls = () => requestJson.mock.calls.filter(([, options]) => options?.method === 'PUT');
const localTime = instant => {
  const date = new Date(instant), pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fill = async () => { await change('signed_at', localTime('2026-09-28T15:00:00Z')); await change('deposit_received_at', localTime('2026-09-29T09:00:00Z')); await change('evidence', 'Signed agreement and receipt reference 123'); };

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(NOW));
  originalCrypto = Object.getOwnPropertyDescriptor(global, 'crypto');
  Object.defineProperty(global, 'crypto', { configurable: true, value: require('node:crypto').webcrypto });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); savedCallback = jest.fn();
  requestJson.mockReset();
  requestJson.mockImplementation(async (url, options) => {
    if (options?.method === 'PUT') { const body = JSON.parse(options.body); return fixture([job(decodeURIComponent(url.split('/').pop()), body.milestones, body.expected_version + 1), job('job-b')]); }
    return fixture();
  });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks(); if (originalCrypto) Object.defineProperty(global, 'crypto', originalCrypto); else delete global.crypto; });

test('empty weeks remain unknown and the target, cohort and manual evidence boundaries are explicit', async () => {
  await render();
  expect(host.querySelector('#preconstruction-cycle')).not.toBeNull();
  expect(host.textContent).toContain('Contract to $10k'); expect(host.textContent).toContain('Target ≤ 20 elapsed hours'); expect(host.textContent).toContain('Stretch ≤ 15 hours');
  expect(host.textContent).toContain('No completions'); expect(host.textContent).toContain('Previous full week'); expect(host.textContent).toContain('full-deposit receipt date');
  expect(host.textContent).toContain('not bank verified');
  expect(host.querySelector('form')).toBeNull(); expect(putCalls()).toHaveLength(0); expect(host.querySelectorAll('tbody tr')).toHaveLength(8);
  await change('cycle_project', 'job-a');
  expect(host.textContent).toContain('does not sign a contract'); expect(host.textContent).toContain('confirm a bank balance');
});

test('weekly company medians expose sample sizes and unfinished past-target jobs remain separate', async () => {
  requestJson.mockResolvedValue(fixture([
    job('job-a', { signed_at: '2026-09-28T12:00:00Z', deposit_received_at: '2026-09-29T06:00:00Z', evidence: 'Current receipt' }, 1),
    job('previous', { signed_at: '2026-09-21T12:00:00Z', deposit_received_at: '2026-09-22T12:00:00Z', evidence: 'Prior receipt' }, 1),
    job('waiting', { signed_at: '2026-09-28T12:00:00Z', deposit_received_at: null, evidence: 'Agreement only' }, 1),
  ]));
  await render(); expect(host.textContent).toContain('6 h faster'); expect(host.textContent).toContain('1 completed');
  expect(host.textContent).toContain('1 open cycle awaiting the full deposit'); expect(host.textContent).toContain('1 past 20 hours');
  await change('cycle_project', 'waiting'); expect(host.textContent).toContain('Awaiting the full deposit'); expect(host.textContent).not.toContain('Stretch achieved');
});

test('explicit local date inputs convert to UTC and a validated save refreshes the parent once', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill();
  expect(host.textContent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(putCalls()).toHaveLength(0); await submit();
  const [url, options] = putCalls()[0], body = JSON.parse(options.body);
  expect(url).toBe(`${API}/projects/job-a`); expect(options.authSession.userId).toBe('test-staff');
  expect(body).toEqual({ request_id: expect.stringMatching(/^[a-f\d-]{36}$/i), expected_version: 0, milestones: { signed_at: '2026-09-28T15:00:00.000Z', deposit_received_at: '2026-09-29T09:00:00.000Z', evidence: 'Signed agreement and receipt reference 123' } });
  expect(host.textContent).toContain('Milestones recorded.'); expect(host.textContent).toContain('Completed in 18 h'); expect(savedCallback).toHaveBeenCalledTimes(1);
});

test('Use current time fills a field without writing milestones', async () => {
  await render(); await change('cycle_project', 'job-a'); await click('Use current time');
  expect(field('signed_at').value).not.toBe(''); expect(putCalls()).toHaveLength(0);
});

test.each([
  ['missing evidence', '', localTime('2026-09-28T15:00Z'), '', /Add evidence/],
  ['receipt without start', 'Receipt', '', localTime('2026-09-29T09:00Z'), /signed-contract time before/],
  ['backwards dates', 'Receipt', localTime('2026-09-29T09:00Z'), localTime('2026-09-28T15:00Z'), /at or after/],
  ['future', 'Agreement', localTime('2027-01-01T12:00Z'), '', /cannot be in the future/],
])('%s prevents a write and leaves the draft available', async (_name, evidence, start, finish, message) => {
  await render(); await change('cycle_project', 'job-a'); await change('signed_at', start); await change('deposit_received_at', finish); await change('evidence', evidence); await submit();
  expect(putCalls()).toHaveLength(0); expect(host.querySelector('[role="alert"]').textContent).toMatch(message); expect(field('evidence').value).toBe(evidence);
});

test('failed save retains the exact request identity for retry and changed intent receives a new identity', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill();
  requestJson.mockRejectedValueOnce(new Error('Connection lost')); await submit();
  const first = JSON.parse(putCalls()[0][1].body); expect(field('evidence').value).toContain('receipt reference');
  requestJson.mockRejectedValueOnce(new Error('Still unavailable')); await submit(); expect(JSON.parse(putCalls()[1][1].body)).toEqual(first);
  await change('evidence', 'Corrected evidence'); await submit();
  expect(JSON.parse(putCalls()[2][1].body).request_id).not.toBe(first.request_id); expect(savedCallback).toHaveBeenCalledTimes(1);
});

test('project switching preserves each draft and uncertain retry identity', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill(); requestJson.mockRejectedValueOnce(new Error('Uncertain')); await submit();
  const first = putCalls()[0][1].body;
  await change('cycle_project', 'job-b'); expect(field('evidence').value).toBe(''); await change('evidence', 'Second draft');
  await change('cycle_project', 'job-a'); expect(field('evidence').value).toContain('receipt reference'); await submit(); expect(putCalls()[1][1].body).toBe(first);
  await change('cycle_project', 'job-b'); expect(field('evidence').value).toBe('Second draft');
});

test('an aborted save survives navigation and its late response cannot erase the retry draft', async () => {
  const pending = deferred(); await render(); await change('cycle_project', 'job-a'); await fill(); requestJson.mockReturnValueOnce(pending.promise); await submit();
  const [, options] = putCalls()[0], body = JSON.parse(options.body); expect(field('signed_at').closest('fieldset').disabled).toBe(true);
  await act(async () => root.render(<p>Another page</p>)); expect(options.signal.aborted).toBe(true);
  await act(async () => pending.resolve(fixture([job('job-a', body.milestones, 1), job('job-b')])));
  await render(); await change('cycle_project', 'job-a'); expect(field('evidence').value).toContain('receipt reference');
  await submit(); expect(putCalls()[1][1].body).toBe(options.body); expect(savedCallback).toHaveBeenCalledTimes(1);
});

test.each([
  ['unchanged version', report => { report.projects[0].version = 0; }],
  ['invalid target', report => { report.target.goal_hours = 21; }],
  ['wrong elapsed time', report => { report.projects[0].hours = 1; }],
  ['missing job', report => { report.projects.shift(); }],
  ['malformed response', () => null],
])('%s cannot claim a save succeeded or clear the retry draft', async (_name, corrupt) => {
  await render(); await change('cycle_project', 'job-a'); await fill();
  requestJson.mockImplementationOnce(async (_url, options) => { const body = JSON.parse(options.body), report = fixture([job('job-a', body.milestones, 1), job('job-b')]); return corrupt(report) === null ? null : report; });
  await submit(); expect(savedCallback).not.toHaveBeenCalled(); expect(host.textContent).not.toContain('Milestones recorded.'); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(field('evidence').value).toContain('receipt reference'); const first = putCalls()[0][1].body; await submit(); expect(putCalls()[1][1].body).toBe(first);
});

test('a replay returning newer different milestones shows conflict and keeps the draft copyable', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill();
  requestJson.mockResolvedValueOnce(fixture([job('job-a', { signed_at: '2026-09-28T15:00Z', deposit_received_at: null, evidence: 'Another change' }, 2), job('job-b')]));
  await submit(); expect(savedCallback).not.toHaveBeenCalled(); expect(host.textContent).toContain('newer saved record has different milestones');
  const recovery = host.querySelector('textarea[readonly]'); expect(recovery.value).toContain('receipt reference'); expect(recovery.closest('fieldset')).toBeNull();
  expect(field('evidence').closest('fieldset').disabled).toBe(true);
});

test('CAS conflict requires explicit reload; a failed reload does not discard the draft', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill(); requestJson.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { status: 409 })); await submit();
  expect(button('Retry save').disabled).toBe(true);
  requestJson.mockRejectedValueOnce(new Error('Reload unavailable')); await click('Discard this draft'); expect(field('evidence').value).toContain('receipt reference');
  requestJson.mockResolvedValueOnce(fixture([job('job-a', { signed_at: null, deposit_received_at: null, evidence: 'Current record' }, 2), job('job-b')]));
  await click('Discard this draft'); expect(field('evidence').value).toBe('Current record'); expect(button('Save milestones').disabled).toBe(true);
});

test('refresh with a dirty draft does not overwrite it or issue a stale-version new write', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill();
  requestJson.mockResolvedValueOnce(fixture([job('job-a', { ...blank, evidence: 'Another saved version' }, 1), job('job-b')]));
  await click('Refresh scorecard'); expect(field('evidence').value).toContain('receipt reference'); expect(host.textContent).toContain('saved record changed');
  await submit(); expect(putCalls()).toHaveLength(0);
});

test('an uncertain retry remains available after refresh reveals a newer saved version', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill(); requestJson.mockRejectedValueOnce(new Error('Lost receipt')); await submit();
  const first = putCalls()[0][1].body, body = JSON.parse(first);
  requestJson.mockResolvedValueOnce(fixture([job('job-a', body.milestones, 1), job('job-b')])); await click('Refresh scorecard');
  expect(button('Retry save').disabled).toBe(false); await submit(); expect(putCalls()[1][1].body).toBe(first); expect(savedCallback).toHaveBeenCalledTimes(1);
});

test('evidence-only edits preserve original seconds and milliseconds near a target boundary', async () => {
  const milestones = { signed_at: '2026-09-28T15:00:59.999Z', deposit_received_at: '2026-09-29T11:01:00.000Z', evidence: 'Original' };
  requestJson.mockResolvedValueOnce(fixture([job('job-a', milestones, 1), job('job-b')]));
  await render(); await change('cycle_project', 'job-a'); await change('evidence', 'Added reference'); await submit();
  const saved = JSON.parse(putCalls()[0][1].body).milestones; expect(saved.signed_at).toBe(milestones.signed_at); expect(saved.deposit_received_at).toBe(milestones.deposit_received_at);
});

test('unchanged repeated-DST-hour timestamps are retained rather than reinterpreted by local parsing', async () => {
  const milestones = { signed_at: '2025-11-02T09:30:11.123Z', deposit_received_at: '2025-11-02T10:30:22.234Z', evidence: 'Original' };
  requestJson.mockResolvedValueOnce(fixture([job('job-a', milestones, 1), job('job-b')]));
  await render(); await change('cycle_project', 'job-a'); await change('evidence', 'Reviewed source'); await submit();
  expect(JSON.parse(putCalls()[0][1].body).milestones).toEqual({ ...milestones, evidence: 'Reviewed source' });
});

test('session revocation clears cached drafts and pending responses cannot enter another session', async () => {
  const pending = deferred(); await render(); await change('cycle_project', 'job-a'); await fill(); requestJson.mockReturnValueOnce(pending.promise); await submit();
  const [, options] = putCalls()[0], body = JSON.parse(options.body);
  await act(async () => clearAuthSession()); expect(options.signal.aborted).toBe(true); expect(host.textContent).toContain('Sign in'); expect(field('evidence')).toBeNull();
  await act(async () => setAuthSession({ userId: 'second-user', sessionId: 'second-session', getToken: async () => 'other' })); await change('cycle_project', 'job-a'); expect(field('evidence').value).toBe('');
  await act(async () => pending.resolve(fixture([job('job-a', body.milestones, 1), job('job-b')]))); expect(field('evidence').value).toBe(''); expect(savedCallback).not.toHaveBeenCalled();
});

test('an unavailable initial report offers a read-only retry without inventing zeros', async () => {
  requestJson.mockRejectedValueOnce(new Error('Timing records unavailable')); await render();
  expect(host.textContent).toContain('Timing records unavailable'); expect(host.querySelector('dl')).toBeNull(); expect(host.querySelector('form')).toBeNull();
  await click('Refresh scorecard'); expect(host.querySelector('dl')).not.toBeNull(); expect(putCalls()).toHaveLength(0);
});

test('a pending refresh prevents overlapping writes and pauses old narration until the report is current', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill(); const pending = deferred(); requestJson.mockReturnValueOnce(pending.promise);
  await click('Refresh scorecard'); expect(button('Save milestones').disabled).toBe(true); expect(field('signed_at').closest('fieldset').disabled).toBe(true);
  expect(host.textContent).not.toContain('Company timing is manually recorded, not bank verified.');
  await submit(); expect(putCalls()).toHaveLength(0);
  await act(async () => pending.resolve(fixture())); await submit();
  expect(putCalls()).toHaveLength(1); expect(host.textContent).toContain('Completed in 18 h'); expect(host.textContent).toContain('Milestones recorded.');
});

test('a removed job keeps its unsaved draft accessible for copying after switching to another job', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill();
  requestJson.mockResolvedValueOnce(fixture([job('job-b')])); await click('Refresh scorecard');
  expect(host.querySelector('form')).toBeNull(); expect(host.querySelector('textarea[readonly]').value).toContain('receipt reference');
  expect(host.textContent).toContain('saving is unavailable for this job');
  await change('cycle_project', 'job-b'); expect(field('evidence').value).toBe('');
  await change('cycle_project', 'job-a'); expect(host.querySelector('textarea[readonly]').value).toContain('receipt reference'); expect(putCalls()).toHaveLength(0);
});

test('Use current time preserves the exact repeated-hour instant through an uncertain retry and navigation', async () => {
  const now = '2025-11-02T09:30:11.123Z'; Date.now.mockReturnValue(Date.parse(now));
  await render(); await change('cycle_project', 'job-a'); await click('Use current time'); await change('evidence', 'Agreement just signed');
  requestJson.mockRejectedValueOnce(new Error('Uncertain')); await submit();
  const original = putCalls()[0][1].body; expect(JSON.parse(original).milestones.signed_at).toBe(now);
  await act(async () => root.render(<p>Another page</p>)); await render(); await change('cycle_project', 'job-a'); await submit();
  expect(putCalls()[1][1].body).toBe(original);
});

test('a blank or unchanged form cannot create duplicate versions or activity', async () => {
  await render(); await change('cycle_project', 'job-a'); expect(button('Save milestones').disabled).toBe(true); await submit(); expect(putCalls()).toHaveLength(0);
  await fill(); await submit(); expect(putCalls()).toHaveLength(1); expect(button('Save milestones').disabled).toBe(true); await submit(); expect(putCalls()).toHaveLength(1);
});

test('a failed scorecard refresh does not present its previous narration as current', async () => {
  await render(); requestJson.mockRejectedValueOnce(new Error('Refresh unavailable')); await click('Refresh scorecard');
  expect(host.textContent).toContain('last loaded report remains below'); expect(host.textContent).not.toContain('Company timing is manually recorded, not bank verified.');
});

test('missing secure UUID support preserves the draft and displays an actionable error', async () => {
  await render(); await change('cycle_project', 'job-a'); await fill(); Object.defineProperty(global, 'crypto', { configurable: true, value: undefined }); await submit();
  expect(putCalls()).toHaveLength(0); expect(host.textContent).toContain('Secure request identity is unavailable'); expect(field('evidence').value).toContain('receipt reference');
});
