import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { requestJson } from '../utils/api';
import { getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';
import BriefingAudio from './BriefingAudio';
import './PreconstructionScorecard.css';

const API = '/api/executive/preconstruction-cycle';
const drafts = new Map();
subscribeAuthSession(() => drafts.clear());
const HOUR = 3600000;
const round = value => Math.round(value * 100) / 100;
const hoursLabel = value => value === null ? 'Not available' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} h`;
const isInstant = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const sameMilestones = (a, b) => ['signed_at', 'deposit_received_at'].every(key => a[key] === b[key] || (a[key] && b[key] && Date.parse(a[key]) === Date.parse(b[key]))) && a.evidence === b.evidence;
const dateLabel = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekLabel = week => `${dateLabel(week.start)}–${dateLabel(new Date(Date.parse(`${week.end}T00:00:00Z`) - 86400000).toISOString().slice(0, 10))}`;

function checkedReport(report) {
  const invalid = () => { throw new Error('The milestone report could not be verified. Your draft is still available; reload or retry.'); };
  if (!report || !isInstant(report.generated_at) || report.time_zone !== 'America/Denver'
    || report.target?.deposit_cents !== 1000000 || report.target?.goal_hours !== 20 || report.target?.stretch_hours !== 15
    || !Array.isArray(report.projects) || !Array.isArray(report.weeks) || report.weeks.length !== 8 || typeof report.narration !== 'string') invalid();
  const ids = new Set();
  for (const project of report.projects) {
    const m = project?.milestones;
    if (!project || typeof project.id !== 'string' || !project.id || ids.has(project.id) || typeof project.name !== 'string'
      || !Number.isSafeInteger(project.version) || project.version < 0 || !m || typeof m.evidence !== 'string' || m.evidence.length > 500
      || ![m.signed_at, m.deposit_received_at].every(value => value === null || isInstant(value))
      || (m.deposit_received_at && !m.signed_at) || ((m.signed_at || m.deposit_received_at) && !m.evidence.trim())) invalid();
    ids.add(project.id);
    const start = m.signed_at === null ? null : Date.parse(m.signed_at), end = m.deposit_received_at === null ? null : Date.parse(m.deposit_received_at);
    if ((start !== null && start > Date.parse(report.generated_at)) || (end !== null && (end < start || end > Date.parse(report.generated_at)))) invalid();
    const status = end !== null ? 'complete' : start !== null ? 'awaiting_deposit' : 'not_started';
    const duration = start === null ? null : ((end ?? Date.parse(report.generated_at)) - start) / HOUR;
    const target = status !== 'complete' ? null : duration <= 15 ? 'stretch' : duration <= 20 ? 'on_target' : 'over_target';
    if (project.status !== status || project.target_status !== target || (duration === null ? project.hours !== null : !Number.isFinite(project.hours) || Math.abs(project.hours - round(duration)) > .011)) invalid();
  }
  for (let index = 0; index < report.weeks.length; index += 1) {
    const week = report.weeks[index];
    if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week.start) || !/^\d{4}-\d{2}-\d{2}$/.test(week.end)
      || Date.parse(week.end) - Date.parse(week.start) !== 7 * 86400000
      || !Number.isSafeInteger(week.count) || week.count < 0 || !Number.isSafeInteger(week.within_target_count) || week.within_target_count < 0 || week.within_target_count > week.count
      || (index > 0 && week.end !== report.weeks[index - 1].start)) invalid();
    if (week.count === 0) {
      if (week.median_hours !== null || week.fastest_hours !== null || week.within_target_pct !== null) invalid();
    } else if (![week.median_hours, week.fastest_hours, week.within_target_pct].every(value => Number.isFinite(value) && value >= 0)
      || week.fastest_hours > week.median_hours || Math.abs(week.within_target_pct - Math.round(week.within_target_count / week.count * 1000) / 10) > .01) invalid();
  }
  const fields = ['start', 'end', 'count', 'median_hours', 'fastest_hours', 'within_target_count', 'within_target_pct'];
  if (fields.some(key => report.current_week?.[key] !== report.weeks[0][key] || report.previous_week?.[key] !== report.weeks[1][key])) invalid();
  const improvement = report.current_week.count && report.previous_week.count ? round(report.previous_week.median_hours - report.current_week.median_hours) : null;
  if (improvement === null ? report.improvement_hours !== null : !Number.isFinite(report.improvement_hours) || Math.abs(report.improvement_hours - improvement) > .011) invalid();
  return report;
}

function localValue(instant) {
  if (!instant) return '';
  const date = new Date(instant), pad = (value, length = 2) => String(value).padStart(length, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
function utcValue(value) {
  if (!value) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!parts) throw new Error('Enter a valid date and time.');
  const [, year, month, day, hour, minute, second = '0', fraction = '0'] = parts;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(fraction.padEnd(3, '0')));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)
    || date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute) || date.getSeconds() !== Number(second)) throw new Error('That local date or time does not exist. Check the date and daylight-saving time.');
  return date.toISOString();
}
const formOf = project => ({ signed_at: localValue(project.milestones.signed_at), deposit_received_at: localValue(project.milestones.deposit_received_at), evidence: project.milestones.evidence });
function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure request identity is unavailable. Open the workspace over HTTPS before saving.');
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function MilestoneEditor({ project, owner, onReport, onReload, onBusy, onSaved, loading }) {
  const id = useId(), cacheKey = `${owner.epoch}:${project.id}`;
  const initial = useRef(drafts.get(cacheKey));
  const [base, setBase] = useState(initial.current?.base || project);
  const [form, setForm] = useState(initial.current?.form || formOf(project));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(''), [conflict, setConflict] = useState(false);
  const attempt = useRef(initial.current?.attempt || null), pending = useRef(null), mounted = useRef(false), instants = useRef(initial.current?.instants || {});
  const baseRef = useRef(base), formRef = useRef(form);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device time zone';
  const changed = JSON.stringify(form) !== JSON.stringify(formOf(base));
  const sourceChanged = project.version !== base.version || !sameMilestones(project.milestones, base.milestones);
  const cache = () => {
    if (!isAuthSessionCurrent(owner)) return;
    if (attempt.current || JSON.stringify(formRef.current) !== JSON.stringify(formOf(baseRef.current))) drafts.set(cacheKey, { base: baseRef.current, form: formRef.current, attempt: attempt.current, instants: instants.current });
    else drafts.delete(cacheKey);
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); onBusy(false); };
  }, [onBusy]);
  useEffect(() => {
    if (!sourceChanged || changed || attempt.current || pending.current) return;
    baseRef.current = project; formRef.current = formOf(project); setBase(project); setForm(formRef.current);
  }, [project, sourceChanged, changed]);
  function edit(name, value, exactInstant) {
    if (pending.current || loading) return;
    instants.current = { ...instants.current, [name]: exactInstant ? { value, instant: exactInstant } : undefined };
    formRef.current = { ...formRef.current, [name]: value }; setForm(formRef.current); setError(''); setSuccess(''); cache();
  }
  async function reload() {
    if (pending.current || loading) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); onBusy(true); setError('');
    try {
      const report = await onReload();
      if (!mounted.current || controller.signal.aborted || !isAuthSessionCurrent(owner)) return;
      const next = report?.projects.find(item => item.id === project.id);
      if (!next) throw new Error('This job is no longer available. Your draft is still here.');
      attempt.current = null; instants.current = {}; drafts.delete(cacheKey); baseRef.current = next; formRef.current = formOf(next);
      setBase(next); setForm(formRef.current); setConflict(false); setSuccess('Loaded the current saved milestones.');
    } catch (failure) { if (mounted.current && isAuthSessionCurrent(owner)) setError(failure.message || 'Reload failed. Your draft is still here.'); }
    finally { if (pending.current === controller) pending.current = null; if (mounted.current && isAuthSessionCurrent(owner)) { setBusy(false); onBusy(false); } }
  }
  async function save(event) {
    event.preventDefault();
    if (pending.current || loading || (!changed && !attempt.current) || !isAuthSessionCurrent(owner)) return;
    let milestones;
    try {
      // Preserve the original instant when only evidence changes, including the second occurrence of a DST hour.
      const original = formOf(base);
      const instant = key => instants.current[key]?.value === form[key] ? instants.current[key].instant : form[key] === original[key] ? base.milestones[key] : utcValue(form[key]);
      milestones = { signed_at: instant('signed_at'), deposit_received_at: instant('deposit_received_at'), evidence: form.evidence.trim() };
      if (milestones.deposit_received_at && !milestones.signed_at) throw new Error('Record the signed-contract time before the deposit-received time.');
      if ((milestones.signed_at || milestones.deposit_received_at) && !milestones.evidence) throw new Error('Add evidence for these manually recorded dates.');
      if (milestones.evidence.length > 500) throw new Error('Keep evidence to 500 characters or fewer.');
      if ([milestones.signed_at, milestones.deposit_received_at].some(value => value && Date.parse(value) > Date.now())) throw new Error('Milestone times cannot be in the future.');
      if (milestones.deposit_received_at && Date.parse(milestones.deposit_received_at) < Date.parse(milestones.signed_at)) throw new Error('Deposit receipt must be at or after the contract was signed.');
    } catch (failure) { setError(failure.message); setSuccess(''); return; }
    const intent = { expected_version: base.version, milestones }, signature = JSON.stringify(intent);
    const retry = attempt.current?.signature === signature;
    if (conflict || (sourceChanged && !retry)) { setError('Saved milestones changed. Copy your draft, then load the current record before making a new change.'); return; }
    if (!retry) {
      try { attempt.current = { signature, body: { request_id: requestId(), ...intent } }; }
      catch (failure) { setError(failure.message); return; }
    }
    cache();
    const controller = new AbortController(); pending.current = controller; setBusy(true); onBusy(true); setError(''); setSuccess('');
    const current = () => mounted.current && !controller.signal.aborted && isAuthSessionCurrent(owner);
    try {
      const report = checkedReport(await requestJson(`${API}/projects/${encodeURIComponent(project.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.current.body), signal: controller.signal, authSession: owner }));
      if (!current()) return;
      const saved = report.projects.find(item => item.id === project.id);
      if (!saved || saved.version <= intent.expected_version) throw new Error('The save receipt did not confirm a new version. Your draft is still here; retry to check the same request.');
      if (!sameMilestones(saved.milestones, milestones)) {
        onReport(report); setConflict(true); setError('A newer saved record has different milestones. Your draft is preserved below; copy it before loading the current record.'); return;
      }
      attempt.current = null; instants.current = {}; drafts.delete(cacheKey); baseRef.current = saved; formRef.current = formOf(saved); setBase(saved); setForm(formRef.current); setConflict(false);
      onReport(report); setSuccess('Milestones recorded. This does not sign a contract or post a payment.');
      if (onSaved) { try { onSaved(); } catch (_) { /* The accepted save is independent of another panel refreshing. */ } }
    } catch (failure) {
      if (current()) { if (failure.status === 409) setConflict(true); setError(failure.status === 409 ? 'Saved milestones changed. Your draft is preserved; copy it before loading the current record.' : failure.message || 'Save could not be confirmed. Your draft is still here; retry the same request.'); }
    } finally { if (pending.current === controller) pending.current = null; if (current()) { setBusy(false); onBusy(false); } }
  }
  const recovery = `Job: ${project.name}\nTimes: ${zone} (device local)\nSigned contract: ${form.signed_at || 'Not recorded'}\nFull $10,000 received: ${form.deposit_received_at || 'Not recorded'}\nEvidence: ${form.evidence}`;
  return <form className="precon-cycle__editor" aria-label="Record preconstruction milestones" onSubmit={save} noValidate>
    <h3>Record milestones for {project.name}</h3>
    <p id={`${id}-zone`} className="precon-cycle__muted">Enter times in <strong>{zone}</strong> (your device’s local time). Company weeks use America/Denver. During a repeated daylight-saving hour, the earlier occurrence is used.</p>
    <p className="precon-cycle__status">{project.status === 'complete' ? `Completed in ${hoursLabel(project.hours)} · ${project.target_status === 'stretch' ? 'Stretch achieved' : project.target_status === 'on_target' ? 'Within 20-hour target' : 'Over 20-hour target'}` : project.status === 'awaiting_deposit' ? `Awaiting the full deposit · ${hoursLabel(project.hours)} elapsed at last update` : 'No signed-contract time recorded.'}</p>
    <fieldset disabled={busy || loading || conflict || (sourceChanged && !attempt.current)}>
      <legend className="precon-cycle__sr-only">Milestone dates and evidence</legend>
      <div className="precon-cycle__date-fields">
        {[['signed_at', 'Contract signed at'], ['deposit_received_at', 'Full $10,000 deposit received at']].map(([name, label]) => <div key={name} className="precon-cycle__field">
          <label htmlFor={`${id}-${name}`}>{label}</label>
          <input id={`${id}-${name}`} name={name} type="datetime-local" step="0.001" value={form[name]} aria-describedby={`${id}-zone${name === 'deposit_received_at' ? ` ${id}-deposit-help` : ''}`} onChange={event => edit(name, event.target.value)} />
          <button type="button" className="precon-cycle__secondary" onClick={() => { const now = new Date(Date.now()).toISOString(); edit(name, localValue(now), now); }}>Use current time <span className="precon-cycle__sr-only">for {label.toLowerCase()}</span></button>
        </div>)}
      </div>
      <p id={`${id}-deposit-help`} className="precon-cycle__muted">Record receipt only after the full $10,000 has actually been received. An invoice, payment request or partial receipt is not this milestone. Leave unknown times blank.</p>
      <label htmlFor={`${id}-evidence`}>Evidence / source of these dates</label>
      <textarea id={`${id}-evidence`} name="evidence" rows={3} maxLength={500} value={form.evidence} placeholder="Reference the signed agreement and receipt confirmation; avoid bank account details." onChange={event => edit('evidence', event.target.value)} />
      <p className="precon-cycle__muted">Required when a date is recorded · {form.evidence.length}/500 characters. Dates are saved only when you choose Save milestones.</p>
      <p className="precon-cycle__muted">Recording dates here does not sign a contract, post a payment to the ledger or confirm a bank balance.</p>
    </fieldset>
    {(sourceChanged || conflict) && <p role="status" className="precon-cycle__notice">The saved record changed. Your unsaved entries are preserved. {attempt.current && !conflict ? 'You can retry the original request to check its outcome.' : 'Load the current record before making a new change.'}</p>}
    {(changed || attempt.current || conflict) && <details className="precon-cycle__recovery"><summary>Review or copy this draft before reloading</summary><label htmlFor={`${id}-recovery`}>Your unsaved milestone draft</label><textarea id={`${id}-recovery`} readOnly rows={6} value={recovery} onFocus={event => event.target.select()} /></details>}
    <div className="precon-cycle__actions">
      <button type="submit" disabled={busy || loading || conflict || (!changed && !attempt.current) || (sourceChanged && !attempt.current)}>{busy ? 'Working…' : attempt.current ? 'Retry save / check receipt' : 'Save milestones'}</button>
      <button type="button" className="precon-cycle__secondary" disabled={busy || loading} onClick={reload}>{changed || attempt.current || conflict ? 'Discard this draft and load saved' : 'Load current saved record'}</button>
    </div>
    {error && <p role="alert" className="precon-cycle__error">{error}</p>}
    {success && <p role="status" className="precon-cycle__success">{success}</p>}
  </form>;
}

function ScorecardForSession({ owner, onSaved }) {
  const id = useId();
  const [report, setReport] = useState(null), [selected, setSelected] = useState(''), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const pending = useRef(null), mounted = useRef(false), generation = useRef(0);
  const load = useCallback(async () => {
    pending.current?.abort(); const controller = new AbortController(), revision = ++generation.current; pending.current = controller;
    setLoading(true); setError('');
    const current = () => mounted.current && !controller.signal.aborted && generation.current === revision && isAuthSessionCurrent(owner);
    try {
      const next = checkedReport(await requestJson(API, { signal: controller.signal, authSession: owner }));
      if (!current()) return null;
      setReport(next); return next;
    } catch (failure) { if (current()) { setError(failure.message || 'The scorecard is unavailable. Try loading it again.'); throw failure; } return null; }
    finally { if (pending.current === controller) pending.current = null; if (current()) setLoading(false); }
  }, [owner]);
  useEffect(() => { mounted.current = true; load().catch(() => {}); return () => { mounted.current = false; generation.current += 1; pending.current?.abort(); }; }, [load]);
  const chosen = report?.projects.find(item => item.id === selected);
  const missingDrafts = report ? [...drafts.entries()].filter(([key, draft]) => key.startsWith(`${owner.epoch}:`) && !report.projects.some(project => project.id === draft.base.id)).map(([, draft]) => draft) : [];
  const missing = !chosen && missingDrafts.find(draft => draft.base.id === selected);
  const awaiting = report?.projects.filter(project => project.status === 'awaiting_deposit') || [];
  const overdue = awaiting.filter(project => (Date.parse(report.generated_at) - Date.parse(project.milestones.signed_at)) / HOUR > 20);
  const improvement = report?.improvement_hours;
  return <section className="precon-cycle" id="preconstruction-cycle" aria-labelledby={`${id}-heading`}>
    <header className="precon-cycle__heading"><div><p className="precon-cycle__eyebrow">Company pace · Preconstruction</p><h2 id={`${id}-heading`}>Contract to $10k</h2></div><div className="precon-cycle__targets"><span>Target ≤ 20 elapsed hours</span><span>Stretch ≤ 15 hours</span></div></header>
    <p className="precon-cycle__intro">From signed contract to the full $10,000 deposit received. Compare our company’s weekly pace and improve on our own record.</p>
    <p className="precon-cycle__muted">Manually recorded milestones · not bank verified.</p>
    <button type="button" className="precon-cycle__secondary" disabled={loading || saving} onClick={() => load().catch(() => {})}>{loading ? 'Loading scorecard…' : 'Refresh scorecard'}</button>
    {error && <p role="alert" className="precon-cycle__error">{error}{report ? ' The last loaded report remains below.' : ''}</p>}
    {report && <>
      <dl className="precon-cycle__stats">
        <div><dt>This week · to date</dt><dd>{report.current_week.count ? hoursLabel(report.current_week.median_hours) : 'No completions'}</dd><p>Median · {report.current_week.count} completed · {weekLabel(report.current_week)}</p></div>
        <div><dt>Previous full week</dt><dd>{report.previous_week.count ? hoursLabel(report.previous_week.median_hours) : 'No completions'}</dd><p>Median · {report.previous_week.count} completed · {weekLabel(report.previous_week)}</p></div>
        <div><dt>Week-to-week change</dt><dd>{improvement === null ? 'Not available' : improvement === 0 ? 'Same median' : `${hoursLabel(Math.abs(improvement))} ${improvement > 0 ? 'faster' : 'slower'}`}</dd><p>{improvement === null ? 'Both weeks need a completed cycle.' : 'Current week to date vs. previous full week.'}</p></div>
        <div><dt>Within 20 hours · this week</dt><dd>{report.current_week.within_target_pct === null ? 'Not available' : `${report.current_week.within_target_pct}%`}</dd><p>{report.current_week.within_target_count} of {report.current_week.count} completions · fastest {hoursLabel(report.current_week.fastest_hours)}</p></div>
      </dl>
      <div className={`precon-cycle__open${overdue.length ? ' precon-cycle__open--late' : ''}`}><strong>{awaiting.length} open {awaiting.length === 1 ? 'cycle' : 'cycles'} awaiting the full deposit</strong><span>{overdue.length} past 20 hours · {report.projects.filter(project => project.status === 'not_started').length} jobs without a signed-contract time</span></div>
      <p className="precon-cycle__muted">Completion weeks follow the full-deposit receipt date, Monday–Sunday in America/Denver. Open cycles stay out of completion medians. Updated <time dateTime={report.generated_at}>{new Date(report.generated_at).toLocaleString('en-US', { timeZone: 'America/Denver', timeZoneName: 'short' })}</time>; open elapsed times reflect that update.</p>
      <details className="precon-cycle__history"><summary>Compare the last 8 company weeks</summary><div className="precon-cycle__table-scroll" role="region" aria-label="Company weekly completion history" tabIndex={0}><table><caption>Company completion pace · hours, not employee rankings</caption><thead><tr><th scope="col">Receipt week</th><th scope="col">Completed</th><th scope="col">Median</th><th scope="col">Fastest</th><th scope="col">Within 20 h</th></tr></thead><tbody>{report.weeks.map((week, index) => <tr key={week.start}><th scope="row">{weekLabel(week)}{index === 0 ? ' · to date' : ''}</th><td>{week.count}</td><td>{hoursLabel(week.median_hours)}</td><td>{hoursLabel(week.fastest_hours)}</td><td>{week.within_target_pct === null ? 'Not available' : `${week.within_target_pct}% (${week.within_target_count}/${week.count})`}</td></tr>)}</tbody></table></div></details>
      {!loading && !error && report.narration && <BriefingAudio text={report.narration} subject="company preconstruction scorecard" />}
      <div className="precon-cycle__job"><label htmlFor={`${id}-project`}>Choose a saved job to record milestones</label><select id={`${id}-project`} name="cycle_project" value={selected} disabled={saving || loading} onChange={event => setSelected(event.target.value)}><option value="">Select a job</option>{report.projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}{missingDrafts.map(draft => <option key={draft.base.id} value={draft.base.id}>{draft.base.name} · removed job, draft only</option>)}</select></div>
      {!report.projects.length && <p>No saved jobs yet. <Link to="/command-center">Open the saved workspace</Link> to add a job.</p>}
      {chosen && <MilestoneEditor key={chosen.id} project={chosen} owner={owner} onReport={setReport} onReload={load} onBusy={setSaving} onSaved={onSaved} loading={loading} />}
      {selected && !chosen && <p role="status">The selected job is no longer in this report. {missing ? 'Copy its unsaved draft below for review; saving is unavailable for this job.' : 'Choose another saved job.'}</p>}
      {missing && <div className="precon-cycle__recovery"><label htmlFor={`${id}-missing-draft`}>Unsaved draft for removed job: {missing.base.name}</label><textarea id={`${id}-missing-draft`} readOnly rows={6} value={`Job: ${missing.base.name}\nTimes: device local (${Intl.DateTimeFormat().resolvedOptions().timeZone})\nSigned contract: ${missing.form.signed_at || 'Not recorded'}\nFull $10,000 received: ${missing.form.deposit_received_at || 'Not recorded'}\nEvidence: ${missing.form.evidence}`} onFocus={event => event.target.select()} /></div>}
    </>}
  </section>;
}

export default function PreconstructionScorecard({ onSaved } = {}) {
  const owner = useSyncExternalStore(subscribeAuthSession, getAuthSession);
  if (!owner.userId) return <section className="precon-cycle" id="preconstruction-cycle"><p>Sign in to view the company preconstruction scorecard.</p></section>;
  return <ScorecardForSession key={owner.epoch} owner={owner} onSaved={onSaved} />;
}
