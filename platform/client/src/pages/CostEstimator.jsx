import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useApiList from '../hooks/useApiList';
import useEstimateDictation from '../hooks/useEstimateDictation';
import OutdoorTakeoff from '../components/OutdoorTakeoff';
import IndoorRoomScan from '../components/IndoorRoomScan';
import { requestJson, requestPdf } from '../utils/api';
import { getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';
import { ESTIMATE_TRADES, createEstimate, createLine, getTradeItems, suggestTrades, calculateEstimate, buildBidPayload } from '../utils/quickEstimate';
import './CostEstimator.css';

// Retain unsaved work across navigation, never across account changes or reloads.
const worksheets = new Map();
subscribeAuthSession(() => worksheets.clear());
const money = value => value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const categories = ['Materials', 'Labor', 'Equipment', 'Other'];
const siteConsiderations = [
  ['Access & equipment', 'Confirm gate width, equipment access, staging, and protection of existing landscaping.'],
  ['Soil & excavation', 'Review soil, rock, slope, excavation, and any imported or removed material.'],
  ['Water / electric / sewer', 'Confirm utility locations, connection points, capacity, and trade quotes before excavation.'],
  ['Drainage', 'Review grading, drainage direction, and protection of adjacent property.'],
  ['Hauling & disposal', 'Confirm haul quantities, disposal charges, and delivery access.'],
  ['Permits & inspections', 'Confirm required permits, inspections, and design details for this scope.'],
  ['Weather & scheduling', 'Review the project forecast and allow for weather-sensitive work and curing requirements.'],
];
const validDecimal = value => /^\d+(\.\d{1,2})?$/.test(String(value).trim());
const lineDirectCost = item => validDecimal(item.qty) && validDecimal(item.unit_cost)
  && Number(item.qty) > 0 && Number(item.qty) <= 1000000 && Number(item.unit_cost) <= 1000000
  ? Number(item.qty) * Number(item.unit_cost) : null;

function Amount({ label, value, className = '' }) {
  return <div className={className}><dt>{label}</dt><dd>{money(value)}</dd></div>;
}

export default function CostEstimator() {
  const location = useLocation();
  const [owner] = useState(getAuthSession);
  useSyncExternalStore(subscribeAuthSession, getAuthSession);
  const key = `${owner.epoch}:${owner.userId}`;
  const record = useRef(worksheets.get(key) || { estimate: createEstimate(), status: 'editing', saved: null });
  const [estimate, setEstimate] = useState(record.current.estimate);
  const [status, setStatus] = useState(record.current.status === 'saving' ? 'uncertain' : record.current.status);
  const [saved, setSaved] = useState(record.current.saved);
  const [feedback, setFeedback] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [environment, setEnvironment] = useState(record.current.environment || (new URLSearchParams(location.search).get('mode') === 'indoor' ? 'indoor' : 'outdoor'));
  const mounted = useRef(true);
  const clients = useApiList('/api/clients');
  const current = isAuthSessionCurrent(owner);
  const locked = status !== 'editing';
  const totals = calculateEstimate(estimate);
  const unresolvedCosts = estimate.items.length - totals.pricedCount;
  const suggested = suggestTrades(estimate.scope);
  const trades = ESTIMATE_TRADES.filter(trade => environment === 'all' || trade.environment === 'both' || trade.environment === environment);
  const dictation = useEstimateDictation({ owner, value: estimate.scope, onChange: scope => edit({ scope }) });

  useEffect(() => {
    mounted.current = true;
    if (isAuthSessionCurrent(owner)) worksheets.set(key, record.current);
    return () => { mounted.current = false; };
  }, [key, owner]);

  function edit(patch) {
    if (!isAuthSessionCurrent(owner) || record.current.status !== 'editing') return;
    const next = { ...record.current.estimate, ...patch };
    record.current.estimate = next; worksheets.set(key, record.current);
    setEstimate(next); setFeedback('');
  }
  function editLine(id, field, value) {
    edit({ items: estimate.items.map(item => item.id === id ? { ...item, [field]: value } : item) });
  }
  function addTrade(id) {
    const lines = getTradeItems(id);
    if (estimate.items.length + lines.length > 100) { setFeedback('Keep a worksheet to 100 line items.'); return; }
    const trade = ESTIMATE_TRADES.find(item => item.id === id);
    edit({ title: estimate.title || `${trade.label} estimate`, items: [...estimate.items, ...lines] });
    setFeedback(`${trade.label} checklist added. Enter measured quantities and your costs.`);
  }
  function addLine() {
    if (estimate.items.length >= 100) return;
    edit({ items: [...estimate.items, createLine()] });
  }
  function addMeasurement(result) {
    if (!result.ready || estimate.items.length >= 100) return;
    edit({ items: [...estimate.items, createLine({ description: result.description, qty: String(result.quantity), unit: result.unit })] });
    setFeedback(`${result.quantity} ${result.unit} added as a new line. Enter the unit cost and check for overlapping items.`);
  }
  function rememberMeasurement(draft) {
    if (!isAuthSessionCurrent(owner) || record.current.status !== 'editing') return;
    record.current.takeoff = draft;
    worksheets.set(key, record.current);
  }
  function canEditScan() { return isAuthSessionCurrent(owner) && record.current.status === 'editing'; }
  function rememberScan(draft) {
    if (!canEditScan()) return;
    record.current.scanDraft = draft; worksheets.set(key, record.current);
  }
  function changeEnvironment(value) {
    if (!canEditScan()) return;
    record.current.environment = value; worksheets.set(key, record.current);
    setEnvironment(value);
  }
  function addScanItems(rows, scan) {
    if (!canEditScan() || !scan.ready) return false;
    const existing = record.current.estimate;
    const additions = rows.filter(row => !existing.items.some(item => item.scanKey === row.scanKey));
    if (!additions.length || additions.length + existing.items.length > 100) return false;
    const items = additions.map(row => createLine({ category: row.category, description: row.description, qty: row.qty, unit: row.unit, unit_cost: '', scanKey: row.scanKey }));
    edit({ title: existing.title || `${scan.source.mode === 'fixture' ? 'Sample room' : scan.rooms[0].name} estimate`, items: [...existing.items, ...items] });
    setFeedback(`${items.length} reviewed scan ${items.length === 1 ? 'quantity' : 'quantities'} added. Enter costs before saving the bid.`);
    return true;
  }
  function addSiteNote(note) {
    const text = `Site review needed: ${note}`;
    if (estimate.scope.includes(text)) return;
    const scope = [estimate.scope, text].filter(Boolean).join('\n');
    if (scope.length > 5000) { setFeedback('The scope is full. Shorten it before adding another site review note.'); return; }
    edit({ scope });
    setFeedback('Site review note added to the customer-facing scope. No charge added.');
  }
  function startNew() {
    if (status === 'saving' || dictation.listening) return;
    if (status === 'uncertain' && !window.confirm('A previous save may have succeeded. Check Customer estimates first. Start a separate, empty worksheet?')) return;
    if (status === 'editing' && (estimate.items.length || estimate.scope || estimate.title || Object.values(record.current.takeoff?.inputs || {}).some(Boolean) || record.current.scanDraft?.result) && !window.confirm('Start a new estimate? Unsaved entries in this worksheet will be cleared.')) return;
    const next = { estimate: createEstimate(), status: 'editing', saved: null, resetId: (record.current.resetId || 0) + 1 };
    record.current = next; worksheets.set(key, next);
    setEstimate(next.estimate); setStatus('editing'); setSaved(null); setFeedback(''); setEnvironment('outdoor');
  }
  async function save() {
    if (!isAuthSessionCurrent(owner) || record.current.status !== 'editing' || dictation.listening) return;
    let payload;
    try { payload = buildBidPayload(record.current.estimate); }
    catch (error) { setFeedback(error.message); return; }
    const attempt = record.current;
    attempt.status = 'saving'; worksheets.set(key, attempt);
    setStatus('saving'); setFeedback('');
    try {
      const result = await requestJson('/api/bids', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), authSession: owner,
      });
      if (!Number.isInteger(Number(result?.id)) || Number(result.id) <= 0 || result.status !== 'draft'
        || typeof result.bid_number !== 'string' || !result.bid_number || !Array.isArray(result.items)
        || result.items.length !== payload.items.length || result.totals?.total == null || result.totals.total === '' || !Number.isFinite(Number(result.totals?.total))
        || Math.abs(Number(result.totals.total) - calculateEstimate(attempt.estimate).total) > 0.005) {
        throw new Error('The saved bid could not be verified.');
      }
      if (!isAuthSessionCurrent(owner) || worksheets.get(key) !== attempt) return;
      attempt.status = 'saved'; attempt.saved = result;
      worksheets.set(key, attempt);
      if (mounted.current) { setSaved(result); setStatus('saved'); setFeedback(`${result.bid_number} saved as a draft. No invoice or message was sent.`); }
    } catch (error) {
      if (!isAuthSessionCurrent(owner) || worksheets.get(key) !== attempt) return;
      // A failed response does not prove the POST failed to create a record.
      attempt.status = 'uncertain'; worksheets.set(key, attempt);
      if (mounted.current) { setStatus('uncertain'); setFeedback(error.message); }
    }
  }
  async function pdf() {
    if (!saved || pdfBusy || !current) return;
    setPdfBusy(true); setFeedback('');
    try { await requestPdf(`/api/bids/${encodeURIComponent(saved.id)}/pdf`, { method: 'POST', authSession: owner }, `${saved.bid_number}.pdf`); }
    catch (error) { if (mounted.current && isAuthSessionCurrent(owner)) setFeedback(error.message); }
    finally { if (mounted.current && isAuthSessionCurrent(owner)) setPdfBusy(false); }
  }

  const customer = clients.data.find(client => String(client.id) === estimate.client_id);
  if (!current) return <main className="cost-estimator"><p>Sign in again to continue estimating.</p></main>;

  return <main className="cost-estimator">
    <header className="estimate-hero estimate-no-print">
      <div><span className="estimate-eyebrow">ABQ ADU / Field tools</span><h1>Cost estimator<span>.</span></h1><p>Inside the house. Out in the yard. Build a number you can explain.</p></div>
      <div className="estimate-hero-actions"><Link to="/bids">Customer estimates ↗</Link><button onClick={startNew} disabled={status === 'saving' || dictation.listening}>New estimate</button></div>
    </header>
    <div className="estimate-shell estimate-no-print">
      <div className="estimate-path" aria-label="Estimate workflow"><span><b>01</b> Capture scope</span><span><b>02</b> Price the work</span><span><b>03</b> Review &amp; save</span></div>
      <div className="estimate-layout">
        <div className="estimate-work">
          <section className="estimate-panel" aria-labelledby="estimate-scope-heading">
            <div className="estimate-section-title"><span>01</span><div><h2 id="estimate-scope-heading">Start with the work</h2><p>A short description or a quick voice note.</p></div></div>
            <fieldset disabled={locked}><legend className="estimate-sr">Job details</legend>
              <label htmlFor="estimate-title">Estimate name<input id="estimate-title" maxLength={200} placeholder="Backyard concrete patio" value={estimate.title} onChange={event => edit({ title: event.target.value })}/></label>
              <div className="estimate-scope-label"><label htmlFor="estimate-scope">Scope &amp; customer-facing notes</label>{dictation.supported && <button type="button" onClick={dictation.toggle} aria-pressed={dictation.listening}>{dictation.listening ? 'Stop dictation' : 'Dictate scope'}</button>}</div>
              <textarea id="estimate-scope" maxLength={5000} rows={4} readOnly={dictation.listening} placeholder="Example: Replace the backyard patio, prepare the base, pour concrete, and haul away debris." value={estimate.scope} onChange={event => edit({ scope: event.target.value })}/>
              <p className="estimate-help">{dictation.supported ? 'Dictation uses your browser’s speech service. Review these notes before including them in a bid.' : 'On your phone, use the keyboard microphone to dictate. These notes appear in the customer bid.'}</p>
              {dictation.message && <p role="status" className="estimate-help">{dictation.message}</p>}
              <label htmlFor="estimate-client">Customer <small>Optional</small><select id="estimate-client" value={estimate.client_id} onChange={event => edit({ client_id: event.target.value })} disabled={clients.loading || Boolean(clients.error)}><option value="">Assign later in Customer estimates</option>{clients.data.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
              {clients.error && <p role="alert" className="estimate-help">Customers could not load. You can continue without assigning one. <button type="button" onClick={clients.reload}>Retry customers</button></p>}
            </fieldset>
          </section>
          <section className="estimate-panel" aria-labelledby="estimate-items-heading">
            <div className="estimate-section-title"><span>02</span><div><h2 id="estimate-items-heading">Build your cost worksheet</h2><p>Start with a checklist. Add your quantities and supplier or crew costs.</p></div></div>
            <fieldset disabled={locked || dictation.listening}><legend className="estimate-sr">Estimate line items</legend>
              <div className="estimate-environments" role="group" aria-label="Work location">{[['outdoor','Outdoor'],['indoor','Indoor'],['all','All work']].map(([id, label]) => <button type="button" key={id} aria-pressed={environment === id} onClick={() => changeEnvironment(id)}>{label}</button>)}</div>
              <p className="estimate-help">{environment === 'outdoor' ? 'Build beyond the interior: site preparation, utilities, exterior finishes, and yard improvements.' : 'Choose the work packages for this job. Changing this view keeps every item in your worksheet.'}</p>
              {environment !== 'outdoor' && <IndoorRoomScan key={`scan:${key}:${record.current.resetId || 0}`} initialDraft={record.current.scanDraft} onDraftChange={rememberScan} onAdd={addScanItems} canEdit={canEditScan} existingKeys={estimate.items.map(item => item.scanKey).filter(Boolean)} remainingLines={100 - estimate.items.length}/>}
              <div className="estimate-trades" aria-label="Trade checklists">{trades.map(trade => <button type="button" key={trade.id} className={suggested.includes(trade.id) ? 'estimate-trade-suggested' : ''} onClick={() => addTrade(trade.id)}>{trade.label}{suggested.includes(trade.id) && <small>Matches your notes</small>}</button>)}</div>
              <p className="estimate-help">Checklists suggest work to review; quantities and prices need your confirmation.</p>
              <details className="estimate-manual-measurements" open={environment === 'outdoor' || undefined}><summary>{environment === 'indoor' ? 'Enter measurements manually' : 'Outdoor quantity calculators'}</summary><OutdoorTakeoff key={`${key}:${record.current.resetId || 0}`} onAdd={addMeasurement} full={estimate.items.length >= 100} initialDraft={record.current.takeoff} onDraftChange={rememberMeasurement} indoor={environment === 'indoor'}/></details>
              {environment !== 'indoor' && <details className="estimate-site-review"><summary>Check the site before pricing</summary><p className="estimate-help">Tap a consideration to add a review note to the customer scope. These are items to confirm, and do not add charges.</p><div className="estimate-site-options">{siteConsiderations.map(([label, note]) => <button type="button" key={label} aria-pressed={estimate.scope.includes(`Site review needed: ${note}`)} onClick={() => addSiteNote(note)}>{estimate.scope.includes(`Site review needed: ${note}`) ? '✓ ' : '+ '}{label}</button>)}</div><Link to="/command-center#project-helper">Review project weather &amp; schedule →</Link></details>}

              {!estimate.items.length && <div className="estimate-empty"><span aria-hidden="true">＋</span><h3>Your worksheet starts here.</h3><p>Choose a trade above or add your first line item.</p></div>}
              <div className="estimate-items">{estimate.items.map((item, index) => <article className="estimate-item" key={item.id} aria-label={`Line item ${index + 1}`}>
                <div className="estimate-item-heading"><span>Item {String(index + 1).padStart(2, '0')}</span><button type="button" aria-label={`Remove line item ${index + 1}`} onClick={() => edit({ items: estimate.items.filter(row => row.id !== item.id) })}>Remove</button></div>
                <label htmlFor={`estimate-desc-${item.id}`}>Work or material<input id={`estimate-desc-${item.id}`} maxLength={300} value={item.description} onChange={event => editLine(item.id, 'description', event.target.value)} placeholder="Concrete placement labor"/></label>
                <div className="estimate-line-fields">
                  <label htmlFor={`estimate-category-${item.id}`}>Type<select id={`estimate-category-${item.id}`} value={item.category} onChange={event => editLine(item.id, 'category', event.target.value)}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
                  <label htmlFor={`estimate-qty-${item.id}`}>Quantity<input id={`estimate-qty-${item.id}`} inputMode="decimal" value={item.qty} onChange={event => editLine(item.id, 'qty', event.target.value)}/></label>
                  <label htmlFor={`estimate-unit-${item.id}`}>Unit<input id={`estimate-unit-${item.id}`} maxLength={20} value={item.unit} list="estimate-unit-options" onChange={event => editLine(item.id, 'unit', event.target.value)}/></label>
                  <label htmlFor={`estimate-cost-${item.id}`}>Unit cost ($)<input id={`estimate-cost-${item.id}`} inputMode="decimal" placeholder="Needs pricing" value={item.unit_cost} onChange={event => editLine(item.id, 'unit_cost', event.target.value)}/></label>
                </div>
                <div className="estimate-line-total"><span>Direct cost</span><b>{lineDirectCost(item) === null ? 'Needs pricing' : money(lineDirectCost(item))}</b></div>
              </article>)}</div>
              <datalist id="estimate-unit-options">{['ea','hr','sq ft','linear ft','cu yd','day','job'].map(unit => <option key={unit} value={unit}/>)}</datalist>
              <button className="estimate-add" type="button" disabled={estimate.items.length >= 100} onClick={addLine}>+ Add line item</button>
            </fieldset>
          </section>
        </div>
        <aside className="estimate-review" aria-labelledby="estimate-review-heading">
          <span className="estimate-eyebrow">03 / Review the number</span><h2 id="estimate-review-heading">Every dollar,<br/>accounted for.</h2>
          <div className="estimate-status">{status === 'saved' ? 'Saved draft' : unresolvedCosts ? `${unresolvedCosts} ${unresolvedCosts === 1 ? 'item needs' : 'items need'} pricing` : totals.ready ? 'Ready for your review' : 'Worksheet in progress'}</div>
          <fieldset disabled={locked || dictation.listening}><legend className="estimate-sr">Pricing allowances</legend>
            <label htmlFor="estimate-markup">Overhead &amp; profit markup (%)<input id="estimate-markup" inputMode="decimal" value={estimate.markup_pct} onChange={event => edit({ markup_pct: event.target.value })}/></label>
            <div className="estimate-presets"><button type="button" onClick={() => edit({ markup_pct: '60' })}>Use 60%</button><button type="button" onClick={() => edit({ markup_pct: '100' })}>100% target</button></div>
            <p className="estimate-help">Markup is added to direct costs. A 100% markup doubles direct costs before contingency and tax.</p>
            <div className="estimate-rate-fields"><label htmlFor="estimate-contingency">Contingency (%)<input id="estimate-contingency" inputMode="decimal" value={estimate.contingency_pct} onChange={event => edit({ contingency_pct: event.target.value })}/></label><label htmlFor="estimate-tax">Reviewed tax rate (%)<input id="estimate-tax" inputMode="decimal" placeholder="Confirm rate" value={estimate.tax_pct} onChange={event => edit({ tax_pct: event.target.value })}/></label></div>
            <p className="estimate-help">Confirm the applicable tax treatment and rate. Enter 0 only when appropriate.</p>
          </fieldset>
          <dl className="estimate-totals"><Amount label={unresolvedCosts ? 'Priced direct costs so far' : 'Direct costs'} value={totals.subtotal}/><Amount label="Overhead & profit" value={totals.markup}/><Amount label="Contingency" value={totals.contingency}/><Amount label="Before tax" value={totals.preTax}/><Amount label="Tax" value={totals.tax}/><Amount className="estimate-grand-total" label="Estimate total" value={totals.total}/></dl>
          {!totals.ready && <details className="estimate-checks"><summary>What’s left to review?</summary><ul>{totals.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></details>}
          {feedback && <p role={status === 'uncertain' ? 'alert' : 'status'} className="estimate-feedback">{feedback}</p>}
          {status === 'uncertain' && <div role="alert" className="estimate-feedback"><b>Save could not be confirmed.</b><p>Check Customer estimates for this bid before starting another worksheet. Your entries are preserved here.</p><Link to="/bids">Check Customer estimates →</Link></div>}
          {status === 'saved' ? <><button className="estimate-primary" onClick={pdf} disabled={pdfBusy}>{pdfBusy ? 'Preparing PDF…' : 'Download customer bid PDF'}</button><Link className="estimate-secondary-link" to="/bids">Manage {saved?.bid_number} in Customer estimates →</Link></> : <button className="estimate-primary" disabled={!totals.ready || locked || dictation.listening} onClick={save}>{status === 'saving' ? 'Saving draft…' : 'Save draft bid'}</button>}
          <button className="estimate-print" disabled={!totals.ready || status === 'saving' || dictation.listening} onClick={() => window.print()}>Print / save cost worksheet</button>
          <p className="estimate-help">Saving creates a draft in Customer estimates. Review it there before sending or generating invoices.</p>
          <p className="estimate-draft-note">Unsaved edits stay available while navigating this tab. Refreshing clears them; save your bid to keep it.</p>
        </aside>
      </div>
    </div>
    <section className="estimate-print-sheet" aria-label="Printable contractor cost worksheet">
      <p>ABQ ADU · Contractor worksheet · Draft</p><h1>{estimate.title || 'Cost estimate'}</h1>{!totals.ready && <p>Incomplete worksheet — quantities, costs, or terms still need review.</p>}{customer && <p>Customer: {customer.name}</p>}<p className="estimate-print-scope">{estimate.scope}</p>
      <table><thead><tr><th>Type / work</th><th>Quantity</th><th>Unit cost</th><th>Direct cost</th></tr></thead><tbody>{estimate.items.map(item => <tr key={item.id}><td>{item.category} — {item.description}</td><td>{String(item.qty).trim() || 'Needs quantity'} {item.unit}</td><td>{validDecimal(item.unit_cost) && Number(item.unit_cost) <= 1000000 ? money(Number(item.unit_cost)) : 'Needs pricing'}</td><td>{lineDirectCost(item) === null ? 'Needs pricing' : money(lineDirectCost(item))}</td></tr>)}</tbody></table>
      <dl className="estimate-totals"><Amount label="Priced direct costs" value={totals.subtotal}/><Amount label={`Overhead & profit (${estimate.markup_pct}%)`} value={totals.markup}/><Amount label={`Contingency (${estimate.contingency_pct}%)`} value={totals.contingency}/><Amount label={estimate.tax_pct === '' ? 'Tax (unconfirmed)' : `Tax (${estimate.tax_pct}%)`} value={totals.tax}/><Amount label="Estimate total" value={totals.total}/></dl>
      <p>Internal cost worksheet. Contains contractor costs and markup. No invoice or payment request.</p>
    </section>
  </main>;
}
