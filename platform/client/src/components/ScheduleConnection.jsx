import React, { useEffect, useRef, useState } from 'react';
import { requestJson, requestList } from '../utils/api';
import { getAuthSession } from '../utils/authFetch';

const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function requestId() {
  if(window.crypto.randomUUID)return window.crypto.randomUUID();
  const bytes=window.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const value=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
function checkedLink(payload,projectId) {
  if(!payload || !Object.prototype.hasOwnProperty.call(payload,'link'))throw new Error('The saved connection could not be verified. Reload it before continuing.');
  const link=payload.link;
  if(link===null)return null;
  if(link.project_id!==projectId || !uuidPattern.test(link.version||'') || !(link.schedule_project_id===null || Number.isSafeInteger(link.schedule_project_id)&&link.schedule_project_id>0)
    || !['available','missing','unavailable'].includes(link.status))throw new Error('The saved connection could not be verified. Reload it before continuing.');
  return link;
}

function ConnectionForProject({projectId,onSaved,refreshKey,onReload}) {
  const [owner]=useState(getAuthSession);
  const [link,setLink]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [schedules,setSchedules]=useState([]);
  const [selection,setSelection]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [listError,setListError]=useState('');
  const [notice,setNotice]=useState('');
  const [reload,setReload]=useState(0);
  const pending=useRef(null);
  const attempt=useRef(null);
  const mounted=useRef(false);
  const lastManualReload=useRef(-1);
  const editing=useRef(false);
  const desired=selection?Number(selection):null;
  const current=link?.schedule_project_id??null;
  const dirty=desired!==current;
  editing.current=dirty;
  const endpoint=`/api/project-helper/projects/${encodeURIComponent(projectId)}/schedule-link`;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current?.abort();};},[]);
  useEffect(()=>{
    const manualReload=lastManualReload.current!==reload;
    lastManualReload.current=reload;
    if(!manualReload && (editing.current || pending.current)){
      setNotice('Your unsaved schedule choice is kept. The refreshed briefing may use a newer connection. Reload the saved connection when ready to review it.');
      return;
    }
    const controller=new AbortController();
    setLoading(true);setLoaded(false);setError('');setListError('');setNotice('');
    Promise.allSettled([
      requestJson(endpoint,{signal:controller.signal,authSession:owner}),
      requestList('/api/portfolio',{signal:controller.signal,authSession:owner}),
    ]).then(([saved,choices])=>{
      if(controller.signal.aborted)return;
      if(saved.status==='fulfilled'){
        try{const next=checkedLink(saved.value,projectId);setLink(next);setSelection(next?.schedule_project_id?String(next.schedule_project_id):'');setLoaded(true);attempt.current=null;}
        catch(err){setError(err.message);}
      }else setError(saved.reason.message);
      if(choices.status==='fulfilled')setSchedules(choices.value.filter(item=>Number.isSafeInteger(item.id)&&item.id>0));
      else setListError('Schedule choices could not load. You can retry or disconnect an existing connection.');
      setLoading(false);
    });
    return()=>controller.abort();
  },[endpoint,projectId,reload,owner,refreshKey]);
  async function save() {
    if(!loaded || !dirty || pending.current)return;
    const expected=link?.version??null;
    try{if(!attempt.current || attempt.current.schedule_project_id!==desired || attempt.current.expected_version!==expected)attempt.current={request_id:requestId(),schedule_project_id:desired,expected_version:expected};}
    catch{setError('A secure request could not be prepared. Please retry.');return;}
    const controller=new AbortController();pending.current=controller;setSaving(true);setError('');setNotice('');
    try{
      const result=await requestJson(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(attempt.current),signal:controller.signal,authSession:owner});
      if(!mounted.current || controller.signal.aborted)return;
      const next=checkedLink(result,projectId);
      if(!next || typeof result.replayed!=='boolean' || (!result.replayed && (next.schedule_project_id!==desired || next.version===expected)))throw new Error('The saved connection could not be verified. Retry to check the same request.');
      setLink(next);setSelection(next?.schedule_project_id?String(next.schedule_project_id):'');attempt.current=null;
      setNotice((next?.schedule_project_id??null)!==desired?'The connection has changed since that request. Showing the current saved connection.':desired?'Schedule connection saved.':'Schedule disconnected. The construction schedule is unchanged.');
      onSaved?.(next);
    }catch(err){if(mounted.current && !controller.signal.aborted)setError(err.message);}
    finally{if(pending.current===controller)pending.current=null;if(mounted.current && !controller.signal.aborted)setSaving(false);}
  }
  const options=[...schedules];
  if(current && !options.some(item=>item.id===current))options.unshift({id:current,name:link.schedule_name||`Saved schedule #${current}`});
  return <div className="schedule-connection">
    {current && <p><b>Connected to {link.schedule_name||`schedule #${current}`}</b>{link.status==='available' && <> · <a href={`/schedule/${current}`}>Open this schedule →</a></>}</p>}
    {link?.status==='missing' && <p role="status">The saved schedule could not be found. Choose another schedule or disconnect it; your job is still saved.</p>}
    {link?.status==='unavailable' && <p role="status">The saved schedule is temporarily unavailable. Its connection has been kept.</p>}
    <details open={!current}>
      <summary>{current?'Change schedule connection':'Connect a construction schedule'}</summary>
      <label>Construction schedule<select aria-label="Schedule for briefing" value={selection} disabled={loading || saving || !loaded} onChange={event=>{setSelection(event.target.value);attempt.current=null;setNotice('');setError('');}}>
        <option value="">No schedule connected</option>{options.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <p className="helper-muted">Choose the matching project once. Future briefings use its saved dates, critical activities and risk register.</p>
      {loaded && !loading && !listError && !schedules.length && <p className="helper-muted">No active construction schedules yet. <a href="/schedule">Create a schedule</a>, then return to connect it to this job.</p>}
      <div className="helper-buttons"><button disabled={loading || saving || !loaded || !dirty} onClick={save}>{saving?'Saving connection…':desired===null && current?'Disconnect schedule':'Save connection'}</button></div>
    </details>
    {loading && <p role="status">Loading the saved schedule connection…</p>}
    {listError && <p role="status">{listError}</p>}
    {error && <p role="alert">{error}</p>}
    <button disabled={saving || loading} onClick={()=>{setReload(value=>value+1);onReload?.();}}>Reload saved connection</button>
    {dirty && <p className="helper-muted">Reloading replaces your unsaved schedule choice with the saved connection.</p>}
    {notice && <p role="status">{notice}</p>}
  </div>;
}
export default function ScheduleConnection(props) {
  return <ConnectionForProject key={props.projectId} {...props}/>;
}
