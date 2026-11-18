import React, { useState, useSyncExternalStore } from 'react';
import { getAuthSession, subscribeAuthSession } from '../utils/authFetch';
import { smsDraftHref } from '../utils/textDraft';
import './OfficeAssistant.css';
const taskId = () => globalThis.crypto?.randomUUID?.() || `followup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const types = { inquiry: 'New inquiry', appointment: 'Site visit', estimate: 'Estimate follow-up', update: 'Customer update', payment: 'Check follow-up' };
function draft(kind, project) {
  const header = `Hello ${project.client || 'there'}, this is ABQ ADU. `;
  return header + ({
    inquiry: 'Thanks for your interest. Could you share your project address, target budget, and preferred timing?',
    appointment: 'What times work for a site visit in the next 24–72 hours? We will confirm availability and the appointment together.',
    estimate: 'Do you have any questions about the estimate? We can review the scope, options, and next steps together.',
    update: 'We would like to check in about your project. Please let us know any questions or decisions you would like to discuss.',
    payment: 'We are checking in about payment arrangements. If you have already sent a check or have a question about the invoice, please let us know so we can reconcile our records.'
  }[kind]);
}
function Workspace({ project, state, runAction, busy }) {
  const [kind, setKind] = useState('inquiry');
  const [message, setMessage] = useState(draft('inquiry', project));
  const [date, setDate] = useState('');
  const [id, setId] = useState(() => taskId());
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState(false);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const rows = (state.office_tasks || []).filter(row => row.project_id === project.id);
  const open = rows.filter(row => row.status === 'open').sort((a,b) => a.due_date.localeCompare(b.due_date));
  const visible = history ? rows : open;
  const apple = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  async function save(body, creating = false) {
    if (pending || busy) return;
    setPending(true); setNotice('');
    try {
      const result = await runAction('/api/command-center/office-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!result) throw new Error('Unable to save. Please retry.');
      setNotice(creating ? 'Follow-up saved. No message has been sent.' : 'Follow-up status saved.');
      if (creating) { setId(taskId()); setDate(''); }
    } catch (error) { setNotice(error.message); }
    finally { setPending(false); }
  }
  return <section id="office-assistant" className="office-assistant" aria-labelledby="office-title">
    <header><div><small>YOUR CUSTOMER OFFICE</small><h2 id="office-title">Office Assistant</h2></div><strong>{open.filter(row => row.due_date <= today).length} due for review</strong></header>
    <p>Keep inquiries, appointments, sales, customer updates, and check follow-ups moving.</p>
    <p className="office-note">Assisted drafts · review and send from your phone. Automatic AI replies and delivery are not connected.</p>
    <form onSubmit={event => { event.preventDefault(); save({ id, project_id: project.id, kind, due_date: date, message }, true); }}>
      <div className="office-fields"><label>Follow-up type<select value={kind} onChange={event => { setKind(event.target.value); setMessage(draft(event.target.value, project)); setId(taskId()); }}>{Object.entries(types).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Review on (Albuquerque)<input type="date" required value={date} onChange={event => { setDate(event.target.value); setId(taskId()); }}/></label></div>
      <label>Customer message<textarea rows={4} maxLength={1600} required value={message} onChange={event => { setMessage(event.target.value); setId(taskId()); }}/></label>
      {kind === 'payment' && <p>Check the invoice balance and recent check receipts first. Pause follow-up for a dispute or an unresolved payment. Completing this task does not mark an invoice paid.</p>}
      <button disabled={pending || busy || !message.trim()}>Save follow-up</button>
    </form>
    {notice && <p role="status">{notice}</p>}
    <div className="office-list-heading"><h3>{history ? 'Follow-up history' : 'Next follow-ups'}</h3><button onClick={() => setHistory(!history)}>{history ? 'Show open' : 'Show history'}</button></div>
    {!visible.length && <p>No {history ? 'saved' : 'open'} follow-ups for this job.</p>}
    {visible.map(row => {
      const href = row.status === 'open' ? smsDraftHref(project.client_phone, row.message, apple) : null;
      return <article key={row.id}><strong>{types[row.kind]} · {row.due_date}</strong><small>{row.status === 'open' && row.due_date <= today ? 'Due for review' : row.status}</small><p className="office-message">{row.message}</p>
        <div className="office-actions">{href && <a href={href}>Review in text app</a>}{row.status === 'open' && <><button disabled={pending || busy} onClick={() => save({ id: row.id, status: 'done' })}>Follow-up completed</button><button disabled={pending || busy} onClick={() => save({ id: row.id, status: 'paused' })}>Pause</button></>}{row.status !== 'open' && <button disabled={pending || busy} onClick={() => save({ id: row.id, status: 'open' })}>Reopen</button>}</div>
        {!project.client_phone && row.status === 'open' && <small>Add the homeowner’s mobile number to the job to prepare a text.</small>}
        <details><summary>Status history</summary>{(row.history || []).map((entry,index) => <p key={index}>{entry.status} · {new Date(entry.at).toLocaleString('en-US', {timeZone:'America/Denver'})} MT</p>)}</details>
      </article>;
    })}
    <p className="office-note">Opening the text app does not confirm delivery. Replies remain on your phone. Due dates are follow-up reminders, not confirmed appointments.</p>
  </section>;
}
export default function OfficeAssistant(props) {
  const session = useSyncExternalStore(subscribeAuthSession, getAuthSession, getAuthSession);
  return props.project?.id ? <Workspace key={`${session.epoch}:${props.project.id}`} {...props}/> : null;
}
