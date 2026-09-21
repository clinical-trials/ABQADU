import React, { useEffect, useRef, useState } from 'react';
import WeatherAttribution from './WeatherAttribution';
import { requestJson } from '../utils/api';
import './ContractorDesk.css';

const trades = [['concrete', 'Concrete'], ['roofing', 'Roofing'], ['excavation', 'Excavation'], ['general', 'General construction']];
const emptyBid = { title: '', scope: '', due_date: '', contact_name: '', contact_phone: '', trade: 'concrete' };
const dateLabel = (date, options = {}) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...options }).format(new Date(`${date}T12:00:00Z`));
function nextDates() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type).value;
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  return Array.from({ length: 4 }, (_, index) => new Date(date.getTime() + (index + 1) * 86400000).toISOString().slice(0, 10));
}
const phoneNumber = value => /^\+?[\d\s().-]{7,25}$/.test(value || '') ? value.replace(/[^+\d]/g, '') : '';
const smsHref = (phone, body) => `sms:${phoneNumber(phone)}?body=${encodeURIComponent(body || '')}`;

export function FieldIcon({ name, ...props }) {
  const paths = {
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
    rain: <><path d="M6 15a4 4 0 1 1 .7-7.9A6 6 0 0 1 18 8a3.5 3.5 0 0 1 0 7H6Z"/><path d="m8 18-1 3m6-3-1 3m6-3-1 3"/></>,
    cloud: <path d="M6 18a5 5 0 1 1 .8-9.9A6 6 0 0 1 18 10a4 4 0 0 1 0 8H6Z"/>,
    job: <><path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/></>,
    bid: <><path d="M7 3h10v3h3v15H4V6h3V3Z"/><path d="M7 3v5h10V3M8 12h8m-8 4h5"/></>,
    message: <path d="M4 4h16v12H9l-5 4V4Zm4 5h8m-8 3h5"/>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    pause: <><path d="M8 5v14m8-14v14"/></>,
    wind: <path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7a3 3 0 1 1-3 3"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.cloud}</svg>;
}

export default function ContractorDesk({ project, state, forecast, busy, onCheckWeather, runAction, onRefresh }) {
  const [trade, setTrade] = useState('concrete');
  const [showBid, setShowBid] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [bidLimit, setBidLimit] = useState(8);
  const [inboxLimit, setInboxLimit] = useState(12);
  const [holdDay, setHoldDay] = useState(null);
  const [holdNote, setHoldNote] = useState('');
  const [sms, setSms] = useState(null);
  const [now, setNow] = useState(Date.now());
  const formRef = useRef(null);
  const mounted = useRef(true);
  const draft = drafts[project?.id] || emptyBid;
  const setDraft = update => setDrafts(current => ({ ...current, [project.id]: { ...(current[project.id] || emptyBid), ...update } }));
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    requestJson('/api/contractor-desk/status', { signal: controller.signal }).then(value => { if (mounted.current) setSms(value); }).catch(() => {});
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => { mounted.current = false; controller.abort(); clearInterval(timer); };
  }, []);
  useEffect(() => { setHoldDay(null); setNotice(''); }, [project?.id, trade]);
  useEffect(() => { setBidLimit(8); setInboxLimit(12); }, [project?.id]);
  useEffect(() => { if (showBid) formRef.current?.querySelector('input')?.focus(); }, [showBid]);
  useEffect(() => { if (['#messages', '#trade-bids'].includes(window.location.hash)) document.getElementById(window.location.hash.slice(1))?.scrollIntoView?.({ behavior: 'smooth' }); }, [project?.id]);

  const dates = nextDates();
  const fresh = forecast?.days?.length === 4 && (!forecast.expires_at || Date.parse(forecast.expires_at) > now)
    && forecast.days.every((day, index) => day.date === dates[index]);
  const days = fresh ? forecast.days : dates.map(date => ({ date }));
  useEffect(() => { setHoldDay(null); }, [fresh, forecast]);
  const requests = (state?.bid_requests || []).filter(row => row.project_id === project?.id);
  const inbox = (state?.sms_inbox || []).filter(row => !row.project_id || row.project_id === project?.id);
  const today = new Date(Date.parse(`${dates[0]}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const tradeHolds = (state?.weather_holds || []).filter(row => row.project_id === project?.id && row.trade === trade);
  const holds = tradeHolds.filter(row => row.date >= today && row.status === 'Confirmed');
  const holdHistory = tradeHolds.filter(row => row.date < today || row.status !== 'Confirmed');
  const phone = sms?.inbound_configured ? phoneNumber(sms.phone) : '';
  const locked = !project || busy || pending;
  const copy = async text => {
    try { await navigator.clipboard.writeText(text); setNotice('Copied. Review the message before sending.'); }
    catch { setNotice('Copy is unavailable here. Select and copy the message text below.'); }
  };
  const saveBid = async event => {
    event.preventDefault();
    if (locked) return;
    setPending(true); setNotice('');
    const projectId = project.id;
    try {
      const saved = await runAction('/api/contractor-desk/bid-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, project_id: projectId }) });
      if (saved && mounted.current) { setDrafts(current => ({ ...current, [projectId]: emptyBid })); setShowBid(false); setNotice('Bid request saved as a draft. Review it before texting the subcontractor.'); }
    } finally { if (mounted.current) setPending(false); }
  };
  const confirmHold = async () => {
    if (locked || !holdDay || !holdNote.trim() || !fresh) return;
    if (forecast.expires_at && Date.parse(forecast.expires_at) <= Date.now()) { setHoldDay(null); setNotice('Refresh the forecast before confirming this weather decision.'); return; }
    setPending(true);
    try {
      const saved = await runAction('/api/contractor-desk/weather-holds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: project.id, trade, date: holdDay.date, note: holdNote.trim() }) });
      if (saved && mounted.current) { setHoldDay(null); setNotice('Day off recorded. Share the crew note to let the subcontractor know.'); }
    } finally { if (mounted.current) setPending(false); }
  };
  const reviewText = async row => {
    if (locked) return;
    setPending(true);
    try {
      const saved = await runAction(`/api/contractor-desk/sms/${encodeURIComponent(row.id)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: project.id }) });
      if (saved && mounted.current) setNotice('Text reviewed and saved with this job. No price or schedule change was accepted.');
    } finally { if (mounted.current) setPending(false); }
  };
  const cancelHold = async hold => {
    if (locked) return;
    setPending(true);
    try {
      const saved = await runAction(`/api/contractor-desk/weather-holds/${encodeURIComponent(hold.id)}/cancel`, { method: 'POST' });
      if (saved && mounted.current) setNotice('Weather day off removed. Confirm the workday with the crew.');
    } finally { if (mounted.current) setPending(false); }
  };

  return <div className="field-desk">
    <section className="field-hero" aria-labelledby="field-heading">
      <div className="field-hero-copy"><span className="field-eyebrow">ABQ ADU / ON SITE</span><h2 id="field-heading">{project?.client || 'Your next job starts here.'}</h2><p>{project?.next_action || 'Choose a job, line up your trades, and plan around the weather.'}</p>
        <button className="field-button field-button-light" disabled={!project} onClick={() => setShowBid(true)}><FieldIcon name="bid"/>Request a bid</button>
      </div>
      <div className="field-job-stamp"><FieldIcon name="job"/><span>JOB SITE</span><p>{project?.address || 'Add a project in office tools to get started.'}</p><div className="field-job-counts"><span><b>{requests.length}</b> bid requests</span><span><b>{inbox.length}</b> incoming texts</span></div></div>
    </section>
    {notice && <p className="field-notice" role="status">{notice}</p>}

    <section className="field-panel field-weather" aria-labelledby="field-weather-heading">
      <div className="field-section-heading"><div><span className="field-eyebrow">PLAN THE NEXT FOUR DAYS</span><h2 id="field-weather-heading">Weather &amp; your crew</h2><p>{fresh ? forecast.location : 'Albuquerque, New Mexico'} · {dateLabel(days[0].date, { weekday: undefined })}–{dateLabel(days[3].date, { weekday: undefined })}</p></div><button className="field-button field-button-outline" disabled={locked} onClick={onCheckWeather}>Update forecast</button></div>
      <div className="field-weather-controls"><label>Planning for<select aria-label="Weather trade" value={trade} onChange={event => setTrade(event.target.value)}>{trades.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><p>Forecast guidance first. The contractor confirms any change to the workday.</p></div>
      <div className="field-weather-grid">{days.map(day => {
        const guidance = day.trade_guidance?.[trade] || { level: 'unknown', label: 'Forecast needed', reasons: ['Update weather before planning exposed work.'] };
        const held = holds.some(row => row.date === day.date && row.status === 'Confirmed');
        const wet = /rain|storm|drizzle/i.test(day.description || '');
        return <article key={day.date} data-weather-day={day.date} className={`field-day field-day-${held ? 'hold' : guidance.level}`}>
          <time dateTime={day.date}>{dateLabel(day.date)}</time><FieldIcon name={!fresh ? 'cloud' : wet ? 'rain' : /clear|sun/i.test(day.description || '') ? 'sun' : 'cloud'} className="field-weather-icon"/>
          <div className="field-temperature">{Number.isFinite(day.high_f) ? `${Math.round(day.high_f)}°` : '—'}<small>{Number.isFinite(day.low_f) ? ` / ${Math.round(day.low_f)}°F${Number.isFinite(day.high_f) ? '' : ' · High unknown'}` : Number.isFinite(day.high_f) ? 'F · Low unknown' : 'Temperature unknown'}</small></div>
          <span className={`field-condition field-condition-${held ? 'hold' : guidance.level}`}>{held ? 'Crew day off' : guidance.label}</span>
          <div className="field-weather-details">{day.temperature_coverage === 'partial' && (Number.isFinite(day.high_f) || Number.isFinite(day.low_f)) && <span>Temperature data incomplete</span>}<span>{Number.isFinite(day.rain_chance) ? `${forecast?.provider === 'nws' ? 'Up to ' : ''}${Math.round(day.rain_chance)}% rain${day.rain_coverage === 'partial' ? ' · incomplete data' : ''}` : 'Rain unknown'}</span><span>{Number.isFinite(day.precip_inches) ? `${day.precip_inches.toFixed(2)} in precipitation${day.precip_coverage === 'partial' ? ' · available periods' : ''}` : 'Precipitation amount unknown'}</span><span>{!Number.isFinite(day.wind_mph) ? 'Wind unknown' : day.wind_coverage === 'complete' ? `Wind up to ${Math.round(day.wind_mph)} mph` : forecast?.provider === 'nws' ? `Available wind up to ${Math.round(day.wind_mph)} mph · incomplete data` : 'Wind data incomplete'}</span></div>
          <ul className="field-day-reasons">{(guidance.reasons?.length ? guidance.reasons : [guidance.message]).filter(Boolean).map(reason=><li key={reason}>{reason}</li>)}</ul>
          <button className="field-day-action" disabled={locked || !fresh || held} onClick={() => { setHoldDay(day); setHoldNote(guidance.message || guidance.reasons?.join(' ') || 'Weather hold confirmed by contractor.'); }}>{held ? 'Recorded' : 'Plan a day off'}<FieldIcon name={held ? 'pause' : 'arrow'}/></button>
        </article>;
      })}</div>
      {fresh ? <div className="field-weather-source"><WeatherAttribution forecast={forecast}/><p>ABQ ADU trade guidance derived from {forecast.source || 'the forecast shown'}. Check site conditions before starting. <a href="https://www.weather.gov/safety/lightning-job" target="_blank" rel="noreferrer">Lightning safety</a></p>{forecast.source_updated_at && <small>Forecast issued {new Date(forecast.source_updated_at).toLocaleString('en-US', {timeZone:'America/Denver'})} MT · </small>}<small>Updated {new Date(forecast.checked_at).toLocaleString('en-US', {timeZone:'America/Denver'})} MT</small></div>
        : <p className="field-empty-note">{forecast ? 'This forecast no longer covers the next four days. Refresh before making a weather decision.' : 'Choose Update forecast to see the next four days. Blank cards mean weather is unknown.'}</p>}
      {holdDay && <div className="field-hold" role="group" aria-label="Confirm weather day off"><h3>{trades.find(([id])=>id===trade)?.[1]} · {dateLabel(holdDay.date)}</h3><p>Record the contractor's decision, then notify the crew. This does not send a text or change the master schedule.</p><label>Crew note<textarea aria-label="Weather hold note" value={holdNote} onChange={e=>setHoldNote(e.target.value)} maxLength={1000}/></label><div className="field-actions"><button className="field-button" disabled={locked || !holdNote.trim()} onClick={confirmHold}>Confirm day off</button><button className="field-button field-button-outline" onClick={()=>setHoldDay(null)}>Keep on schedule</button></div></div>}
      {!!holds.length && <div className="field-held-list">{holds.map(hold=><div key={hold.id}><b>Day off · {dateLabel(hold.date)}</b><p>{hold.message_body || hold.note}</p><div className="field-actions"><button className="field-text-button" onClick={()=>copy(hold.message_body || hold.note)}>Copy crew note</button><button className="field-text-button" disabled={locked} onClick={()=>cancelHold(hold)}>Remove day off</button></div></div>)}</div>}
      {!!holdHistory.length && <details className="field-hold-history"><summary>Past weather decisions ({holdHistory.length})</summary>{holdHistory.map(hold=><article key={hold.id}><b>{dateLabel(hold.date)} · {hold.status === 'Cancelled' ? 'Day off removed' : 'Past day off'}</b><p>{hold.note}</p></article>)}</details>}
    </section>

    <div className="field-work-grid">
      <section className="field-panel" id="trade-bids" aria-labelledby="field-bids-heading">
        <div className="field-section-heading"><div><span className="field-eyebrow">LINE UP THE RIGHT PEOPLE</span><h2 id="field-bids-heading">Trade bids</h2></div><FieldIcon name="bid" className="field-section-icon"/></div>
        <p className="field-section-intro">Give the subcontractor a clear scope. Keep their quote with the job.</p>
        {!showBid && <button className="field-button field-button-outline" disabled={!project} onClick={()=>setShowBid(true)}>New bid request<FieldIcon name="arrow"/></button>}
        {showBid && <form ref={formRef} aria-label="New bid request" className="field-form" onSubmit={saveBid}>
          <label>Job title<input aria-label="Job title" value={draft.title} onChange={e=>setDraft({title:e.target.value})} placeholder="Pour the slab, frame the ADU…" required maxLength={120}/></label>
          <div className="field-form-pair"><label>Trade<select aria-label="Bid trade" value={draft.trade} onChange={e=>setDraft({trade:e.target.value})}>{trades.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Quote due<input aria-label="Quote due" type="date" value={draft.due_date} onChange={e=>setDraft({due_date:e.target.value})}/></label></div>
          <label>Scope of work<textarea aria-label="Scope of work" value={draft.scope} onChange={e=>setDraft({scope:e.target.value})} placeholder="Dimensions, materials, access, and what's included." required maxLength={2000}/></label>
          <div className="field-form-pair"><label>Subcontractor<input aria-label="Subcontractor name" value={draft.contact_name} onChange={e=>setDraft({contact_name:e.target.value})} autoComplete="name" required maxLength={120}/></label><label>Mobile number<input aria-label="Subcontractor phone" type="tel" inputMode="tel" value={draft.contact_phone} onChange={e=>setDraft({contact_phone:e.target.value})} autoComplete="tel" required placeholder="505 555 0123" maxLength={25}/></label></div>
          <div className="field-actions"><button className="field-button" disabled={locked} type="submit">{pending ? 'Saving…' : 'Save bid request'}</button><button className="field-text-button" type="button" onClick={()=>setShowBid(false)}>Close form</button></div>
          <small>Saved as a draft. You review and send the request.</small>
        </form>}
        <div className="field-request-list">{requests.length ? requests.slice(0,bidLimit).map(row=><article key={row.id} className="field-request"><div className="field-row"><span className="field-reference">{row.reference}</span><span className="field-small-status">{row.status || 'Draft'}</span></div><h3>{row.title}</h3><p>{row.scope}</p><div className="field-request-meta"><span>{row.contact_name || 'Subcontractor to confirm'}</span>{row.due_date && <span>Due {dateLabel(row.due_date)}</span>}</div><details><summary>Review text request</summary><p className="field-message-copy">{row.message_body}</p></details><div className="field-actions">{phoneNumber(row.contact_phone) && <a className="field-button" href={smsHref(row.contact_phone,row.message_body)}>Prepare text<FieldIcon name="message"/></a>}<button className="field-text-button" onClick={()=>copy(row.message_body)}>Copy request</button></div></article>) : <div className="field-empty"><FieldIcon name="bid"/><h3>A good quote starts here.</h3><p>Add the scope, trade and contact. Text replies can come straight into the inbox.</p></div>}</div>
        {requests.length > bidLimit && <button className="field-text-button" onClick={()=>setBidLimit(limit=>limit+8)}>Show more bid requests ({requests.length-bidLimit} remaining)</button>}
      </section>
      <section className="field-panel" id="messages" aria-labelledby="field-messages-heading">
        <div className="field-section-heading"><div><span className="field-eyebrow">KEEP THE OFFICE IN THE LOOP</span><h2 id="field-messages-heading">Job inbox</h2></div><button className="field-text-button" disabled={busy} onClick={onRefresh}>Refresh inbox</button></div>
        <div className="field-text-office"><FieldIcon name="message"/><div><h3>{phone ? 'Text the office' : 'One number. Every job.'}</h3><p>{phone ? `Send quotes and updates to ${phone}. Include the bid reference so the office can find the job.` : 'Connect your Twilio number to receive subcontractor texts here. Incoming messages stay separate until reviewed.'}</p>{phone && <a className="field-button field-button-outline" href={smsHref(phone,`ABQ ADU job update: ${project?.client || ''}. `)}>Open text message</a>}</div></div>
        <div className="field-inbox-list">{inbox.length ? inbox.slice(0,inboxLimit).map(row=><article key={row.id || row.provider_sid} className="field-inbox-message"><div className="field-row"><b>{row.from}</b><span className="field-small-status">{row.status === 'Reviewed' ? 'Reviewed' : row.project_id ? 'Needs review' : 'Needs assignment'}</span></div><p>{row.body}</p>{row.media_count > 0 && <p>{row.media_count} attachment{row.media_count === 1 ? "" : "s"} · review in Twilio</p>}{row.received_at && <time dateTime={row.received_at}>{new Date(row.received_at).toLocaleString('en-US',{timeZone:'America/Denver'})} MT</time>}{row.status !== 'Reviewed' && <button className="field-text-button" disabled={locked} onClick={()=>reviewText(row)}>{row.project_id ? 'Mark reviewed' : `Assign to ${project?.client || 'this job'} & review`}</button>}</article>) : <div className="field-empty"><FieldIcon name="message"/><h3>No incoming texts yet.</h3><p>Subcontractor quotes, availability and job updates will appear here. A received text never accepts a price or cancels work automatically.</p></div>}</div>
        {inbox.length > inboxLimit && <button className="field-text-button" onClick={()=>setInboxLimit(limit=>limit+12)}>Show more texts ({inbox.length-inboxLimit} remaining)</button>}
      </section>
    </div>
  </div>;
}
