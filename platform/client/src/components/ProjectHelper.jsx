import React, { useEffect, useRef, useState } from 'react';
import { requestJson } from '../utils/api';
import ScheduleConnection from './ScheduleConnection';
import BriefingAudio from './BriefingAudio';
import CrewWeatherBrief from './CrewWeatherBrief';
import WeatherAttribution from './WeatherAttribution';
import './ProjectHelper.css';

const money = value => Number.isFinite(value) ? value.toLocaleString('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}) : 'Not recorded';
const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric',timeZone:'America/Denver'}) : 'Date unknown';
const timeLabel = date => Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleString('en-US', {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Denver',timeZoneName:'short'}) : 'Time unknown';


function WeatherDay({ planning, day }) {
  const numeric=(value,suffix,unknown)=>Number.isFinite(value)?`${value}${suffix}`:unknown;
  return <article className={`helper-weather-day helper-level-${planning.level}`}>
    <h4>{dateLabel(planning.date)}</h4>
    <strong>{planning.label}</strong>
    <p>{numeric(day?.high_f,'°','High unknown')} / {numeric(day?.low_f,'°','Low unknown')}</p>
    <p>{Number.isFinite(day?.rain_chance)?`Up to ${day.rain_chance}% rain`:'Rain unknown'}</p>
    <p>{Number.isFinite(day?.wind_mph)?`${day.wind_mph} mph wind${day.wind_coverage!=='complete'?' · incomplete':''}`:'Wind unknown'}</p>
    <details><summary>Why this matters</summary><ul>{(planning.reasons||[]).map((reason,i)=><li key={i}>{reason}</li>)}</ul></details>
  </article>;
}

function ScheduleReview({ schedule, risks }) {
  if(schedule?.status!=='available')return <p className="helper-muted">{schedule?.status==='unavailable'?'Schedule data is unavailable. Check the saved schedule before confirming dates.':'Connect this job to a construction schedule above to include its critical path and risk register.'}</p>;
  return <>
    <p><b>{schedule.project_name}</b> · {schedule.critical.length} critical · {schedule.late.length} past planned finish · {risks?.open_count??'Unknown'} open risks</p>
    <p className="helper-muted">Planned finish: {schedule.planned_finish?dateLabel(schedule.planned_finish):'Not recorded'}. A revised finish date requires a schedule review.</p>
    <ul>{schedule.recommendations.map((item,i)=><li key={i}>{item}</li>)}</ul>
    {!!schedule.weather_exposure?.length && <details><summary>Work that overlaps the weather window</summary><ul>{schedule.weather_exposure.map((item,i)=><li key={item.activity_id||i}><b>{item.name}</b> · {item.is_critical?'Critical work':'Check float'} · {(item.dates||[]).map(dateLabel).join(', ')}{Number.isFinite(item.candidate_hold_day_count) && <p>{item.candidate_hold_day_count} possible hold dates · {item.scenario_days_beyond_float===null?'Float comparison unavailable':`${item.scenario_days_beyond_float} days beyond recorded float in this scenario`}</p>}</li>)}</ul><p className="helper-muted">{schedule.weather_exposure_basis || 'Confirm whether this trade and weather apply to each activity before moving dates.'}</p></details>}
    {!!schedule.critical.length && <details><summary>Critical activities</summary><ul>{schedule.critical.slice(0,10).map(item=><li key={item.id}><b>{item.name}</b> · {dateLabel(item.planned_finish)} · {item.total_float===null?'Float unknown':`${item.total_float} days float`}</li>)}</ul></details>}
    {!!risks?.items?.length && <details><summary>Risk register</summary><ul>{risks.items.slice(0,5).map(item=><li key={item.id}><b>{item.title}</b> · {item.score===null?'Score unknown':`Score ${item.score}/25`}<p>{item.mitigation||'Add a mitigation plan with the project team.'}</p></li>)}</ul></details>}
    <a href={`/schedule/${schedule.project_id}`}>Review this construction schedule →</a>
  </>;
}

function HelperForProject({ project, revision, onForecast, onScheduleSaved }) {
  const [trade,setTrade]=useState('concrete');
  const [report,setReport]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  const [clock,setClock]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer);},[]);
  const [loadedRevision,setLoadedRevision]=useState(null);
  const currentRevision=useRef(revision);currentRevision.current=revision;
  const forecastCallback=useRef(onForecast);forecastCallback.current=onForecast;
  useEffect(()=>{
    const controller=new AbortController();
    const atRequest=currentRevision.current;
    setLoading(true);setError('');setReport(null);
    forecastCallback.current?.({project_id:project.id,forecast:null});
    const params=new URLSearchParams({trade});
    requestJson(`/api/project-helper/projects/${encodeURIComponent(project.id)}/briefing?${params}`,{signal:controller.signal})
      .then(data=>{
        if(controller.signal.aborted)return;
        if(data?.project?.id!==project.id||!Array.isArray(data.next_actions)||!Array.isArray(data.weather?.planning)||!data.schedule||typeof data.narration!=='string')throw new Error('The server returned an incomplete briefing. Please refresh.');
        setReport(data);setLoadedRevision(atRequest);
        forecastCallback.current?.({project_id:project.id,zip:data.weather.zip,forecast:data.weather.forecast});
      })
      .catch(err=>{if(!controller.signal.aborted)setError(err.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[project.id,trade,refresh]);
  const expires=report?.weather?.forecast?.expires_at;
  const start=report?.weather?.forecast?.window?.start_date;
  const todayParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(clock));
  const part=type=>todayParts.find(item=>item.type===type).value;
  const localToday=`${part('year')}-${part('month')}-${part('day')}`;
  const expired=Boolean((expires && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires)<=clock)) || (start && start<=localToday));
  useEffect(()=>{if(expired)forecastCallback.current?.({project_id:project.id,forecast:null});},[expired,project.id]);
  return <section className="project-helper" id="project-helper" aria-labelledby="project-helper-heading">
    <div className="helper-heading">
      <div><span className="helper-eyebrow">Project helper · this week</span><h2 id="project-helper-heading">Let's get the week moving.</h2><p>{project.client || project.name} · weather, work &amp; what needs you next.</p></div>
      <button disabled={loading} onClick={()=>setRefresh(value=>value+1)}>{loading?'Building briefing…':'Refresh briefing'}</button>
    </div>
    <div className="helper-settings">
      <label>Today's crew focus<select aria-label="Trade for briefing" value={trade} onChange={event=>setTrade(event.target.value)}>{[['concrete','Concrete'],['roofing','Roofing'],['excavation','Excavation'],['general','General work']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <ScheduleConnection projectId={project.id} refreshKey={refresh} onReload={()=>setRefresh(value=>value+1)} onSaved={()=>{setRefresh(value=>value+1);onScheduleSaved?.();}}/>
    </div>
    {loading && <p role="status">Checking saved project controls and the four-day forecast…</p>}
    {error && <p className="helper-error" role="alert">{error}</p>}
    {expired && <p role="alert" className="helper-error">The weather in this briefing has expired. Refresh the briefing before planning work or playing its audio.</p>}
    {report && !expired && <>
      <h3 className="helper-headline">{report.headline}</h3>
      <p className="helper-muted">Updated {timeLabel(report.generated_at)}{loadedRevision!==revision?' · Saved project data has changed; refresh this briefing.':''}</p>
      <BriefingAudio key={`${report.generated_at}-${trade}`} text={report.narration}/>
      <div className="helper-next-actions">{report.next_actions.slice(0,3).map((action,index)=><article key={action.id}><span className="helper-action-number" aria-hidden="true">0{index+1}</span><div><span className="helper-eyebrow">{action.priority==='high'?'Needs attention':'Next up'}</span><h4>{action.title}</h4><p>{action.detail}</p></div></article>)}</div>
      {report.next_actions.length>3 && <details><summary>{report.next_actions.length-3} more project checks</summary><ul>{report.next_actions.slice(3).map(item=><li key={item.id}><b>{item.title}.</b> {item.detail}</li>)}</ul></details>}
      <div className="helper-weather-heading"><h3>Next four days in Albuquerque</h3><span className={`helper-status helper-status-${report.weather.status}`}>{({current:'Current forecast',partial:'Some data missing',stale:'Refresh needed',unavailable:'Forecast unavailable'})[report.weather.status]||'Check forecast'}</span></div>
      <p>{report.weather.message}</p>
      <div className="helper-weather-grid">{report.weather.planning.map(day=><WeatherDay key={day.date} planning={day} day={report.weather.forecast?.days?.find(item=>item.date===day.date)}/>)}</div>
      {report.weather.forecast?<WeatherAttribution forecast={report.weather.forecast}/>:<a href="https://www.weather.gov/abq/" target="_blank" rel="noopener noreferrer">Check National Weather Service Albuquerque</a>}
      <p className="helper-muted">{report.weather.source_status?.source_updated_at?`Forecast issued ${timeLabel(report.weather.source_status.source_updated_at)}. `:''}Planning alerts appear here when you open or refresh the briefing. <a href="#trade-weather">Review crew weather holds</a> and <a href="#messages">prepare a crew text</a>.</p>
      <div className="helper-review-grid">
        <details><summary>Schedule &amp; delay review</summary><ScheduleReview schedule={report.schedule} risks={report.risks}/></details>
        <details><summary>Project controls &amp; costs</summary>
          <ul>{(report.controls?.readiness||[]).map(item=><li key={item.field}><b>{item.title}:</b> {item.detail}</li>)}</ul>
          <p>Model: {report.controls?.model?.catalog_name||project.model||'Confirm selected model'} · {report.controls?.model?.status==='confirmed'?'Area matches catalog':'Confirm measured area'}</p>
          <p>Estimated gross profit: {money(report.controls?.margin?.profit_low)} to {money(report.controls?.margin?.profit_high)}</p>
          <p>{report.controls?.invoices?.draft_count??0} saved invoice drafts. Payment status is not included in this briefing. <a href="/invoices">Review invoices &amp; payments</a></p>
        </details>
      </div>
    </>}
    <div className="helper-review-grid">
      <details id="property-tax-review">
        <summary>Homeowner property-tax planning · Bernalillo County</summary>
        <p><strong>Contractor-reported 51% checkpoint: unverified.</strong> Include a property-tax review in the build timeline and confirm the threshold with the Assessor before treating it as a tax rule. This note does not establish that this job has reached that stage or that tax is due.</p>
        <ul>
          <li>Confirm the parcel's jurisdiction, how work in progress is assessed, any completion threshold, and what the owner must report.</li>
          <li>Review the January 1 valuation date and the applicable tax year with the homeowner. Improvements during a year affect valuation the following January 1.</li>
          <li>Confirm the actual bill and payment dates with the Treasurer, then review any mortgage escrow change with the homeowner's lender.</li>
        </ul>
        <p><a href="https://www.bernco.gov/assessor/" target="_blank" rel="noopener noreferrer">Bernalillo County Assessor</a> · <a href="https://www.srca.nm.gov/parts/title03/03.006.0007.html" target="_blank" rel="noopener noreferrer">Valuation-date rule · 3.6.7.14 NMAC</a></p>
      </details>
    </div>
    <CrewWeatherBrief report={report} project={project} loading={loading} expired={expired}/>
  </section>;
}

export default function ProjectHelper(props) {
  return props.project?.id ? <HelperForProject key={props.project.id} {...props}/> : null;
}
