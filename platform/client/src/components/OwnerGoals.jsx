import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { requestJson } from '../utils/api';
import { getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';
import './OwnerGoals.css';

const API = '/api/executive/owner-plan';
const kinds = { annual_income: 'Annual goal', debt_payoff: 'Debt payoff', property: 'Future land', home: 'Future home' };
const bases = { revenue: 'Annual revenue target', net_profit: 'Annual net profit target', personal_income: 'Annual personal income target', unconfirmed: 'Annual financial target' };
const statuses = { planned: 'Planned', in_progress: 'In progress', complete: 'Marked complete' };
const money = cents => `$${Math.floor(cents / 100).toLocaleString('en-US')}${cents % 100 ? `.${String(cents % 100).padStart(2, '0')}` : ''}`;
const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const calendarDate = value => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const nullableDate = value => value === null || calendarDate(value);
const amount = value => value === null || (Number.isSafeInteger(value) && value >= 0);
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim())) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

function checkedPlan(plan) {
  const invalid = () => { throw new Error('Invalid owner plan'); };
  if (!plan || Array.isArray(plan) || plan.version !== 1 || plan.currency !== 'USD'
    || typeof plan.updated_at !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(plan.updated_at)
    || !Number.isFinite(Date.parse(plan.updated_at)) || new Date(plan.updated_at).toISOString() !== plan.updated_at
    || !text(plan.vision, 2000) || !Array.isArray(plan.goals) || plan.goals.length > 20
    || !Array.isArray(plan.weekly_review) || plan.weekly_review.length > 20 || !plan.weekly_review.every(item => text(item, 500, true))
    || !text(plan.plan_text, 200000, true)) invalid();
  const ids = new Set();
  for (const goal of plan.goals) {
    if (!goal || Array.isArray(goal) || typeof goal.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(goal.id) || ids.has(goal.id)
      || !Object.hasOwn(kinds, goal.kind) || !text(goal.title, 160, true) || /[\u0000-\u001f\u007f]/.test(goal.title) || !amount(goal.target_amount_cents) || !amount(goal.reported_balance_cents)
      || !nullableDate(goal.reported_balance_as_of) || !nullableDate(goal.target_date) || !Object.hasOwn(bases, goal.basis) || !Object.hasOwn(statuses, goal.status)
      || !text(goal.next_step, 1000) || !text(goal.notes, 2000)
      || (goal.kind !== 'annual_income' && goal.basis !== 'unconfirmed')
      || (goal.kind !== 'debt_payoff' && (goal.reported_balance_cents !== null || goal.reported_balance_as_of !== null))
      || (goal.reported_balance_cents === null && goal.reported_balance_as_of !== null)) invalid();
    ids.add(goal.id);
  }
  return plan;
}

function GoalCard({ goal, index }) {
  const id = useId();
  const annual = goal.kind === 'annual_income', debt = goal.kind === 'debt_payoff';
  const targetLabel = annual ? bases[goal.basis] : debt ? goal.target_amount_cents === 0 ? 'Payoff goal' : 'Remaining debt goal' : 'Planned budget';
  return <article className={`owner-goals__card owner-goals__card--${goal.kind}`} data-goal-kind={goal.kind} aria-labelledby={`${id}-title`}>
    <div className="owner-goals__card-top"><p className="owner-goals__category"><span aria-hidden="true">{String(index + 1).padStart(2, '0')} / </span>{kinds[goal.kind]}</p><span className="owner-goals__status">{statuses[goal.status]}</span></div>
    <h3 id={`${id}-title`}>{goal.title}</h3>
    <dl className="owner-goals__numbers"><div><dt>{targetLabel}</dt><dd>{goal.target_amount_cents === null ? annual || debt ? 'Target to plan' : 'Budget to plan' : money(goal.target_amount_cents)}{debt && goal.target_amount_cents === 0 && <span className="owner-goals__amount-note">debt remaining as the goal</span>}</dd></div>
      {debt && <div className="owner-goals__reported"><dt>Reported balance</dt><dd>{goal.reported_balance_cents === null ? 'Balance to confirm' : money(goal.reported_balance_cents)}</dd></div>}
    </dl>
    {annual && goal.basis === 'unconfirmed' && <p className="owner-goals__basis"><strong>Basis to confirm.</strong> Choose revenue, net profit or personal income. This target does not assume which one you mean.</p>}
    {debt && <p className="owner-goals__muted">Owner-reported; not bank verified. {goal.reported_balance_as_of ? <>As of <time dateTime={goal.reported_balance_as_of}>{dateLabel(goal.reported_balance_as_of)}</time>.</> : 'Balance date to confirm.'} The payoff goal is separate from the reported balance.</p>}
    <p className="owner-goals__date"><span>Target date</span>{goal.target_date ? <time dateTime={goal.target_date}>{dateLabel(goal.target_date)}</time> : 'Date to plan'}</p>
    <div className="owner-goals__next"><h4>Next step</h4><p>{goal.next_step || 'Choose the next step at your review.'}</p></div>
    {goal.notes && <p className="owner-goals__notes">{goal.notes}</p>}
  </article>;
}

function GoalsForSession({ owner }) {
  const id = useId(), mounted = useRef(false), pending = useRef(null), generation = useRef(0), downloadUrl = useRef(null), section = useRef(null), shown = useRef(false);
  const [plan, setPlan] = useState(null), [loading, setLoading] = useState(true), [hidden, setHidden] = useState(false), [error, setError] = useState(''), [downloadError, setDownloadError] = useState('');
  const revokeDownload = useCallback(() => { if (downloadUrl.current) { URL.revokeObjectURL(downloadUrl.current); downloadUrl.current = null; } }, []);
  const load = useCallback(async () => {
    if (!isAuthSessionCurrent(owner)) return;
    pending.current?.abort(); revokeDownload(); const controller = new AbortController(), revision = ++generation.current; pending.current = controller;
    setPlan(null); setLoading(true); setHidden(false); setError(''); setDownloadError('');
    const current = () => mounted.current && !controller.signal.aborted && generation.current === revision && isAuthSessionCurrent(owner);
    try {
      const response = await requestJson(API, { method: 'GET', signal: controller.signal, authSession: owner });
      if (!current()) return;
      setPlan(checkedPlan(response));
    } catch (failure) {
      if (current()) {
        if (failure.status === 404 || failure.status === 403) setHidden(true);
        else setError('Your owner plan is unavailable right now. Try loading it again.');
      }
    } finally { if (pending.current === controller) pending.current = null; if (current()) setLoading(false); }
  }, [owner, revokeDownload]);
  useEffect(() => {
    mounted.current = true; load();
    return () => { mounted.current = false; generation.current += 1; pending.current?.abort(); revokeDownload(); };
  }, [load, revokeDownload]);
  useEffect(() => {
    if (!plan || loading || shown.current) return;
    shown.current = true;
    if (window.location.hash === '#owner-plan') section.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [plan, loading]);
  function download() {
    if (!plan || loading || !mounted.current || !isAuthSessionCurrent(owner)) return;
    revokeDownload(); setDownloadError('');
    let anchor;
    try {
      const url = URL.createObjectURL(new Blob([plan.plan_text], { type: 'text/plain;charset=utf-8' })); downloadUrl.current = url;
      anchor = document.createElement('a'); anchor.href = url; anchor.download = 'future-business-plan.txt'; document.body.appendChild(anchor); anchor.click();
    } catch (_) { revokeDownload(); setDownloadError('Could not prepare the download. You can still read and copy the business plan below.'); }
    finally { anchor?.remove(); }
  }
  if (hidden) return null;
  if (loading) return <p className="owner-goals__loading" role="status">Loading owner plan…</p>;
  return <section ref={section} className="owner-goals" id="owner-plan" aria-labelledby={`${id}-heading`}>
    <header className="owner-goals__heading"><div><p className="owner-goals__eyebrow">Owner’s horizon</p><h2 id={`${id}-heading`}>What we’re building toward.</h2></div><span className="owner-goals__private">Private owner plan</span></header>
    {error && <><p className="owner-goals__error" role="alert">{error}</p><button type="button" onClick={load}>Try again</button></>}
    {plan && <>
      {plan.vision && <p className="owner-goals__vision">{plan.vision}</p>}
      <p className="owner-goals__boundary">Planning intentions and owner-reported figures. These cards do not calculate current earnings, confirm balances or change financial records.</p>
      <div className="owner-goals__cards">{plan.goals.map((goal, index) => <GoalCard key={goal.id} goal={goal} index={index} />)}</div>
      {!plan.goals.length && <p className="owner-goals__empty">No goals have been added to this plan yet.</p>}
      <div className="owner-goals__review"><div><p className="owner-goals__eyebrow">A little time each week</p><h3>Weekly review</h3><p>Read-only review prompts. Keep the next decision in sight.</p></div>{plan.weekly_review.length ? <ul>{plan.weekly_review.map((prompt, index) => <li key={index}><span aria-hidden="true" className="owner-goals__check">□</span><span>{prompt}</span></li>)}</ul> : <p>Review prompts are still to plan.</p>}</div>
      <details className="owner-goals__business-plan"><summary>Future business plan</summary><div className="owner-goals__plan-text">{plan.plan_text}</div></details>
      <footer className="owner-goals__footer"><p>Plan updated <time dateTime={plan.updated_at}>{new Date(plan.updated_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</time>.</p><div className="owner-goals__actions"><button type="button" onClick={download}>Download business plan</button><button type="button" className="owner-goals__secondary" onClick={load}>Refresh owner plan</button></div></footer>
      {downloadError && <p role="alert" className="owner-goals__error">{downloadError}</p>}
    </>}
  </section>;
}

export default function OwnerGoals() {
  const owner = useSyncExternalStore(subscribeAuthSession, getAuthSession);
  if (!owner.userId) return null;
  return <GoalsForSession key={owner.epoch} owner={owner} />;
}
