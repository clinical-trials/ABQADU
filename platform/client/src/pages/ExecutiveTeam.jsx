import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { requestJson } from '../utils/api';
import { getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';
import BriefingAudio from '../components/BriefingAudio';
import CfoCashScenario from '../components/CfoCashScenario';
import PreconstructionScorecard from '../components/PreconstructionScorecard';
import OwnerGoals from '../components/OwnerGoals';
import './ExecutiveTeam.css';

const money = cents => Number.isSafeInteger(cents) ? (cents / 100).toLocaleString('en-US',{style:'currency',currency:'USD'}) : 'Unknown';
const stamp = value => new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Denver',timeZoneName:'short'});
const sections = new Set(['available','partial','unavailable']);
const safeLinks = new Set(['/invoices','/command-center','/command-center#office-tools','/executive#cash-scenario','/bids','/schedule','/risks']);
const dollars = value => value === null || Number.isSafeInteger(value);
const nonnegative = value => dollars(value) && (value===null || value>=0);
const text = value => typeof value === 'string';
const calendarDate = value => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
function checkedReport(data) {
  const error = () => { throw new Error('The financial review could not be verified. Please refresh before using these figures.'); };
  if(!data || data.currency !== 'USD' || !text(data.generated_at) || !Number.isFinite(Date.parse(data.generated_at)) || !calendarDate(data.as_of) || !text(data.narration))error();
  const dateParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(data.generated_at));
  const part=type=>dateParts.find(value=>value.type===type).value;
  if(data.as_of!==`${part('year')}-${part('month')}-${part('day')}`)error();
  if(!data.cash || data.cash.status !== 'unknown' || !text(data.cash.message))error();
  for(const name of ['ledger','jobs']) {
    if(!sections.has(data[name]?.status) || !text(data[name]?.message) || data.sources?.[name]?.status!==data[name].status || !text(data.sources?.[name]?.message))error();
  }
  const ledger=data.ledger,jobs=data.jobs;
  const ledgerMoney=['issued_balance_cents','overdue_balance_cents','draft_total_cents','recorded_payments_cents','known_test_payments_cents'];
  const ledgerCounts=['invoice_count','issued_count','draft_count','needs_review_count','due_date_missing_count'];
  if(!ledgerMoney.every(key=>nonnegative(ledger[key])) || !nonnegative(jobs.bid_total_cents) || !['profit_low_cents','profit_high_cents'].every(key=>dollars(jobs[key])))error();
  if(!['invoice_count','issued_count','draft_count','needs_review_count','due_date_missing_count'].every(key=>ledger[key]===null || Number.isSafeInteger(ledger[key]) && ledger[key]>=0) || !['count','priced_count'].every(key=>jobs[key]===null || Number.isSafeInteger(jobs[key]) && jobs[key]>=0))error();
  if(!Array.isArray(ledger.overdue_invoices) || !ledger.overdue_invoices.every(row=>row && Number.isSafeInteger(row.id) && row.id>0 && text(row.number) && text(row.client) && calendarDate(row.due_date) && Number.isSafeInteger(row.balance_cents) && row.balance_cents>0 && Number.isInteger(row.days_overdue) && row.days_overdue>0))error();
  if(!Array.isArray(ledger.aging) || !ledger.aging.every(row=>row && text(row.id) && text(row.label) && nonnegative(row.balance_cents) && Number.isInteger(row.count) && row.count>=0))error();
  if(!Array.isArray(jobs.items) || !jobs.items.every(row=>row && text(row.id) && text(row.name) && ['estimated','needs_review'].includes(row.status) && ['bid_total_cents','cogs_low_cents','cogs_high_cents'].every(key=>nonnegative(row[key])) && ['profit_low_cents','profit_high_cents'].every(key=>dollars(row[key])) && Array.isArray(row.issues) && row.issues.every(text)))error();
  if(ledger.status==='unavailable' && (![...ledgerMoney,...ledgerCounts].every(key=>ledger[key]===null) || ledger.overdue_invoices.length || ledger.aging.length))error();
  if(jobs.status==='unavailable' && (!['count','priced_count','bid_total_cents','profit_low_cents','profit_high_cents'].every(key=>jobs[key]===null) || jobs.items.length))error();
  for(const name of ['decisions','data_gaps'])if(!Array.isArray(data[name]) || !data[name].every(row=>row && text(row.id) && text(row.title) && text(row.detail) && (row.href==null || safeLinks.has(row.href))))error();
  return data;
}

function FinanceReport({report}) {
  const {ledger,jobs}=report;
  return <>
    <div className="executive-review-top"><div><span className="executive-kicker">Virtual CFO · financial review</span><h2 id="cfo-heading">What needs your attention?</h2><p className="executive-muted">As of {stamp(report.generated_at)} · USD · saved records</p></div><span className="executive-review-tag">Owner review</span></div>
    <div className="executive-metrics">
      <article><span>Available bank cash</span><strong>Not connected</strong><p>{report.cash.message}</p></article>
      <article><span>Issued invoice balances</span><strong>{money(ledger.issued_balance_cents)}</strong><p>{ledger.invoice_count===0?'No invoices recorded in this ledger yet.':'Eligible recorded invoices; excludes drafts and records needing review.'}</p></article>
      <article className={ledger.overdue_balance_cents>0?'executive-metric-alert':''}><span>Past due for review</span><strong>{money(ledger.overdue_balance_cents)}</strong><p>Based on recorded due dates and payment entries.</p></article>
      <article><span>Estimated gross profit</span><strong className="executive-range">{jobs.profit_low_cents===null || jobs.profit_high_cents===null ? 'Unknown' : `${money(jobs.profit_low_cents)} – ${money(jobs.profit_high_cents)}`}</strong><p>{jobs.priced_count??'Unknown'} of {jobs.count??'unknown'} saved jobs priced. Before overhead and tax.</p></article>
    </div>
    {(ledger.status!=='available' || ledger.needs_review_count>0) && <p className="executive-warning" role="status">{ledger.message}{ledger.needs_review_count>0 && ` ${ledger.needs_review_count} invoice records need review.`}</p>}
    {jobs.status!=='available' && <p className="executive-warning" role="status">{jobs.message}</p>}
    <div className="executive-briefing"><BriefingAudio key={report.generated_at} text={report.narration} subject="company"/></div>
    <div className="executive-decisions" aria-label="CFO priorities">
      {report.decisions.map((item,index)=><article key={item.id}><span className="executive-decision-index" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><div><span className="executive-kicker">{item.priority==='high'?'Review first':'Next step'}</span><h3>{item.title}</h3><p>{item.detail}</p>{item.href && <Link to={item.href}>Open review →</Link>}</div></article>)}
      {!report.decisions.length && <p>No review flags were found in the available records. Confirm missing financial inputs before making commitments.</p>}
    </div>
    <div className="executive-detail-grid">
      <details open={ledger.overdue_invoices.length>0}><summary>Collections &amp; invoice evidence</summary>
        <p>{ledger.message}</p>
        <dl className="executive-figures"><div><dt>Recorded non-test payments</dt><dd>{money(ledger.recorded_payments_cents)}</dd></div><div><dt>Known test payments</dt><dd>{money(ledger.known_test_payments_cents)}</dd></div><div><dt>Draft invoice value</dt><dd>{money(ledger.draft_total_cents)}</dd></div></dl>
        <p className="executive-muted">Payment entries are ledger evidence, not a reconciled bank balance. Drafts are not collections.</p>
        {ledger.due_date_missing_count>0 && <p>{ledger.due_date_missing_count} issued invoices have no usable due date.</p>}
        {!!ledger.aging.length && <div className="executive-aging">{ledger.aging.map(bucket=><div key={bucket.id}><span>{bucket.label}</span><b>{money(bucket.balance_cents)}</b><small>{bucket.count} invoices</small></div>)}</div>}
        {!!ledger.overdue_invoices.length && <ul className="executive-invoice-list">{ledger.overdue_invoices.map(row=><li key={row.id}><div><b>{row.number} · {row.client}</b><span>Due {row.due_date} · {row.days_overdue} days past due</span></div><strong>{money(row.balance_cents)}</strong></li>)}</ul>}
        <Link className="executive-action" to="/invoices">Review invoices &amp; payments →</Link>
      </details>
      <details><summary>Job pricing &amp; estimated margins</summary><p>{jobs.message}</p>
        <p className="executive-muted">Saved bid value: {money(jobs.bid_total_cents)}. This is an estimate pipeline, not booked revenue or cash.</p>
        <div className="executive-job-list">{jobs.items.map(job=><article key={job.id}><h3>{job.name}</h3><span className="executive-kicker">{job.status==='estimated'?'Estimate recorded':'Inputs need review'}</span><dl className="executive-figures"><div><dt>Bid</dt><dd>{money(job.bid_total_cents)}</dd></div><div><dt>Cost range</dt><dd>{money(job.cogs_low_cents)} – {money(job.cogs_high_cents)}</dd></div><div><dt>Gross profit range</dt><dd>{money(job.profit_low_cents)} – {money(job.profit_high_cents)}</dd></div></dl>{!!job.issues.length && <ul>{job.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}</article>)}</div>
        <Link className="executive-action" to="/command-center">Review saved job estimates →</Link>
      </details>
    </div>
    <details className="executive-evidence"><summary>What the CFO still needs · {report.data_gaps.length} checks</summary><ul>{report.data_gaps.map(item=><li key={item.id}><b>{item.title}</b><p>{item.detail}</p>{item.href && <Link to={item.href}>Review this input →</Link>}</li>)}</ul><p className="executive-muted">Job source: {report.sources.jobs.message}<br/>Ledger source: {report.sources.ledger.message}</p></details>
  </>;
}

export default function ExecutiveTeam() {
  const [owner]=useState(getAuthSession);
  useSyncExternalStore(subscribeAuthSession,getAuthSession);
  const authorized=isAuthSessionCurrent(owner);
  const [report,setReport]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  const cfo=useRef(null);
  const refreshAfterMilestone=useCallback(()=>setRefresh(value=>value+1),[]);
  useEffect(()=>{
    const controller=new AbortController();
    setReport(null);setError('');setLoading(true);
    if(!authorized)return()=>controller.abort();
    requestJson('/api/executive/cfo/briefing',{signal:controller.signal,authSession:owner}).then(value=>{
      if(!controller.signal.aborted && isAuthSessionCurrent(owner))setReport(checkedReport(value));
    }).catch(err=>{if(!controller.signal.aborted && isAuthSessionCurrent(owner))setError(err.message);}).finally(()=>{if(!controller.signal.aborted && isAuthSessionCurrent(owner))setLoading(false);});
    return()=>controller.abort();
  },[owner,authorized,refresh]);
  if(!authorized)return null;
  return <main className="executive-desk">
    <header className="executive-hero"><div><span className="executive-kicker">ABQ ADU · company view</span><h1>Your executive desk.</h1><p>Cash, jobs, and the decisions that need you.</p></div><div className="executive-owner"><b>You set the direction.</b><p>These advisory roles surface recorded evidence and next steps for your review.</p></div></header>
    <nav className="executive-team" aria-label="Virtual executive team">
      <a className="executive-role executive-role-current" href="#cfo" onClick={()=>cfo.current?.focus()}><span>CFO</span><div><b>Finance</b><p>Cash planning · collections · margins</p><small>Financial review available</small></div></a>
      <Link className="executive-role" to="/command-center#project-helper"><span>COO</span><div><b>Operations</b><p>Schedule · weather · crew priorities</p><small>Open project tools →</small></div></Link>
      <Link className="executive-role" to="/bids"><span>Sales</span><div><b>Growth</b><p>Customer estimates · bid review</p><small>Open estimate tools →</small></div></Link>
    </nav>
    <OwnerGoals/>
    <PreconstructionScorecard onSaved={refreshAfterMilestone}/>
    <section className="executive-finance" id="cfo" aria-label="CFO financial review" ref={cfo} tabIndex={-1}>
      <div className="executive-refresh"><span className="executive-muted">Review the company’s saved financial picture.</span><button disabled={loading} onClick={()=>setRefresh(value=>value+1)}>{loading?'Reading financial records…':'Refresh financial review'}</button></div>
      {loading && <p role="status">Checking invoice balances, job estimates and missing financial inputs…</p>}
      {error && <div className="executive-warning" role="alert"><h2>Financial review unavailable</h2><p>{error}</p><p>Refresh to retrieve the recorded figures. The cash scenario below works from your own inputs.</p></div>}
      {report && <FinanceReport report={report}/>}
    </section>
    <CfoCashScenario/>
    <footer className="executive-footer"><b>A practical weekly rhythm</b><p>Beat last week’s contract-to-deposit time → review collections → check job costs → test cash timing → choose the next action. The owner confirms commitments. Operations and sales currently open their existing tools; dedicated company-wide agents are future work.</p></footer>
  </main>;
}
