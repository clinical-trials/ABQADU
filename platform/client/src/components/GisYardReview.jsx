import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { requestJson } from '../utils/api';
import { getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';
import { emptyUtilities, utilitiesOf, sameUtilities, validUtilities, utilityQuestions, UtilityPriorities, UtilityReviewFields, recoveryFindings } from './UtilityReview';
import AduSizeReview, { emptySizeReview, sizeReviewOf, sameSizeReview, validSizeReview, floorArea, sizeRecovery } from './AduSizeReview';
import './GisYardReview.css';

const MAP = 'https://cabq.maps.arcgis.com/apps/webappviewer/index.html?id=53bf716981b14d25a31e7a2549c2d61b';
const AERIAL = 'https://geocortexweb.cabq.gov/Html5Viewer/index.html?viewer=PublicAMV';
const COUNTY = 'https://www.bernco.gov/planning/gis.aspx';
const keys = ['status','jurisdiction','parcel_id','width_ft','depth_ft','notes'];
const checkLabels = {parcel:'Address and parcel matched',zoning:'Jurisdiction and zoning reviewed',access:'Access and existing structures reviewed',easements:'Recorded easements and constraints reviewed',utilities:'Utility information and field checks noted'};
const empty = () => ({status:'queued',jurisdiction:'unknown',parcel_id:'',width_ft:'',depth_ft:'',notes:'',checks:Object.fromEntries(Object.keys(checkLabels).map(key=>[key,false])),utility_reviews:emptyUtilities(),size_review:emptySizeReview()});
const addressKey = value => String(value || '').trim().replace(/\s+/g,' ').toLowerCase();
const formOf = review => review ? {...Object.fromEntries(keys.map(key=>[key,review[key]])),checks:{...review.checks},utility_reviews:utilitiesOf(review),size_review:sizeReviewOf(review)} : empty();
const same = (one,two) => keys.every(key=>one?.[key]===two?.[key]) && Object.keys(checkLabels).every(key=>one?.checks?.[key]===two?.checks?.[key]) && sameUtilities(one?.utility_reviews,two?.utility_reviews) && sameSizeReview(one?.size_review,two?.size_review);
const recoveryText=form=>[recoveryFindings(form),sizeRecovery(form)].filter(Boolean).join('\n\n');
const stamp = value => new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Denver',timeZoneName:'short'});
const drafts = new Map();
subscribeAuthSession(()=>drafts.clear());
function feet(value) {
  if(typeof value!=='string' || !/^\d{1,5}(?:\.\d{1,2})?$/.test(value.trim()))return null;
  const result=Number(value);return result>0 && result<=10000 ? result : null;
}
function requestId() {
  if(window.crypto?.randomUUID)return window.crypto.randomUUID();
  if(!window.crypto?.getRandomValues)throw new Error('Open the workspace in a current browser using HTTPS or localhost to save securely.');
  const bytes=window.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function checked(payload,projectId) {
  const fail=()=>{throw new Error('The saved GIS review could not be verified. Reload before continuing.');};
  if(payload?.project?.id!==projectId || typeof payload.project.address!=='string' || typeof payload.stale!=='boolean' || !Object.hasOwn(payload,'review'))fail();
  if(payload.review!==null) {
    const review=payload.review;
    if(review?.project_id!==projectId || !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(review.version||'')
      || typeof review.address_snapshot!=='string' || !Number.isFinite(Date.parse(review.updated_at)) || !keys.every(key=>typeof review[key]==='string')
      || !['queued','in_review','reviewed'].includes(review.status) || !['unknown','albuquerque','bernalillo_county','other'].includes(review.jurisdiction)
      || !Object.keys(checkLabels).every(key=>typeof review.checks?.[key]==='boolean')
      || ['width_ft','depth_ft'].some(key=>review[key]!=='' && feet(review[key])===null)
      || (review.utility_reviews!==undefined && !validUtilities(review.utility_reviews))
      || (review.size_review!==undefined && !validSizeReview(review.size_review))
      || (!payload.stale && addressKey(review.address_snapshot)!==addressKey(payload.project.address)))fail();
  }
  return payload;
}

function ReviewForProject({project,revision,saveChanges,onSaved}) {
  const [owner]=useState(getAuthSession);
  useSyncExternalStore(subscribeAuthSession,getAuthSession);
  const authorized=isAuthSessionCurrent(owner);
  const [data,setData]=useState(null),[form,setForm]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [refreshing,setRefreshing]=useState(false),refreshLock=useRef(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false),[reload,setReload]=useState(0);
  const pending=useRef(null),attempt=useRef(null),mounted=useRef(false),editing=useRef(false),lastReload=useRef(-1),addressInput=useRef(null),callbacks=useRef({saveChanges,onSaved});
  callbacks.current={saveChanges,onSaved};
  const cacheKey=`${owner.epoch}:${project.id}`;
  const endpoint=`/api/project-helper/projects/${encodeURIComponent(project.id)}/gis-review`;
  const dirty=!!form && !same(form,formOf(data?.review));
  editing.current=dirty;
  const addressChanged=!!data && addressKey(project.address)!==addressKey(data.project.address);
  const stale=!!data?.stale || addressChanged;
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;pending.current?.abort();};
  },[]);
  useEffect(()=>{
    if(!authorized)return;
    const manual=lastReload.current!==reload;lastReload.current=reload;
    if(!manual && (editing.current || pending.current))return;
    const controller=new AbortController();
    setLoading(true);setError('');
    requestJson(endpoint,{authSession:owner,signal:controller.signal}).then(payload=>{
      if(controller.signal.aborted || !isAuthSessionCurrent(owner))return;
      const result=checked(payload,project.id),cached=drafts.get(cacheKey);
      const changed=!!cached && (cached.version!==(result.review?.version||null) || cached.address!==addressKey(result.project.address));
      setData(result);setForm(cached?.form||formOf(result.review));setConflict(changed);attempt.current=cached?.attempt||null;
      if(changed)setError('The saved review or intake address changed. Your unsaved notes remain below. Copy any text you need, then discard edits and reload.');
    }).catch(failure=>{if(!controller.signal.aborted && isAuthSessionCurrent(owner))setError(failure.message);})
      .finally(()=>{if(!controller.signal.aborted && isAuthSessionCurrent(owner))setLoading(false);});
    return()=>controller.abort();
  },[endpoint,project.id,owner,authorized,revision,reload,cacheKey]);
  useEffect(()=>{
    if(!authorized)return;
    if(dirty && data) {
      const before=drafts.get(cacheKey);
      drafts.set(cacheKey,{form,version:conflict && before ? before.version : data.review?.version||null,address:conflict && before ? before.address : addressKey(data.project.address),attempt:attempt.current});
    }else if(data && !saving && !conflict && !attempt.current)drafts.delete(cacheKey);
  },[dirty,data,form,cacheKey,authorized,saving,conflict]);
  useEffect(()=>{
    const warn=event=>{if(dirty || saving || refreshing){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty,saving,refreshing]);
  async function refresh() {
    if(pending.current || refreshLock.current)return;
    refreshLock.current=true;setRefreshing(true);setError('');
    try {
      const saved=await callbacks.current.saveChanges();
      if(!mounted.current || !isAuthSessionCurrent(owner))return;
      if(!saved)throw new Error('Save the intake address before refreshing the GIS review.');
      drafts.delete(cacheKey);attempt.current=null;setData(null);setForm(null);setConflict(false);setNotice('');setLoading(true);setReload(value=>value+1);
    }catch(failure){if(mounted.current && isAuthSessionCurrent(owner))setError(failure.message);}
    finally{refreshLock.current=false;if(mounted.current && isAuthSessionCurrent(owner))setRefreshing(false);}
  }
  async function save(restart=false) {
    if(pending.current || refreshLock.current || !data || !form || conflict || addressChanged)return;
    const submitted=restart?empty():{...form,parcel_id:form.parcel_id.trim(),notes:form.notes.trim(),width_ft:form.width_ft.trim(),depth_ft:form.depth_ft.trim()};
    if(Object.values(submitted.size_review).some(value=>value.trim()!=='' && floorArea(value)===null)){setError('Enter positive floor areas up to 1,000,000 sq ft with at most two decimals, or leave them blank.');return;}
    submitted.size_review=Object.fromEntries(Object.entries(submitted.size_review).map(([key,value])=>[key,value.trim()===''?'':floorArea(value).toFixed(2)]));
    submitted.utility_reviews=Object.fromEntries(Object.entries(submitted.utility_reviews).map(([key,item])=>[key,{...item,notes:item.notes.trim()}]));
    const missingFindings=Object.entries(submitted.utility_reviews).find(([,item])=>item.status==='confirmed' && item.notes.length<10);
    if(missingFindings){setError(`${utilityQuestions[missingFindings[0]].label} needs findings of at least 10 characters before confirmation. Record who checked it, when and the source.`);return;}
    if(['width_ft','depth_ft'].some(key=>submitted[key]!=='' && feet(submitted[key])===null)){setError('Enter positive measurements up to 10,000 feet with at most two decimals, or leave them blank.');return;}
    for(const key of ['width_ft','depth_ft'])if(submitted[key]!=='')submitted[key]=feet(submitted[key]).toFixed(2);
    if(submitted.status==='reviewed' && (!submitted.checks.parcel || submitted.notes.length<10)){setError('Match the address and parcel, then add review findings of at least 10 characters before marking the desktop review recorded.');return;}
    const expectedAddress=data.project.address;
    const signature=JSON.stringify({review:submitted,expected_address:expectedAddress,expected_version:data.review?.version||null});
    try {if(attempt.current?.signature!==signature)attempt.current={signature,body:{request_id:requestId(),expected_address:expectedAddress,expected_version:data.review?.version||null,review:submitted}};}
    catch(failure){setError(failure.message);return;}
    const receipt=attempt.current;
    drafts.set(cacheKey,{form,version:data.review?.version||null,address:addressKey(expectedAddress),attempt:receipt});
    const controller=new AbortController();pending.current=controller;setSaving(true);setError('');setNotice('');
    try {
      const saved=await callbacks.current.saveChanges();
      if(!mounted.current || controller.signal.aborted || !isAuthSessionCurrent(owner))return;
      const savedProject=saved?.projects?.find(item=>item.id===project.id);
      if(!savedProject || addressKey(savedProject.address)!==addressKey(expectedAddress))throw new Error('The intake address changed. Refresh the saved address before queuing or saving this review.');
      const result=checked(await requestJson(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(receipt.body),authSession:owner,signal:controller.signal}),project.id);
      if(!mounted.current || controller.signal.aborted || !isAuthSessionCurrent(owner))return;
      if(!result.review || typeof result.replayed!=='boolean' || (!result.replayed && (result.review.version===receipt.body.expected_version || result.stale || addressKey(result.review.address_snapshot)!==addressKey(expectedAddress) || !same(formOf(result.review),submitted))))throw new Error('The GIS save acknowledgement could not be verified. Retry the same save.');
      setData(result);setForm(formOf(result.review));attempt.current=null;drafts.delete(cacheKey);
      setNotice(result.stale?'A later address change requires another review. Showing the current saved record.':result.replayed?'Save confirmed. Showing the current saved GIS review.':result.review.status==='queued'?'GIS yard review queued for this address. No message was sent.':'GIS review notes saved. This records a desktop check, not site or permit approval.');
      callbacks.current.onSaved?.();
    }catch(failure){if(mounted.current && !controller.signal.aborted && isAuthSessionCurrent(owner)){setError(failure.message);setConflict(failure.status===409);}}
    finally{if(pending.current===controller)pending.current=null;if(mounted.current && isAuthSessionCurrent(owner))setSaving(false);}
  }
  async function copyAddress() {
    const address=String(project.address||'').trim();
    try {await navigator.clipboard.writeText(address);if(mounted.current && isAuthSessionCurrent(owner))setNotice('Address copied. Paste it into the aerial/parcel viewer search.');}
    catch {if(mounted.current && isAuthSessionCurrent(owner)){addressInput.current?.focus();addressInput.current?.select();setNotice('Address selected. Use your device’s Copy command, then paste it into the map search.');}}
  }
  if(!authorized)return null;
  const address=String(project.address||'').trim(),width=feet(form?.width_ft),depth=feet(form?.depth_ft);
  const edit=(name,value)=>{setForm(previous=>({...previous,[name]:value}));setNotice('');if(!conflict)setError('');};
  return <section className="gis-yard" id="gis-review" aria-labelledby="gis-yard-heading">
    <div className="gis-yard-heading"><div><span className="gis-eyebrow">Intake → utility &amp; map review → site visit</span><h2 id="gis-yard-heading">Check the yard before the visit.</h2><p>Water, electric and sewer come first. Review them for this job’s intake address.</p></div><span className={`gis-status ${stale?'gis-status-stale':''}`}>{stale?'Address needs a fresh review':({queued:'Queued for review',in_review:'Review in progress',reviewed:'Desktop review recorded'})[data?.review?.status]||'Not queued'}</span></div>
    <UtilityPriorities review={form} loading={loading} unavailable={!data && !loading} stale={stale} dirty={dirty}/>
    <div className="gis-location"><label>Address from intake<input ref={addressInput} value={address} readOnly aria-label="Address for GIS review"/></label><button type="button" disabled={!address} onClick={copyAddress}>Copy address</button></div>
    {address ? <div className="gis-links"><a href={`${MAP}&find=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer">Find address in City zoning map ↗</a><a href={AERIAL} target="_blank" rel="noopener noreferrer">Open aerial &amp; parcel viewer ↗</a><a href={COUNTY} target="_blank" rel="noopener noreferrer">County zoning resources ↗</a></div> : <p className="gis-warning">Add the property address in project intake before starting a GIS review.</p>}
    <p className="gis-help">The City search opens with this address; confirm the matched parcel. Copy the address into the aerial viewer. City IDO layers do not include county zoning. Map links open external services only when you choose them.</p>
    {loading && <p role="status">Loading the saved GIS review…</p>}
    {error && <p className="gis-warning" role="alert">{error}</p>}
    {notice && <p className="gis-notice" role="status">{notice}</p>}
    {!loading && data && form && <>
      {stale && <div className="gis-warning"><b>Review the updated intake address.</b><p>The previous check is retained for reference and does not apply to the current intake. Changing an address back does not reactivate an old review.</p>{data.review && <details><summary>Previous review · {data.review.address_snapshot}</summary><p className="gis-preserve-lines">{recoveryText(data.review)||'No findings recorded.'}</p><p>{data.review.width_ft||'Unknown'} ft × {data.review.depth_ft||'Unknown'} ft · {stamp(data.review.updated_at)}</p></details>}
        {!addressChanged && <button type="button" disabled={saving || refreshing || conflict || !address} onClick={()=>save(true)}>{saving?'Starting review…':'Start review for updated address'}</button>}
      </div>}
      {dirty && (stale || conflict) && <label className="gis-warning">Unsaved GIS findings<textarea readOnly rows={4} value={recoveryText(form)}/><span className="gis-help">Copy these findings before starting over or discarding edits. They have not been saved in the current review.</span></label>}
      {!stale && <details className="gis-editor" open={!!data.review || dirty}><summary>{data.review?'Review checklist & yard notes':'Prepare a GIS yard review'}</summary>
        <fieldset disabled={saving || refreshing || conflict}><legend className="gis-sr">GIS desktop review</legend>
          <UtilityReviewFields value={form.utility_reviews} onChange={value=>edit('utility_reviews',value)}/>
          <div className="gis-form-grid"><label>Review status<select value={form.status} onChange={event=>edit('status',event.target.value)}><option value="queued">Queued for review</option><option value="in_review">Review in progress</option><option value="reviewed">Desktop review recorded</option></select></label>
          <label>Property jurisdiction<select value={form.jurisdiction} onChange={event=>edit('jurisdiction',event.target.value)}><option value="unknown">Not confirmed</option><option value="albuquerque">City of Albuquerque</option><option value="bernalillo_county">Unincorporated Bernalillo County</option><option value="other">Another jurisdiction</option></select></label>
          <label className="gis-wide">Parcel reference<input value={form.parcel_id} maxLength={100} onChange={event=>edit('parcel_id',event.target.value)} placeholder="Parcel ID or map reference"/></label></div>
          <AduSizeReview value={form.size_review} onChange={value=>edit('size_review',value)} jurisdiction={form.jurisdiction} jobSqft={project.sqft}/>
          <div className="gis-checklist">{Object.entries(checkLabels).filter(([key])=>key!=='utilities').map(([key,label])=><label key={key}><input type="checkbox" checked={form.checks[key]} onChange={event=>edit('checks',{...form.checks,[key]:event.target.checked})}/><span>{label}</span></label>)}</div>
          <p className="gis-help">Check an item after reviewing it. Record unknowns and problems in the notes; a checked item does not mean the property complies.</p>
          <div className="gis-measure-grid"><div><h3>Approximate yard rectangle</h3><p className="gis-help">Enter dimensions you measured in GIS. Leave unknown measurements blank.</p><div className="gis-form-grid"><label>Yard width (ft)<input inputMode="decimal" value={form.width_ft} maxLength={9} onChange={event=>edit('width_ft',event.target.value)}/></label><label>Yard depth (ft)<input inputMode="decimal" value={form.depth_ft} maxLength={9} onChange={event=>edit('depth_ft',event.target.value)}/></label></div></div><div className="gis-area" aria-label="Approximate measured rectangle"><span>Recorded rectangle</span><strong>{!stale && width!==null && depth!==null ? `${(width*depth).toLocaleString('en-US',{maximumFractionDigits:2})} sq ft`:'Not measured'}</strong><small>Not a buildable-area determination</small></div></div>
          <label>Findings and site-visit checks<textarea rows={4} value={form.notes} maxLength={4000} onChange={event=>edit('notes',event.target.value)} placeholder="Map/source and date; structures, yard space, access, easements; what needs measuring or confirmation on site."/></label>
          <div className="gis-actions"><button className="gis-primary" type="button" disabled={!address || saving || refreshing || conflict || (!!data.review && !dirty)} onClick={()=>save()}>{saving?'Saving review…':data.review?'Save GIS review':'Queue GIS review'}</button>{dirty && <span className="gis-help">Unsaved review edits</span>}</div>
        </fieldset>
      </details>}
      {data.review && <p className="gis-help">Saved {stamp(data.review.updated_at)} · for {data.review.address_snapshot}</p>}
    </>}
    <button type="button" className="gis-reload" disabled={loading || saving || refreshing} onClick={refresh}>{refreshing?'Refreshing intake…':dirty||conflict?'Discard GIS edits and reload':addressChanged?'Save intake and refresh GIS review':'Reload GIS review'}</button>
    <p className="gis-help">Use GIS for an early look at yard space. Confirm boundaries, setbacks, easements, utilities and field dimensions before deciding whether an ADU fits. Site-visit target: 24–72 hours after inquiry, by confirmed appointment.</p>
  </section>;
}

export default function GisYardReview(props) {
  return props.project?.id ? <ReviewForProject key={props.project.id} {...props}/> : null;
}
