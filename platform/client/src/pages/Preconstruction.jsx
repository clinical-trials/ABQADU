import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { requestJson } from '../utils/api';
import { getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';
import usePreconstructionPdf from '../hooks/usePreconstructionPdf';
import { PacketPdfStatus } from '../components/ClientPacket';
import './Preconstruction.css';

const endpoint = '/api/preconstruction';
const fields = ['contractor_name','contractor_address','contractor_phone','contractor_email','license_number','license_classification','owner_name','owner_email','owner_phone','property_address','project_description','fee','construction_estimate','fee_credit','tax_treatment','tax_amount','scope','exclusions','schedule','payment_terms','termination_terms','estimate_assumptions','third_party_costs','notice_review','notice_details'];
const partyFields = ['contractor_name','contractor_address','contractor_phone','contractor_email','license_number','license_classification','owner_name','owner_email','owner_phone','property_address'];
const jobFields = [...partyFields,'project_description','construction_estimate'];
const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const textLimits = { contractor_name:200,contractor_address:500,contractor_phone:40,contractor_email:200,license_number:100,license_classification:100,owner_name:200,owner_email:200,owner_phone:40,property_address:500,project_description:2000,scope:6000,exclusions:4000,schedule:2000,payment_terms:3000,termination_terms:4000,estimate_assumptions:4000,third_party_costs:3000,notice_details:4000 };
// Unsaved edits survive internal navigation in this tab, for this session only.
const drafts = new Map();
subscribeAuthSession(() => drafts.clear());
const date = value => new Date(value).toLocaleString('en-US', { month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Denver' });
const money = value => Number.isSafeInteger(value) ? (value / 100).toLocaleString('en-US', { style:'currency',currency:'USD' }) : 'To be confirmed';
const same = (one, two) => fields.every(key => one?.[key] === two?.[key]);
function newRequestId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  if (!window.crypto?.getRandomValues) throw new Error('This browser cannot safely identify a save. Open the app in a current browser using HTTPS or localhost.');
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function cents(value) {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, part = ''] = value.trim().split('.');
  const result = Number(whole) * 100 + Number(part.padEnd(2, '0'));
  return result <= 10000000000 ? result : null;
}
function totalsFor(terms) {
  const fee = cents(terms.fee), tax = cents(terms.tax_amount);
  return { currency:'USD',fee_cents:fee,construction_estimate_cents:cents(terms.construction_estimate),tax_cents:terms.tax_treatment === 'unconfirmed' ? null : tax,
    invoice_total_cents:fee === null ? null : terms.tax_treatment === 'included' ? fee : terms.tax_treatment === 'additional' && tax !== null ? fee + tax : null };
}
function checkTerms(terms) {
  if (!terms || !fields.every(key => typeof terms[key] === 'string')
    || !['unconfirmed','separate','credited'].includes(terms.fee_credit)
    || !['unconfirmed','included','additional'].includes(terms.tax_treatment)
    || !['unconfirmed','required','not_applicable'].includes(terms.notice_review)) throw new Error('The saved agreement could not be read. Reload before continuing.');
  return terms;
}
function termsForSubmission(terms) {
  const normalized = Object.fromEntries(fields.map(field => [field,terms[field].trim()]));
  const numbers = totalsFor(normalized);
  if (numbers.fee_cents === null || numbers.fee_cents <= 0 || (normalized.construction_estimate && cents(normalized.construction_estimate) === null) || (normalized.tax_amount && cents(normalized.tax_amount) === null)
    || (normalized.tax_treatment === 'included' && numbers.tax_cents > numbers.fee_cents)) {
    throw new Error('Use valid dollar amounts up to $100,000,000 with at most two decimals. The fee must be positive; included tax cannot exceed the fee.');
  }
  return normalized;
}
function checkAgreement(record, projectId) {
  if (!record || record.project_id !== projectId || typeof record.id !== 'string' || !uuid.test(record.version)
    || !Number.isSafeInteger(record.revision) || record.revision < 1 || !Number.isFinite(Date.parse(record.saved_at))
    || !Array.isArray(record.review_items) || !record.review_items.every(item => typeof item === 'string')) throw new Error('The saved agreement version could not be verified. Reload before continuing.');
  checkTerms(record.terms);
  const totals = totalsFor(record.terms);
  if (totals.fee_cents === null || !Object.keys(totals).every(key => record.totals?.[key] === totals[key])) throw new Error('The saved agreement amounts could not be verified. Reload before continuing.');
  return record;
}

function TextField({ name, label, terms, onChange, multiline = false, note, ...props }) {
  const Input = multiline ? 'textarea' : 'input';
  return <label className={`precon-field ${multiline ? 'precon-wide' : ''}`} htmlFor={`precon-${name}`}>
    <span>{label}</span>
    <Input id={`precon-${name}`} name={name} value={terms[name]} onChange={event => onChange(name, event.target.value)} maxLength={textLimits[name] || 20} rows={multiline ? 4 : undefined} {...props}/>
    {note && <small>{note}</small>}
  </label>;
}
function Choice({ name, label, terms, onChange, options, note }) {
  return <label className="precon-field" htmlFor={`precon-${name}`}><span>{label}</span><select id={`precon-${name}`} value={terms[name]} onChange={event => onChange(name,event.target.value)}>{options.map(([value,caption]) => <option key={value} value={value}>{caption}</option>)}</select>{note && <small>{note}</small>}</label>;
}

function AgreementEditor({ projectId, owner, onDirty, demo = false }) {
  const [data, setData] = useState(null), [terms, setTerms] = useState(null), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [conflict, setConflict] = useState(false), [reload, setReload] = useState(0);
  const request = useRef(null), mounted = useRef(true), pending = useRef(false), saveController = useRef(null);
  const [templateLoading,setTemplateLoading] = useState(false);
  const templateController = useRef(null), edits = useRef(0);
  const pdf = usePreconstructionPdf(projectId,{demo});
  const key = `${owner.epoch}:${demo ? 'demo' : 'project'}:${projectId}`;
  const dirty = !!terms && !same(terms, data?.agreement?.terms || data?.defaults);
  const needsSave = dirty || !data?.agreement;
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null); setTerms(null);
    requestJson(demo ? `${endpoint}/demo` : `${endpoint}/projects/${encodeURIComponent(projectId)}`, { authSession:owner,signal:controller.signal }).then(payload => {
      if (controller.signal.aborted || !isAuthSessionCurrent(owner)) return;
      if (payload?.project?.id !== projectId || !Array.isArray(payload.history) || !payload.history.every(row => uuid.test(row.version) && Number.isInteger(row.revision) && row.revision > 0 && Number.isFinite(Date.parse(row.saved_at)))) throw new Error('The agreement history could not be read. Please reload.');
      if (demo && (payload.demo !== true || payload.agreement !== null || payload.history.length || typeof payload.project.client !== 'string' || typeof payload.project.address !== 'string')) throw new Error('The editable demo could not be verified. Please reload.');
      if (!demo && payload.demo === true) throw new Error('A demo cannot be used as a saved job agreement. Please reload.');
      checkTerms(payload.defaults);
      if (payload.agreement !== null) checkAgreement(payload.agreement, projectId);
      const cached = drafts.get(key);
      const changed = !!cached && cached.base_version !== (payload.agreement?.version || null);
      setData(payload); setTerms(cached?.terms || payload.agreement?.terms || payload.defaults);
      setConflict(changed); request.current = cached?.request || null;
      if (changed) setError('A newer draft was saved while you were away. Your unsaved text is preserved below. Copy anything you need, then discard edits and reload.');
      else if (cached) setMessage('Your unsaved draft was restored in this tab.');
    }).catch(failure => { if (!controller.signal.aborted && isAuthSessionCurrent(owner)) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted && isAuthSessionCurrent(owner)) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); saveController.current?.abort(); templateController.current?.abort(); };
  }, [projectId,owner,key,reload,demo]);
  useEffect(() => {
    onDirty(dirty || saving);
    if ((dirty || request.current) && data && isAuthSessionCurrent(owner)) {
      const previous = drafts.get(key);
      drafts.set(key, { terms,base_version:conflict && previous ? previous.base_version : data.agreement?.version || null,request:request.current });
    } else if (data && !saving && !conflict && !request.current) drafts.delete(key);
  }, [dirty,saving,onDirty,data,terms,key,owner,conflict]);
  useEffect(() => {
    const guard = event => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload',guard);
    return () => window.removeEventListener('beforeunload',guard);
  }, [dirty,saving]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const change = (name, value) => {
    edits.current += 1;
    pdf.clear(); setTerms(previous => ({ ...previous,[name]:value })); setMessage('');
    if (!conflict) setError('');
  };
  const discard = () => {
    edits.current += 1; templateController.current?.abort(); templateController.current = null; setTemplateLoading(false);
    pdf.clear(); drafts.delete(key); request.current = null; setConflict(false); setMessage('');
    // Remove the old editor state in the same render. Otherwise its caching
    // effect can restore discarded text before the fresh GET completes.
    setData(null); setTerms(null); setLoading(true);
    setReload(value => value + 1);
  };
  async function save(event) {
    event.preventDefault();
    if (pending.current || conflict || templateController.current || !terms || !data) return;
    let normalized;
    try { normalized = termsForSubmission(terms); } catch (failure) { setError(failure.message); return; }
    if (demo) { setError(''); pdf.open(normalized); return; }
    const signature = JSON.stringify({ expected_version:data.agreement?.version || null,terms:normalized });
    try {
      if (!request.current || request.current.signature !== signature) request.current = { signature,body:{ request_id:newRequestId(),expected_version:data.agreement?.version || null,terms:normalized } };
    } catch (failure) { setError(failure.message); return; }
    const submitted = request.current;
    drafts.set(key, { terms,base_version:data.agreement?.version || null,request:submitted });
    const controller = new AbortController();
    saveController.current = controller;
    const unsubscribe = subscribeAuthSession(() => controller.abort());
    pending.current = true; setSaving(true); setError(''); setMessage(''); pdf.clear();
    try {
      const response = await requestJson(`${endpoint}/projects/${encodeURIComponent(projectId)}`, { method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(submitted.body),authSession:owner,signal:controller.signal });
      if (!mounted.current || controller.signal.aborted || !isAuthSessionCurrent(owner)) return;
      const agreement = checkAgreement(response?.agreement,projectId);
      if (typeof response.replayed !== 'boolean') throw new Error('The save acknowledgement could not be verified. Retry saving.');
      setData(previous => ({ ...previous,agreement,history:[{version:agreement.version,revision:agreement.revision,saved_at:agreement.saved_at}, ...previous.history.filter(row => row.version !== agreement.version)] }));
      setTerms(agreement.terms); request.current = null; drafts.delete(key);
      setMessage(response.replayed && !same(normalized,agreement.terms) ? 'Your earlier save was confirmed. A newer revision is now shown; review its terms before printing.' : `Draft revision ${agreement.revision} saved. Open the PDF to review or print.`);
    } catch (failure) {
      if (mounted.current && isAuthSessionCurrent(owner)) { setError(failure.message); setConflict(failure.status === 409); }
    } finally {
      unsubscribe(); pending.current = false;
      if (saveController.current === controller) saveController.current = null;
      if (mounted.current && isAuthSessionCurrent(owner)) setSaving(false);
    }
  }
  async function applyTemplate() {
    if (demo || !data || data.agreement || !terms || dirty || request.current || conflict || pending.current || templateController.current) return;
    const controller = new AbortController(), startedAt = edits.current;
    templateController.current = controller; setTemplateLoading(true); setError('');
    try {
      const payload = await requestJson(`${endpoint}/template`,{authSession:owner,signal:controller.signal});
      if (controller.signal.aborted || !mounted.current || !isAuthSessionCurrent(owner) || edits.current !== startedAt) return;
      if (payload?.template_id !== 'letter-agreement-v1' || typeof payload.label !== 'string') throw new Error('The letter-agreement template could not be verified.');
      checkTerms(payload.terms);
      if (!partyFields.every(field=>payload.terms[field]==='')) throw new Error('The reusable template contains party details and cannot be applied.');
      const businessTerms = Object.fromEntries(fields.filter(field=>!jobFields.includes(field)).map(field=>[field,payload.terms[field]]));
      pdf.clear(); setTerms(previous=>({...previous,...businessTerms}));
      setMessage('Letter-agreement business terms added to this unsaved draft. Review and edit them before saving; job details were preserved.');
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current && isAuthSessionCurrent(owner)) setError(failure.message);
    } finally {
      if (templateController.current === controller) templateController.current = null;
      if (mounted.current && isAuthSessionCurrent(owner)) setTemplateLoading(false);
    }
  }
  if (loading) return <p className="precon-feedback" role="status">{demo ? 'Loading the editable example…' : 'Loading the saved job and agreement…'}</p>;
  if (!terms || !data) return <div className="precon-feedback" role="alert"><p>{error || 'Agreement unavailable.'}</p><button onClick={discard}>Retry loading</button></div>;
  const amounts = totalsFor(terms);
  const clientBudget = typeof data.project.client_target_budget === 'string' ? data.project.client_target_budget.trim() : '';
  const shared = { terms,onChange:change };
  return <form className="precon-editor" onSubmit={save}>
    <div className="precon-workbar"><div><span className="precon-kicker">{demo ? 'Demo · editable example' : data.agreement ? `Saved revision ${data.agreement.revision}` : 'New draft'}</span><h2>{data.project.client || 'Homeowner'}</h2><p>{terms.property_address || data.project.address || 'Property address needed'}</p></div><span className="precon-draft-label">Draft · no payment due</span></div>
    <p className="precon-clause-note">Source-derived terms are editable proposals. Review any site inspection or waiver, lien and indemnity wording for the job. Opening this form does not complete an inspection, waive a right or confirm an approval.</p>
    {error && <div className="precon-feedback precon-error" role="alert"><p>{error}</p>{conflict && <p>Your edits are still below. Copy the text you want to keep before reloading the saved version.</p>}</div>}
    {message && <p className="precon-feedback" role="status">{message}</p>}
    <div className="precon-layout">
      <fieldset className="precon-inputs" disabled={saving || templateLoading}>
        <legend className="precon-sr">Preconstruction draft terms</legend>
        <details className="precon-section" open><summary><span>01</span><div>Scope &amp; deliverables<small>What the owner is buying before construction</small></div></summary><div className="precon-fields">
          <TextField {...shared} name="project_description" label="Project description" multiline/>
          <TextField {...shared} name="scope" label="Preconstruction services and deliverables" multiline note="Confirm the deliverables, number of revisions, and who provides each service."/>
          <TextField {...shared} name="schedule" label="Target schedule and milestones" multiline/>
          <TextField {...shared} name="exclusions" label="What is excluded" multiline/>
          <TextField {...shared} name="third_party_costs" label="Third-party services and expenses" multiline/>
        </div></details>
        <details className="precon-section" open><summary><span>02</span><div>Fee, estimate &amp; invoice<small>One fee carried through the agreement and draft invoice</small></div></summary><div className="precon-fields">
          <section className="precon-wide" aria-label="Client target budget from intake" style={{ padding: 16, borderRadius: 12, background: '#f4f1e9', overflowWrap: 'anywhere' }}>
            <b>Client target budget · from intake</b>
            <p style={{ margin: '8px 0' }}>{clientBudget || 'Not provided'}</p>
            <small>Homeowner-stated planning target from saved job intake. Set the preconstruction fee and invoice amount separately.</small>
          </section>
          <TextField {...shared} name="fee" label="Preconstruction fee (USD)" inputMode="decimal" note="$10,000 is a proposed starting amount. Confirm for this job."/>
          <TextField {...shared} name="construction_estimate" label="Preliminary construction estimate (USD)" inputMode="decimal" note="Optional planning estimate; this is not the amount being invoiced."/>
          <Choice {...shared} name="fee_credit" label="How the fee relates to construction" options={[["unconfirmed","To be confirmed"],["separate","Separate from the construction price"],["credited","Credit toward a future construction contract"]]}/>
          <Choice {...shared} name="tax_treatment" label="Gross receipts tax treatment" options={[["unconfirmed","To be confirmed"],["included","Included in the fee"],["additional","Add a reviewed tax amount"]]}/>
          {terms.tax_treatment !== 'unconfirmed' && <TextField {...shared} name="tax_amount" label={terms.tax_treatment === 'included' ? 'Included tax amount (USD, optional)' : 'Additional tax amount (USD)'} inputMode="decimal" note="Enter a verified amount. The app does not determine the applicable tax rate."/>}
          <TextField {...shared} name="payment_terms" label="Payment milestones and due terms" multiline note="Name each deliverable, amount, and payment trigger. This packet remains a draft."/>
          <TextField {...shared} name="termination_terms" label="Ending services and unused funds" multiline note="Confirm how completed work, approved expenses, and refunds will be handled."/>
          <TextField {...shared} name="estimate_assumptions" label="Construction estimate assumptions" multiline/>
        </div></details>
        <details className="precon-section"><summary><span>03</span><div>People &amp; property<small>Confirm the homeowner and the licensed business</small></div></summary><div className="precon-fields">
          <TextField {...shared} name="owner_name" label="Owner legal name(s)"/>
          <TextField {...shared} name="property_address" label="Property address"/>
          <TextField {...shared} name="owner_phone" label="Owner phone" type="tel"/>
          <TextField {...shared} name="owner_email" label="Owner email" type="email"/>
          <TextField {...shared} name="contractor_name" label="Contractor legal name" note="Use the verified licensed entity; the ABQ ADU brand may differ."/>
          <TextField {...shared} name="contractor_address" label="Contractor address"/>
          <TextField {...shared} name="contractor_phone" label="Contractor phone" type="tel"/>
          <TextField {...shared} name="contractor_email" label="Contractor email" type="email"/>
          <TextField {...shared} name="license_number" label="NM contractor license number"/>
          <TextField {...shared} name="license_classification" label="License classification"/>
        </div></details>
        <details className="precon-section"><summary><span>04</span><div>Review &amp; attachments<small>Required notices depend on the transaction</small></div></summary><div className="precon-fields">
          <Choice {...shared} name="notice_review" label="Cancellation notice applicability" options={[["unconfirmed","Needs review"],["required","Required: prepare the applicable forms"],["not_applicable","Reviewed: not applicable to this transaction"]]}/>
          <TextField {...shared} name="notice_details" label="Notice and disclosure review notes" multiline note="Record where/how the agreement is made and who reviewed applicability. Required CID disclosures and cancellation forms must accompany the final agreement; this tool does not attach them."/>
          <p className="precon-wide precon-muted">The completed draft needs business and legal review before client use. Saving a draft does not sign an agreement or issue an invoice.</p>
        </div></details>
      </fieldset>
      <aside className="precon-summary" aria-label="Packet summary">
        <span className="precon-kicker">Your three-part packet</span><h2>Ready for review.</h2>
        <ol className="precon-parts"><li><b>Services agreement</b><span>Scope, fee, terms, and signature spaces</span></li><li><b>Preliminary estimate</b><span>Construction planning amount and assumptions</span></li><li><b>Draft invoice</b><span>Preconstruction services only</span></li></ol>
        <dl className="precon-totals"><div><dt>Preconstruction fee</dt><dd>{money(amounts.fee_cents)}</dd></div><div><dt>{terms.tax_treatment === 'included' ? 'Tax included in fee' : 'Additional tax'}</dt><dd>{terms.tax_treatment === 'included' && amounts.tax_cents === null ? 'Not itemized' : money(amounts.tax_cents)}</dd></div><div className="precon-total"><dt>Draft invoice total</dt><dd>{money(amounts.invoice_total_cents)}</dd></div></dl>
        <p className="precon-muted">{terms.tax_treatment === 'unconfirmed' ? 'Confirm tax treatment before relying on an invoice total.' : 'Amounts are proposed. No payment is requested.'}</p>
        <div className="precon-estimate"><span>Preliminary construction estimate</span><strong>{money(amounts.construction_estimate_cents)}</strong><small>Shown separately from the preconstruction invoice.</small></div>
        <div className="precon-actions">{demo ? <button className="precon-primary" type="submit" disabled={pdf.loading}>{pdf.loading ? 'Preparing PDF…' : 'Open demo PDF'}</button> : <><button className="precon-primary" type="submit" disabled={saving || conflict || templateLoading || !needsSave}>{saving ? 'Saving draft…' : 'Save draft'}</button><button type="button" disabled={saving || needsSave || conflict || templateLoading || pdf.loading} onClick={() => pdf.open(data.agreement)}>{pdf.loading ? 'Preparing PDF…' : 'Open draft PDF'}</button></>}</div>
        <p className="precon-save-state" role="status">{demo ? 'Demo edits stay in this tab for this sign-in session. The PDF uses the current form; nothing is saved to a job.' : saving ? 'Saving this revision…' : dirty ? 'Unsaved changes. Save before printing.' : data.agreement ? `Revision ${data.agreement.revision} · ${date(data.agreement.saved_at)} MT` : 'Review the job details, then save your first draft.'}</p>
        {!demo && !data.agreement && <button type="button" className="precon-template-button" disabled={dirty || saving || conflict || !!request.current || templateLoading || pdf.loading} onClick={applyTemplate}>{templateLoading ? 'Loading template…' : 'Use letter-agreement template'}</button>}
        {(dirty || conflict) && <button className="precon-text-button" type="button" disabled={saving || templateLoading} onClick={discard}>{demo ? 'Reset demo edits' : 'Discard edits and reload saved version'}</button>}
        <PacketPdfStatus pdf={pdf}/>
        {!!data.agreement?.review_items.length && <details className="precon-review" open><summary>Before client use · {data.agreement.review_items.length} checks</summary>{dirty && <p>Checks below reflect the saved revision. Save to update them.</p>}<ul>{data.agreement.review_items.map((item,index) => <li key={index}>{item}</li>)}</ul></details>}
        {!!data.history.length && <details className="precon-history"><summary>Saved revisions · {data.history.length}</summary><ol>{data.history.map(row => <li key={row.version}><div><b>Revision {row.revision}</b><small>{date(row.saved_at)} MT</small></div><button type="button" disabled={dirty || saving || pdf.loading || conflict} onClick={() => pdf.open(row)} aria-label={`Open PDF for revision ${row.revision}`}>PDF</button></li>)}</ol></details>}
      </aside>
    </div>
  </form>;
}

export default function Preconstruction() {
  const [owner] = useState(getAuthSession);
  useSyncExternalStore(subscribeAuthSession,getAuthSession);
  const authorized = isAuthSessionCurrent(owner);
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') || '';
  const demo = params.get('demo') === '1';
  const [projects, setProjects] = useState(null), [error,setError] = useState(''), [refresh,setRefresh] = useState(0), [dirty,setDirty] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if (!authorized || demo) return () => controller.abort();
    setProjects(null); setError('');
    requestJson(endpoint,{authSession:owner,signal:controller.signal}).then(payload => {
      if (controller.signal.aborted || !isAuthSessionCurrent(owner)) return;
      if (!Array.isArray(payload?.projects) || !payload.projects.every(row => typeof row?.id === 'string' && typeof row.client === 'string' && typeof row.address === 'string')) throw new Error('The saved jobs could not be read. Try reloading.');
      setProjects(payload.projects);
    }).catch(failure => { if (!controller.signal.aborted && isAuthSessionCurrent(owner)) setError(failure.message); });
    return () => controller.abort();
  },[authorized,owner,refresh,demo]);
  if (!authorized) return null;
  const selected = projects?.find(row => row.id === projectId);
  return <main className="precon-page">
    <header className="precon-hero"><div><span className="precon-kicker">ABQ ADU · client documents</span><h1>A clear start.<br/>Before the build.</h1><p>Prepare the preconstruction agreement, estimate, and draft invoice together.</p></div><div className="precon-hero-note"><span aria-hidden="true">01 / 03</span><b>Agree on the groundwork.</b><p>Saved terms. Clear scope. One packet to review.</p></div></header>
    <div className="precon-shell">
      {demo ? <section className="precon-demo-banner" aria-label="Editable demo"><div><span className="precon-kicker">Letter agreement · demo</span><h2>Try the form. Review the packet.</h2><p>This fictional example uses reusable terms from the provided letter agreement. Edit any field, then open a demo PDF. No saved job, agreement revision or invoice is created.</p></div><Link to={projectId ? `/preconstruction?project=${encodeURIComponent(projectId)}` : '/preconstruction'}>{projectId ? 'Return to selected job' : 'Choose a saved job'}</Link></section> : <section className="precon-demo-entry" aria-label="Try the agreement demo"><div><h2>Explore the letter-agreement demo.</h2><p>Use the editable example without creating a job. Your saved-job drafts stay separate.</p></div><Link to={`/preconstruction?demo=1${projectId ? `&project=${encodeURIComponent(projectId)}` : ''}`}>Open editable demo</Link></section>}
      {!demo && <>
      <div className="precon-jobbar"><label htmlFor="precon-job"><span>Start with a saved job</span><select id="precon-job" value={projectId} disabled={!projects || dirty} onChange={event => setParams(event.target.value ? {project:event.target.value} : {})}><option value="">Choose a job…</option>{projects?.map(row => <option key={row.id} value={row.id}>{row.client || 'Homeowner'} · {row.address || row.model || row.id}</option>)}</select></label><Link to="/command-center">Back to jobs →</Link><Link to="/executive#preconstruction-cycle">Contract-to-deposit scorecard →</Link></div>
      {dirty && <p className="precon-muted">Save or discard your edits before switching jobs. Unsaved edits stay in this tab during workspace navigation.</p>}
      {error && <div className="precon-feedback" role="alert"><p>{error}</p><button onClick={() => setRefresh(value => value+1)}>Reload jobs</button></div>}
      {!projects && !error && <p role="status">Loading saved jobs…</p>}
      {projects?.length === 0 && <p className="precon-empty">Create a job in the command center first, then return here to prepare its agreement.</p>}
      {!!projects?.length && !selected && <div className="precon-empty"><span className="precon-kicker">Draft workspace</span><h2>{projectId ? 'That saved job is unavailable.' : 'Choose the job. We’ll fill in the basics.'}</h2><p>Review the proposed $10,000 fee, scope, and business details before saving. No invoice is issued here.</p></div>}
      </>}
      {(demo || selected) && <AgreementEditor key={`${owner.epoch}:${demo ? 'demo' : `project:${projectId}`}`} projectId={demo ? 'precon-demo' : projectId} demo={demo} owner={owner} onDirty={setDirty}/>}
    </div>
  </main>;
}
