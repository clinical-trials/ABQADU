import React, { useEffect, useMemo, useState } from 'react';

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

const styles = {
  page: { fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh', color: '#1C1917' },
  header: { background: '#1C1917', color: '#F0EBE1', padding: '22px clamp(16px, 4vw, 36px)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' },
  title: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: 'clamp(28px, 6vw, 46px)', margin: 0, letterSpacing: '.02em', lineHeight: 1 },
  badge: { background: '#C4954A', color: '#1C1917', borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' },
  shell: { padding: 'clamp(14px, 4vw, 28px)', display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, .65fr)', gap: 18 },
  card: { background: '#FFF', border: '1px solid #E7E0D5', borderRadius: 10, padding: 16, boxShadow: '0 10px 30px rgba(28,25,23,.05)' },
  cardDark: { background: '#0F1F3D', color: '#F0EBE1', borderRadius: 10, padding: 16, boxShadow: '0 10px 30px rgba(15,31,61,.12)' },
  kicker: { fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A8A29E', fontWeight: 900, marginBottom: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 },
  button: { border: 'none', borderRadius: 8, background: '#3D5247', color: '#FFF', padding: '12px 14px', minHeight: 44, fontSize: 13, fontWeight: 800, cursor: 'pointer' },
  ghost: { border: '1px solid #E7E0D5', borderRadius: 8, background: '#FFF', color: '#1C1917', padding: '12px 14px', minHeight: 44, fontSize: 13, fontWeight: 800, cursor: 'pointer' },
  input: { border: '1px solid #E7E0D5', borderRadius: 7, padding: '10px 11px', minHeight: 44, fontSize: 13, width: '100%', boxSizing: 'border-box' },
  miniCard: { padding: 12, background: '#FAF7F2', border: '1px solid #EFE7DA', borderRadius: 8 },
  label: { display: 'grid', gap: 5, fontSize: 12, fontWeight: 900, color: '#57534E' },
};

function useMobilePatch() {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 840px){
        .v10-shell{grid-template-columns:1fr!important}
        .v10-row{grid-template-columns:1fr!important}
        .v10-actions{position:sticky;bottom:0;background:#FAF7F2;padding:10px 0}
        .v10-header-action{width:100%;margin-left:0!important}
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
}

function Field({ label, children }) {
  return <label style={styles.label}>{label}{children}</label>;
}

function ProjectCard({ project, modelCatalog, onChange, onApplyModel, onCreateInvoices }) {
  const profitLow = Number(project.bid_total || 0) - Number(project.cogs_high || 0);
  const profitHigh = Number(project.bid_total || 0) - Number(project.cogs_low || 0);
  const invoices = project.invoice_drafts || [
    { id: `${project.id}-preconstruction`, label: 'Invoice 1: $10,000 Preconstruction', amount: 10000, status: 'Draft ready' },
  ];
  return (
    <article style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <input style={{ ...styles.input, fontSize: 18, fontWeight: 900 }} value={project.client} onChange={e => onChange(project.id, 'client', e.target.value)} />
          <input style={{ ...styles.input, marginTop: 6 }} value={project.address} onChange={e => onChange(project.id, 'address', e.target.value)} />
        </div>
        <select style={{ ...styles.input, width: 82, fontWeight: 900 }} value={project.confidence} onChange={e => onChange(project.id, 'confidence', e.target.value)}>
          {['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D', 'F'].map(g => <option key={g}>{g}</option>)}
        </select>
      </div>
      <div style={{ ...styles.grid, marginTop: 14 }}>
        <div>
          <div style={styles.kicker}>Project Intake</div>
          <Field label="Phone"><input style={styles.input} value={project.client_phone || ''} onChange={e => onChange(project.id, 'client_phone', e.target.value)} /></Field>
          <Field label="Email"><input style={styles.input} value={project.client_email || ''} onChange={e => onChange(project.id, 'client_email', e.target.value)} /></Field>
          <Field label="Preferred contact"><input style={styles.input} value={project.preferred_contact || 'Phone'} onChange={e => onChange(project.id, 'preferred_contact', e.target.value)} /></Field>
          <Field label="Best contact time"><input style={styles.input} value={project.best_contact_time || 'Morning'} onChange={e => onChange(project.id, 'best_contact_time', e.target.value)} /></Field>
        </div>
        <div>
          <div style={styles.kicker}>Model Select</div>
          <select style={styles.input} value={project.model_id || project.model} onChange={e => onChange(project.id, 'model_id', e.target.value)}>
            <option value={project.model}>{project.model || 'Choose model'}</option>
            {modelCatalog.map(model => <option key={model.id} value={model.id}>{model.name} · {model.sqft} sf</option>)}
          </select>
          <input style={{ ...styles.input, marginTop: 6 }} type="number" value={project.sqft} onChange={e => onChange(project.id, 'sqft', Number(e.target.value))} />
          <button style={{ ...styles.ghost, marginTop: 8, width: '100%' }} onClick={() => onApplyModel(project.id, project.model_id || project.model)}>Apply Model Defaults</button>
        </div>
        <div>
          <div style={styles.kicker}>Estimate / Invoice</div>
          <input style={styles.input} type="number" value={project.bid_total} onChange={e => onChange(project.id, 'bid_total', Number(e.target.value))} />
          <div style={{ fontSize: 13, marginTop: 6 }}>{fmt(Number(project.bid_total || 0) / Number(project.sqft || 1))}/sf customer price</div>
          <input style={{ ...styles.input, marginTop: 6 }} type="number" value={project.cogs_low} onChange={e => onChange(project.id, 'cogs_low', Number(e.target.value))} />
          <input style={{ ...styles.input, marginTop: 6 }} type="number" value={project.cogs_high} onChange={e => onChange(project.id, 'cogs_high', Number(e.target.value))} />
          <div style={{ fontSize: 13, marginTop: 6 }}>Profit {fmt(profitLow)} - {fmt(profitHigh)}</div>
          <button style={{ ...styles.button, marginTop: 8, width: '100%' }} onClick={() => onCreateInvoices(project.id)}>Create $10k Invoice</button>
        </div>
      </div>
      <div style={{ ...styles.grid, marginTop: 12 }}>
        {[
          ['Site visit', project.site_visit_status || 'Needs scheduling'],
          ['Utility review', project.utility_review_status || 'Needs utility review'],
          ['Sewer confirmation', project.sewer_confirmation_status || 'Needs sewer confirmation'],
          ['Setbacks / site plan', project.setbacks_site_plan_status || 'Needs site plan'],
        ].map(([label, value]) => (
          <div key={label} style={styles.miniCard}>
            <div style={styles.kicker}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ ...styles.grid, marginTop: 12 }}>
        {invoices.map(invoice => (
          <div key={invoice.id || invoice.label} style={styles.miniCard}>
            <b>{invoice.label || invoice.stage}</b>
            <div style={{ fontSize: 13 }}>{fmt(invoice.amount)} · {invoice.status || 'Draft'}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, padding: 11, borderRadius: 8, background: '#FAF7F2', fontSize: 13 }}>
        <input style={styles.input} value={project.status} onChange={e => onChange(project.id, 'status', e.target.value)} />
        <textarea style={{ ...styles.input, marginTop: 6 }} value={project.next_action} onChange={e => onChange(project.id, 'next_action', e.target.value)} />
      </div>
    </article>
  );
}

export default function CommandCenter() {
  useMobilePatch();
  const [state, setState] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [receiptText, setReceiptText] = useState("LOWE'S HOME IMPROVEMENT\n08/03/2026\nDrywall mud and house wrap\nTOTAL $284.76");
  const [liveStatus, setLiveStatus] = useState('');
  const [weatherZip, setWeatherZip] = useState('87106');
  const [weatherForecast, setWeatherForecast] = useState(null);

  const load = () => fetch('/api/command-center').then(r => r.json()).then(setState);
  const loadIntegrations = () => fetch('/api/integrations/status').then(r => r.json()).then(setIntegrations);
  useEffect(() => {
    load();
    loadIntegrations();
  }, []);

  const totals = useMemo(() => {
    const projects = state?.projects || [];
    const bidVolume = projects.reduce((sum, p) => sum + Number(p.bid_total || 0), 0);
    const cogsHigh = projects.reduce((sum, p) => sum + Number(p.cogs_high || 0), 0);
    const miles = (state?.mileage || []).reduce((sum, m) => sum + Number(m.miles || 0), 0);
    const receipts = (state?.receipts || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return { bidVolume, grossProfitFloor: bidVolume - cogsHigh, miles, receipts };
  }, [state]);

  const saveState = async (next) => {
    setSaving(true);
    const saved = await fetch('/api/command-center', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).then(r => r.json());
    setState(saved);
    setSaving(false);
  };

  const addActivity = async (type, detail) => {
    const saved = await fetch('/api/command-center/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, detail }),
    }).then(r => r.json());
    setState(saved);
  };

  const addReceipt = () => {
    const receipt = { id: `receipt-${Date.now()}`, vendor: 'New receipt', project: 'Unassigned', amount: 0, category: 'Materials', note: 'Tap to edit in the production receipt scanner.' };
    saveState({ ...state, receipts: [receipt, ...(state.receipts || [])] });
  };

  const addMileage = () => {
    const trip = { id: `mile-${Date.now()}`, date: new Date().toISOString().slice(0, 10), project: 'Unassigned', miles: 0, purpose: 'Builder trip.' };
    saveState({ ...state, mileage: [trip, ...(state.mileage || [])] });
  };

  const addProject = () => {
    const project = {
      id: `project-${Date.now()}`,
      client: 'New homeowner',
      address: 'Albuquerque, NM',
      model: 'Netherwood House',
      client_phone: '',
      client_email: '',
      preferred_contact: 'Phone',
      best_contact_time: 'Morning',
      site_visit_status: 'Needs scheduling',
      utility_review_status: 'Needs utility review',
      sewer_confirmation_status: 'Needs sewer confirmation',
      setbacks_site_plan_status: 'Needs site plan',
      sqft: 440,
      bid_total: 125400,
      cogs_low: 66000,
      cogs_high: 74800,
      confidence: 'B',
      status: 'Needs site data',
      next_action: 'Schedule site visit, confirm utilities, and prepare a first bid.',
    };
    saveState({ ...state, projects: [project, ...(state.projects || [])] });
  };

  const applyModelDefaults = async (projectId, model) => {
    const saved = await fetch(`/api/command-center/projects/${projectId}/apply-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).then(r => r.json());
    setState(saved);
  };

  const createInvoiceDrafts = async (projectId) => {
    const saved = await fetch(`/api/command-center/projects/${projectId}/invoice-drafts`, { method: 'POST' }).then(r => r.json());
    setState(saved);
  };

  const sendSupplierToCogs = async (quoteId) => {
    const projectId = state.projects?.[0]?.id;
    const saved = await fetch(`/api/command-center/projects/${projectId}/send-supplier-to-cogs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote_id: quoteId }),
    }).then(r => r.json());
    setState(saved);
  };

  const sendLiveSms = async () => {
    const res = await fetch('/api/integrations/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: state.builder.phone, body: note || primaryMessage }),
    });
    const payload = await res.json();
    setLiveStatus(res.ok ? `Live SMS sent: ${payload.sid}` : `SMS not sent: ${payload.error}`);
    if (res.ok) load();
  };

  const createStripePaymentLink = async () => {
    const project = state.projects[0];
    const res = await fetch('/api/integrations/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 10000,
        description: `$10,000 preconstruction invoice - ${project.client}`,
        client_email: '',
        metadata: { project_id: project.id, draw: 'preconstruction' },
      }),
    });
    const payload = await res.json();
    setLiveStatus(res.ok ? `Stripe payment link ready: ${payload.url}` : `Stripe not ready: ${payload.error}`);
    if (payload.url) window.open(payload.url, '_blank', 'noopener,noreferrer');
  };

  const parseReceiptOcr = async () => {
    const res = await fetch('/api/integrations/ocr/receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: receiptText, project: state.projects[0]?.client || 'Unassigned' }),
    });
    const payload = await res.json();
    setLiveStatus(res.ok ? `Receipt parsed: ${payload.receipt.vendor} ${fmt(payload.receipt.amount)}` : `OCR not ready: ${payload.error}`);
    if (res.ok) load();
  };

  const checkClerkLogin = async () => {
    const res = await fetch('/api/integrations/clerk/status');
    const payload = await res.json();
    setLiveStatus(payload.configured ? 'Clerk env is configured. Add ClerkProvider on the hosted client.' : `Clerk missing: ${payload.missing.join(', ') || 'token'}`);
  };

  const checkWeather = async () => {
    const res = await fetch(`/api/weather/forecast?zip=${encodeURIComponent(weatherZip)}`);
    const payload = await res.json();
    if (!res.ok) {
      setLiveStatus(`Weather unavailable: ${payload.detail || payload.error}`);
      return;
    }
    setWeatherForecast(payload);
    setLiveStatus(`Weather checked for ${payload.location}: ${payload.risk_level} risk`);
  };

  const logWeatherRisk = async () => {
    const activeProject = state.projects?.[0]?.client || 'Builder project';
    const res = await fetch('/api/weather/forecast/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip: weatherZip, project: activeProject, forecast: weatherForecast }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setLiveStatus(`Weather log failed: ${payload.detail || payload.error}`);
      return;
    }
    setState(payload);
    setLiveStatus('Weather risk logged to the project activity feed.');
  };

  const updateList = (key, id, field, value) => {
    saveState({
      ...state,
      [key]: (state[key] || []).map(item => item.id === id ? { ...item, [field]: value } : item),
    });
  };

  if (!state) {
    return <div style={{ ...styles.page, padding: 32 }}>Loading Version 10 builder command center...</div>;
  }

  const primaryMessage = state.message_drafts?.[0]?.body || '';
  const modelCatalog = state.model_catalog || [
    { id: 'netherwood-440', name: 'Netherwood 440', sqft: 440 },
    { id: 'altura-576', name: 'Altura 576', sqft: 576 },
    { id: 'cromwell-1280', name: 'Cromwell 1280', sqft: 1280 },
  ];
  const supplierQuotes = state.supplier_quotes || [
    { id: 'lowes-lumber', supplier: "Lowe's", package: 'Lumber, house wrap, windows/doors', status: 'Bid requested', quoted_total: 38500 },
    { id: 'raks-drywall', supplier: 'RAKS', package: 'Sheetrock, mud, roofing, fixtures', status: 'Need delivery window', quoted_total: 22600 },
    { id: 'rio-grande-finish', supplier: 'Rio Grande', package: 'Cabinets, appliances, lighting, flooring', status: 'Comparing scope', quoted_total: 31400 },
    { id: 'sip-pur-shell', supplier: 'SIP/PUR panel supplier', package: 'Panelized shell and insulation package', status: 'Lead time pending', quoted_total: 61500 },
    { id: 'conventional-shell', supplier: 'Conventional build package', package: 'Framing, sheathing, insulation, exterior labor', status: 'Baseline COGS', quoted_total: 54800 },
  ];
  const sipPurComparison = state.sip_pur_comparison || [
    { id: 'conventional', method: 'Conventional', total_cogs: 111500, labor_days: 42, schedule_effect: 'Baseline field build', gross_profit_impact: 'Known margin, higher weather exposure' },
    { id: 'sip-pur', method: 'SIP/PUR panelized shell', total_cogs: 119800, labor_days: 30, schedule_effect: 'Shorter dry-in window', gross_profit_impact: 'Higher material cost, lower labor risk' },
  ];
  const crewMessages = state.crew_messages || [
    { id: 'crew-roofing', trade: 'Roofing', status: 'Text ready', body: 'Weather window is tightening. Protect dry-in materials and confirm next safe roof day.' },
    { id: 'crew-trenching', trade: 'Trenching', status: 'Text ready', body: 'Hold trench work until rain risk clears; update utility inspection timing.' },
  ];

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Builder Operating System</h1>
          <div style={{ color: '#CFC7BC', marginTop: 6 }}>Server-backed Version 10 · mobile-first project, bid, invoice, supplier, and crew triage</div>
        </div>
        <span style={styles.badge}>Version 10</span>
        <button className="v10-header-action" style={{ ...styles.button, marginLeft: 'auto' }} onClick={() => addActivity('Client view', 'Client opened the simulated estimate/invoice view.')}>Preview Client View</button>
        <button className="v10-header-action" style={styles.ghost} onClick={() => window.print()}>Print Client Packet</button>
      </header>

      <main className="v10-shell" style={styles.shell}>
        <section style={{ display: 'grid', gap: 14 }}>
          <div style={styles.grid}>
            <div style={styles.cardDark}><div style={styles.kicker}>Bid Volume</div><div style={{ fontSize: 28, fontWeight: 900 }}>{fmt(totals.bidVolume)}</div></div>
            <div style={styles.cardDark}><div style={styles.kicker}>Profit Floor</div><div style={{ fontSize: 28, fontWeight: 900 }}>{fmt(totals.grossProfitFloor)}</div></div>
            <div style={styles.cardDark}><div style={styles.kicker}>Receipts</div><div style={{ fontSize: 28, fontWeight: 900 }}>{fmt(totals.receipts)}</div></div>
            <div style={styles.cardDark}><div style={styles.kicker}>Mileage</div><div style={{ fontSize: 28, fontWeight: 900 }}>{totals.miles.toFixed(1)} mi</div></div>
          </div>

          <section style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div style={styles.kicker}>Active Projects</div>
              <button style={styles.button} onClick={addProject}>Add Project</button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {state.projects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  modelCatalog={modelCatalog}
                  onChange={(id, field, value) => updateList('projects', id, field, value)}
                  onApplyModel={applyModelDefaults}
                  onCreateInvoices={createInvoiceDrafts}
                />
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Supplier Quote Comparator</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {supplierQuotes.map(q => (
                <div className="v10-row" key={q.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr .9fr .7fr auto', gap: 10, alignItems: 'center', padding: 12, background: '#FAF7F2', borderRadius: 8 }}>
                  <div><b>{q.supplier}</b><div style={{ fontSize: 12, color: '#78716C' }}>{q.package}</div></div>
                  <input style={styles.input} value={q.status} onChange={e => updateList('supplier_quotes', q.id, 'status', e.target.value)} />
                  <input style={styles.input} type="number" value={q.quoted_total} onChange={e => updateList('supplier_quotes', q.id, 'quoted_total', Number(e.target.value))} />
                  <button style={styles.ghost} onClick={() => sendSupplierToCogs(q.id)}>Send to COGS</button>
                </div>
              ))}
            </div>
            <div style={{ ...styles.kicker, marginTop: 16 }}>SIP/PUR vs Conventional</div>
            <div style={styles.grid}>
              {sipPurComparison.map(item => (
                <div key={item.id || item.method} style={styles.miniCard}>
                  <b>{item.method}</b>
                  <div style={{ fontSize: 13, marginTop: 5 }}>COGS {fmt(item.total_cogs)} · {item.labor_days} labor days</div>
                  <div style={{ fontSize: 12, color: '#78716C', marginTop: 5 }}>{item.schedule_effect}</div>
                  <div style={{ fontSize: 12, color: '#57534E', marginTop: 5 }}>{item.gross_profit_impact}</div>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <section style={styles.card}>
            <div style={styles.kicker}>Live Integration Status</div>
            <div style={{ display: 'grid', gap: 7 }}>
              {Object.entries(integrations || {}).map(([name, info]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                  <b style={{ textTransform: 'capitalize' }}>{name}</b>
                  <span style={{ color: info.configured ? '#065F46' : '#92400E', fontWeight: 900 }}>
                    {info.configured ? 'Configured' : `Missing ${info.missing.length}`}
                  </span>
                </div>
              ))}
            </div>
            <button style={{ ...styles.ghost, marginTop: 10 }} onClick={loadIntegrations}>Refresh status</button>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Text Ian / Builder</div>
            <textarea style={{ ...styles.input, minHeight: 120 }} value={note || primaryMessage} onChange={e => setNote(e.target.value)} />
            <div className="v10-actions" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <a style={{ ...styles.button, textDecoration: 'none' }} href={`sms:${state.builder.phone}?&body=${encodeURIComponent(note || primaryMessage)}`}>Text {state.builder.phone}</a>
              <button style={styles.button} onClick={sendLiveSms}>Send Live SMS</button>
              <button style={styles.ghost} onClick={() => addActivity('Builder text', note || primaryMessage)}>Log text</button>
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Crew Messages</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {crewMessages.slice(0, 5).map(message => (
                <div key={message.id} style={styles.miniCard}>
                  <b>{message.trade}</b>
                  <span style={{ marginLeft: 8, color: '#065F46', fontSize: 12, fontWeight: 900 }}>{message.status}</span>
                  <div style={{ fontSize: 13, marginTop: 5 }}>{message.body}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Weather Delay Assessor</div>
            <p style={{ fontSize: 13, color: '#78716C', margin: '0 0 10px' }}>
              Check New Mexico ZIP codes for rain, wind, freeze, and heat risks that can move the critical path.
            </p>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 900, color: '#57534E' }}>
              Project ZIP code
              <input style={{ ...styles.input, minHeight: 44 }} value={weatherZip} inputMode="numeric" onChange={e => setWeatherZip(e.target.value)} />
            </label>
            <div className="v10-actions" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button style={styles.button} onClick={checkWeather}>Check Weather</button>
              <button style={styles.ghost} onClick={logWeatherRisk}>Log Weather Risk</button>
              <a
                style={{ ...styles.ghost, textDecoration: 'none' }}
                href={`sms:${state.builder.phone}?&body=${encodeURIComponent(weatherForecast?.crew_message || `Weather check needed for ${weatherZip}.`)}`}
              >
                Text Weather Crew
              </a>
            </div>
            {weatherForecast && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: weatherForecast.risk_level === 'high' ? '#FEF2F2' : '#F5F0E8', fontSize: 13 }}>
                <b>{weatherForecast.location}</b>
                <div style={{ marginTop: 4 }}>{weatherForecast.crew_message}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...styles.badge, background: weatherForecast.risk_level === 'high' ? '#F87171' : '#C4954A' }}>
                    {weatherForecast.risk_level} risk
                  </span>
                  <span style={styles.badge}>{weatherForecast.delay_days} day delay</span>
                  <span style={styles.badge}>{weatherForecast.source}</span>
                </div>
              </div>
            )}
            {!!state.weather_checks?.length && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {state.weather_checks.slice(0, 3).map(check => (
                  <div key={check.id} style={{ fontSize: 12, borderLeft: '3px solid #0F1F3D', paddingLeft: 9 }}>
                    <b>{check.project} · {check.zip}</b><br />{check.crew_message}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Payments</div>
            <p style={{ fontSize: 13, color: '#78716C', marginBottom: 10 }}>$10,000 preconstruction payment link for the current lead.</p>
            <button style={styles.button} onClick={createStripePaymentLink}>Create Stripe Payment Link</button>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Receipt Scanner Demo</div>
            <textarea style={{ ...styles.input, minHeight: 92, marginBottom: 8 }} value={receiptText} onChange={e => setReceiptText(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={styles.button} onClick={parseReceiptOcr}>Parse Receipt OCR</button>
              <button style={styles.ghost} onClick={addReceipt}>Add receipt manually</button>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {state.receipts.map(r => (
                <div key={r.id} style={{ fontSize: 13, padding: 10, borderRadius: 8, background: '#FAF7F2' }}>
                  <input style={styles.input} value={r.vendor} onChange={e => updateList('receipts', r.id, 'vendor', e.target.value)} />
                  <input style={{ ...styles.input, marginTop: 6 }} type="number" value={r.amount} onChange={e => updateList('receipts', r.id, 'amount', Number(e.target.value))} />
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Mileage Tracker Demo</div>
            <button style={styles.button} onClick={addMileage}>Add trip</button>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {state.mileage.map(m => (
                <div key={m.id} style={{ fontSize: 13, padding: 10, borderRadius: 8, background: '#FAF7F2' }}>
                  <input style={styles.input} value={m.project} onChange={e => updateList('mileage', m.id, 'project', e.target.value)} />
                  <input style={{ ...styles.input, marginTop: 6 }} type="number" value={m.miles} onChange={e => updateList('mileage', m.id, 'miles', Number(e.target.value))} />
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Activity / Open Tracking</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {state.activity.slice(0, 8).map(a => (
                <div key={a.id} style={{ fontSize: 12, borderLeft: '3px solid #C4954A', paddingLeft: 9 }}>
                  <b>{a.type}</b><br />{a.detail}
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Clerk Login</div>
            <p style={{ fontSize: 13, color: '#78716C', marginBottom: 10 }}>Checks whether Clerk environment variables are configured on the server.</p>
            <button style={styles.button} onClick={checkClerkLogin}>Check Clerk Login</button>
            {liveStatus && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#F5F0E8', fontSize: 12 }}>{liveStatus}</div>}
          </section>
        </aside>
      </main>
    </div>
  );
}
