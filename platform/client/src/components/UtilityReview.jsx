import React from 'react';

export const utilityQuestions = {
  water: {label:'Water',question:'Where can water connect, and is the service suitable?',prompt:'Connection and meter location, available service information, route to the ADU, and who must verify capacity.'},
  electric: {label:'Electric',question:'Can the electrical service support the ADU?',prompt:'Panel and service capacity, route to the ADU, and whether a meter or service upgrade needs review.'},
  sewer: {label:'Sewer',question:'Where can sewer connect, and will the route work?',prompt:'Connection location, depth and slope; ask the qualified trade to confirm gravity service or investigate pumping.'},
};
export const utilityStatuses = {unknown:'Not checked',in_review:'In review',needs_work:'Needs work',confirmed:'Confirmed'};
export const emptyUtilities = () => Object.fromEntries(Object.keys(utilityQuestions).map(key=>[key,{status:'unknown',notes:''}]));
export const utilitiesOf = review => Object.fromEntries(Object.keys(utilityQuestions).map(key=>[key,{...(review?.utility_reviews?.[key]||{status:'unknown',notes:''})}]));
export const sameUtilities = (one,two) => Object.keys(utilityQuestions).every(key=>one?.[key]?.status===two?.[key]?.status && one?.[key]?.notes===two?.[key]?.notes);
export const validUtilities = reviews => !!reviews && typeof reviews==='object' && !Array.isArray(reviews)
  && Object.keys(reviews).length===3 && Object.keys(utilityQuestions).every(key=>{
    const item=reviews[key];
    return !!item && typeof item==='object' && Object.hasOwn(utilityStatuses,item.status)
      && typeof item.notes==='string' && item.notes.length<=2000
      && (item.status!=='confirmed' || item.notes.trim().length>=10);
  });

export function recoveryFindings(form) {
  const utilities=utilitiesOf(form);
  return [form?.notes||'',...Object.entries(utilityQuestions).flatMap(([key,{label}])=>{
    const item=utilities[key];
    return item.status==='unknown' && !item.notes ? [] : [`${label} · ${utilityStatuses[item.status]}\n${item.notes||'No findings recorded.'}`];
  })].filter(Boolean).join('\n\n');
}

export function UtilityPriorities({review,loading,unavailable,stale,dirty}) {
  const utilities=utilitiesOf(review);
  return <div className="gis-utility-priorities" role="region" aria-label="Water, electric and sewer priorities">
    <h3>The builder’s three big questions</h3>
    <div className="gis-utility-overview">{Object.entries(utilityQuestions).map(([key,{label,question}])=>{
      const item=utilities[key];
      const state=loading?'Loading…':unavailable?'Unavailable':stale?'Needs a fresh check':item.status==='confirmed' && item.notes.trim().length<10?'Findings needed':utilityStatuses[item.status];
      return <article key={key}><div><b>{label}</b><span className={`gis-utility-status ${!stale && item.status==='needs_work'?'gis-utility-issue':''}`}>{state}</span></div><p>{question}</p></article>;
    })}</div>
    <p className="gis-help">{dirty?'Showing unsaved review edits. ':''}Record each connection, capacity question and next step before finalizing the bid. A map or combined checkbox cannot confirm utility service.</p>
  </div>;
}

export function UtilityReviewFields({value,onChange}) {
  return <div className="gis-utility-fields">
    <h3>Water, electric &amp; sewer</h3>
    <p className="gis-help">Keep each service separate. To mark one confirmed, record who checked it, when, the source and the findings. Provider and permit approvals remain separate.</p>
    <div className="gis-utility-grid">{Object.entries(utilityQuestions).map(([key,{label,prompt}])=><div className="gis-utility-field" key={key}>
      <label>{label} status<select value={value[key].status} onChange={event=>onChange({...value,[key]:{...value[key],status:event.target.value}})}>{Object.entries(utilityStatuses).map(([status,text])=><option key={status} value={status}>{text}</option>)}</select></label>
      <p className="gis-help">{prompt}</p>
      <label>{label} findings<textarea rows={4} maxLength={2000} value={value[key].notes} onChange={event=>onChange({...value,[key]:{...value[key],notes:event.target.value}})} placeholder="Who checked it, date and source; connection details; remaining questions, next person to contact or quote needed."/></label>
    </div>)}</div>
  </div>;
}
