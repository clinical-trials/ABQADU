import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useCommandCenter from '../hooks/useCommandCenter';
import ClientPacket, { PacketPdfStatus } from '../components/ClientPacket';
import usePacketPdf from '../hooks/usePacketPdf';
import IntegrationSetup, { SERVICE_IDS } from '../components/IntegrationSetup';
import { apiFetch } from '../utils/authFetch';
import WeatherAttribution from '../components/WeatherAttribution';

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

const styles = {
  page: { fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh', color: '#1C1917' },
  header: { background: '#1C1917', color: '#F0EBE1', padding: '22px clamp(16px, 4vw, 36px)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  headerInner: { width: '100%', maxWidth: 1440, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' },
  title: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: 'clamp(28px, 6vw, 46px)', margin: 0, letterSpacing: '.02em', lineHeight: 1 },
  badge: { background: '#C4954A', color: '#1C1917', borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' },
  shell: { width: '100%', maxWidth: 1440, margin: '0 auto', boxSizing: 'border-box', padding: 'clamp(14px, 4vw, 28px)', display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, .65fr)', gap: 18 },
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
      .command-center-workspace button:disabled { opacity:.5; cursor:not-allowed; }
      .command-center-workspace input, .command-center-workspace select, .command-center-workspace textarea { font-size:16px!important; }
      .command-center-workspace section, .command-center-workspace aside { min-width:0; }
      .command-center-workspace button:focus-visible, .command-center-workspace input:focus-visible, .command-center-workspace select:focus-visible { outline:3px solid #C4954A; outline-offset:2px; }
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

function ProjectCard({ project, modelCatalog, onChange, onApplyModel, onCreateInvoices, busy }) {
  const profitLow = Number(project.bid_total || 0) - Number(project.cogs_high || 0);
  const profitHigh = Number(project.bid_total || 0) - Number(project.cogs_low || 0);
  const invoices = project.invoice_drafts || [
    { id: `${project.id}-preconstruction`, label: 'Invoice 1: $10,000 Preconstruction', amount: 10000, status: 'Draft ready' },
  ];
  return (
    <article style={styles.card} aria-label={`Project details for ${project.client}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input aria-label="Client name" style={{ ...styles.input, fontSize: 18, fontWeight: 900 }} value={project.client} onChange={e => onChange(project.id, 'client', e.target.value)} />
          <input aria-label="Site address" style={{ ...styles.input, marginTop: 6 }} value={project.address} onChange={e => onChange(project.id, 'address', e.target.value)} />
        </div>
        <select aria-label="Estimate confidence" style={{ ...styles.input, width: 82, fontWeight: 900 }} value={project.confidence} onChange={e => onChange(project.id, 'confidence', e.target.value)}>
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
          <select aria-label="House model" style={styles.input} value={project.model_id || project.model} onChange={e => onChange(project.id, 'model_id', e.target.value)}>
            <option value={project.model}>{project.model || 'Choose model'}</option>
            {modelCatalog.map(model => <option key={model.id} value={model.id}>{model.name} · {model.sqft} sf</option>)}
          </select>
          <Field label="Square feet"><input style={{ ...styles.input, marginTop: 6 }} aria-label="Square feet" min="1" type="number" value={project.sqft} onChange={e => onChange(project.id, 'sqft', Number(e.target.value))} /></Field>
          <button style={{ ...styles.ghost, marginTop: 8, width: '100%' }} disabled={busy} onClick={() => onApplyModel(project.id, project.model_id || project.model)}>Apply Model Defaults</button>
        </div>
        <div>
          <div style={styles.kicker}>Estimate / Invoice</div>
          <Field label="Customer price"><input style={styles.input} aria-label="Customer price" min="0" type="number" value={project.bid_total} onChange={e => onChange(project.id, 'bid_total', Number(e.target.value))} /></Field>
          <div style={{ fontSize: 13, marginTop: 6 }}>{fmt(Number(project.bid_total || 0) / Number(project.sqft || 1))}/sf customer price</div>
          <Field label="Estimated cost low"><input style={{ ...styles.input, marginTop: 6 }} aria-label="Estimated cost low" min="0" type="number" value={project.cogs_low} onChange={e => onChange(project.id, 'cogs_low', Number(e.target.value))} /></Field>
          <Field label="Estimated cost high"><input style={{ ...styles.input, marginTop: 6 }} aria-label="Estimated cost high" min="0" type="number" value={project.cogs_high} onChange={e => onChange(project.id, 'cogs_high', Number(e.target.value))} /></Field>
          <div style={{ fontSize: 13, marginTop: 6 }}>Profit {fmt(profitLow)} - {fmt(profitHigh)}</div>
          <button style={{ ...styles.button, marginTop: 8, width: '100%' }} disabled={busy} onClick={() => onCreateInvoices(project.id)}>Create $10k Invoice</button>
        </div>
      </div>
      <div style={{ ...styles.grid, marginTop: 12 }}>
        {[
          ['Site visit', 'site_visit_status', ['Needs scheduling', 'Scheduled', 'Completed']],
          ['Utility review', 'utility_review_status', ['Needs confirmation', 'In review', 'Confirmed']],
          ['Sewer confirmation', 'sewer_confirmation_status', ['Needs sewer confirmation study', 'In review', 'Confirmed']],
          ['Setbacks / site plan', 'setbacks_site_plan_status', ['Needs site plan', 'In review', 'Confirmed']],
        ].map(([label, field, options]) => (
          <div key={field} style={styles.miniCard}>
            <Field label={label}>
              <select style={styles.input} value={project[field] || options[0]} onChange={e => onChange(project.id, field, e.target.value)}>
                {project[field] && !options.includes(project[field]) && <option>{project[field]}</option>}
                {options.map(option => <option key={option}>{option}</option>)}
              </select>
            </Field>
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
      {project.readiness_label && <p style={{ fontSize: 13, color: '#3D5247', fontWeight: 800 }}>Estimate readiness: {project.readiness_label}</p>}
      <div style={{ marginTop: 12, padding: 11, borderRadius: 8, background: '#FAF7F2', fontSize: 13 }}>
        <input aria-label="Project status" style={styles.input} value={project.status} onChange={e => onChange(project.id, 'status', e.target.value)} />
        <textarea aria-label="Next action" style={{ ...styles.input, marginTop: 6 }} value={project.next_action} onChange={e => onChange(project.id, 'next_action', e.target.value)} />
      </div>
    </article>
  );
}

export default function CommandCenter() {
  useMobilePatch();
  const { state, saving, error, status, load, saveState, updateList, runAction, clearError, legacyDraftNotice } = useCommandCenter();
  const packetPdf = usePacketPdf(saveState);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [clientPreview, setClientPreview] = useState(null);
  const activeProject = state?.projects?.find(project => project.id === activeProjectId) || state?.projects?.[0] || null;
  const [integrations, setIntegrations] = useState(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [integrationsError, setIntegrationsError] = useState('');
  const integrationRequest = useRef(0);
  const [note, setNote] = useState('');
  const [receiptText, setReceiptText] = useState("LOWE'S HOME IMPROVEMENT\n08/03/2026\nDrywall mud and house wrap\nTOTAL $284.76");
  const [liveStatus, setLiveStatus] = useState('');
  const [importedInvoices, setImportedInvoices] = useState(null);
  const [weatherZip, setWeatherZip] = useState('87106');
  const [weatherForecast, setWeatherForecast] = useState(null);
  const weatherRequest = useRef(0);

  const loadIntegrations = useCallback(async () => {
    const request = ++integrationRequest.current;
    setIntegrationsLoading(true);
    setIntegrationsError('');
    setIntegrations(null);
    try {
      const response = await apiFetch('/api/integrations/status');
      if (!response.ok) throw new Error('Service settings are unavailable. Try refreshing the status.');
      const data = await response.json();
      if (!SERVICE_IDS.every(id => typeof data?.[id]?.configured === 'boolean')) throw new Error('Service settings could not be read. Try refreshing the status.');
      if (request === integrationRequest.current) setIntegrations(data);
    } catch {
      if (request === integrationRequest.current) setIntegrationsError('Unable to check service settings. Make sure the app server is running, then refresh.');
    } finally {
      if (request === integrationRequest.current) setIntegrationsLoading(false);
    }
  }, []);
  useEffect(() => {
    loadIntegrations();
    return () => { integrationRequest.current += 1; };
  }, [loadIntegrations]);
  useEffect(() => {
    weatherRequest.current += 1;
    setWeatherForecast(null);
    setImportedInvoices(null);
    setWeatherZip(activeProject?.zip || activeProject?.address?.match(/\b\d{5}\b/)?.[0] || '87106');
  }, [activeProject?.id, activeProject?.zip, activeProject?.address]);

  const totals = useMemo(() => {
    const projects = state?.projects || [];
    const bidVolume = projects.reduce((sum, p) => sum + Number(p.bid_total || 0), 0);
    const cogsHigh = projects.reduce((sum, p) => sum + Number(p.cogs_high || 0), 0);
    const miles = (state?.mileage || []).reduce((sum, m) => sum + Number(m.miles || 0), 0);
    const receipts = (state?.receipts || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return { bidVolume, grossProfitFloor: bidVolume - cogsHigh, miles, receipts };
  }, [state]);

  const addActivity = (type, detail) => runAction('/api/command-center/activity', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, detail }),
  });

  const previewClient = async () => {
    if (!activeProject) return;
    const preview = await runAction(`/api/command-center/projects/${activeProject.id}/client-view-preview`);
    if (preview) setClientPreview(preview);
  };

  const addReceipt = () => {
    const receipt = { id: `receipt-${Date.now()}`, vendor: 'New receipt', project: activeProject?.client || 'Unassigned', project_id: activeProject?.id, amount: 0, category: 'Materials', note: 'Tap to edit in the production receipt scanner.' };
    saveState(current => ({ receipts: [receipt, ...(current.receipts || [])] }));
  };

  const addMileage = () => {
    const trip = { id: `mile-${Date.now()}`, date: new Date().toISOString().slice(0, 10), project: activeProject?.client || 'Unassigned', project_id: activeProject?.id, miles: 0, purpose: 'Builder trip.' };
    saveState(current => ({ mileage: [trip, ...(current.mileage || [])] }));
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
    saveState(current => ({ projects: [project, ...(current.projects || [])] }));
    setActiveProjectId(project.id);
  };

  const applyModelDefaults = (projectId, model) => runAction(`/api/command-center/projects/${projectId}/apply-model`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }),
  });
  const createInvoiceDrafts = projectId => runAction(`/api/command-center/projects/${projectId}/invoice-drafts`, { method: 'POST' });
  const sendSupplierToCogs = async quoteId => {
    if (!activeProject) return;
    const saved = await runAction(`/api/command-center/projects/${activeProject.id}/send-supplier-to-cogs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_id: quoteId }),
    });
    if (saved) setLiveStatus(`Supplier quote added to ${activeProject.client}.`);
  };
  const sendLiveSms = async () => {
    const payload = await runAction('/api/integrations/sms/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: state.builder.phone, body: note || primaryMessage }),
    });
    if (payload) { setLiveStatus(`Live SMS sent: ${payload.sid}`); await load(); }
  };
  const importInvoiceDrafts = async () => {
    if (!activeProject) return;
    const projectId = activeProject.id;
    const payload = await runAction(`/api/billing/command-center/${encodeURIComponent(projectId)}/import`, { method: 'POST' });
    if (Array.isArray(payload?.invoices)) {
      setImportedInvoices({ projectId, count: payload.invoices.length });
    }
  };
  const parseReceiptOcr = async () => {
    if (!activeProject) return;
    const payload = await runAction('/api/integrations/ocr/receipt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: receiptText, project: activeProject.client, project_id: activeProject.id }),
    });
    if (payload) setLiveStatus(`Receipt parsed: ${payload.receipt.vendor} ${fmt(payload.receipt.amount)}`);
  };
  const checkClerkLogin = async () => {
    const payload = await runAction('/api/integrations/clerk/status');
    if (payload) setLiveStatus(payload.authenticated ? 'Your session is verified and has workspace access.' : 'Sign-in could not be verified.');
  };
  const checkWeather = async () => {
    if (!activeProject) return;
    const request = ++weatherRequest.current;
    setWeatherForecast(null);
    const payload = await runAction(`/api/weather/forecast?zip=${encodeURIComponent(weatherZip)}`);
    if (payload && request === weatherRequest.current) {
      setWeatherForecast({ ...payload, project_id: activeProject.id, zip: weatherZip });
      setLiveStatus(`Weather checked for ${payload.location}: ${payload.risk_level} risk`);
    }
  };
  const weatherMatches = !!weatherForecast && weatherForecast.project_id === activeProject?.id && weatherForecast.zip === weatherZip;
  const logWeatherRisk = async () => {
    if (!activeProject || !weatherMatches) return;
    const request = weatherRequest.current;
    const payload = await runAction('/api/weather/forecast/activity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip: weatherZip, project_id: activeProject.id }),
    });
    if (payload) {
      const checked = payload.weather_checks?.find(check => check.project_id === activeProject.id && check.zip === weatherZip);
      if (checked && request === weatherRequest.current) setWeatherForecast(checked);
      setLiveStatus(`Weather risk logged for ${activeProject.client}.`);
    }
  };

  if (!state) {
    return <div style={{ ...styles.page, padding: 32 }}>{error ? <><p role="alert">{error}</p><button style={styles.button} onClick={load}>Retry loading</button></> : 'Loading Version 10 builder command center...'}</div>;
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
  const crewMessages = (state.crew_messages || []).filter(message => message.project_id === activeProject?.id);
  const projectWeatherChecks = (state.weather_checks || []).filter(check => check.project_id === activeProject?.id);
  const projectReceipts = (state.receipts || []).filter(row => !row.project_id || row.project_id === activeProject?.id);
  const projectMileage = (state.mileage || []).filter(row => !row.project_id || row.project_id === activeProject?.id);

  return (
    <div style={styles.page} className="command-center-workspace">
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.title}>Builder Operating System</h1>
            <div style={{ color: '#CFC7BC', marginTop: 6 }}>Version 10 · Projects, estimates, suppliers, and crews</div>
          </div>
          <span style={styles.badge}>Version 10</span>
          <button className="v10-header-action" style={{ ...styles.button, marginLeft: 'auto' }} disabled={!activeProject || saving} onClick={previewClient}>Preview Client View</button>
          <button className="v10-header-action" style={styles.ghost} disabled={!activeProject || saving || packetPdf.loading} onClick={() => packetPdf.open(activeProject.id)}>{packetPdf.loading ? 'Preparing PDF…' : 'Print Client Packet'}</button>
        </div>
      </header>

      <section aria-label="Project workspace" style={{ maxWidth: 1440, margin: '0 auto', padding: '18px clamp(14px, 4vw, 28px) 0', boxSizing: 'border-box' }}>
        <div style={{ ...styles.card, display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 16 }}>
          <label style={{ ...styles.label, flex: '1 1 260px' }}>Active project
            <select aria-label="Active project" style={styles.input} value={activeProject?.id || ''} disabled={!state.projects.length || saving} onChange={e => setActiveProjectId(e.target.value)}>
              {!state.projects.length && <option value="">Add a project to get started</option>}
              {state.projects.map(project => <option key={project.id} value={project.id}>{project.client} · {project.model}</option>)}
            </select>
          </label>
          <div style={{ flex: '1 1 220px', fontSize: 13 }}><b>Working on {activeProject?.client || 'your next project'}</b><p style={{ margin: '6px 0 0', color: '#57534E' }}>Client packets, supplier costs, receipts, and weather use this project.</p></div>
          <div style={{ display: 'grid', gap: 6 }}><span role="status" style={{ fontSize: 13 }}>{status}</span><button disabled={saving} style={styles.ghost} onClick={() => saveState({})}>{error ? 'Retry saving' : 'Save changes'}</button></div>
        </div>
        {error && <div role="alert" style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8 }}>{error} Any unsaved edits remain in this tab. <button style={styles.ghost} onClick={clearError}>Dismiss error</button></div>}
        {legacyDraftNotice && <p role="status" style={{padding:12,background:'#FFF4D8',borderRadius:8}}>{legacyDraftNotice}</p>}
        {liveStatus && <p role="status" style={{ padding: 12, background: '#E8EEE8', borderRadius: 8 }}>{liveStatus}</p>}
        <PacketPdfStatus pdf={packetPdf.projectId === activeProject?.id ? packetPdf : null} />
      </section>
      <main className="v10-shell" style={styles.shell}>
        <section style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div style={styles.grid}>
            <div style={styles.cardDark}><div style={styles.kicker}>Bid Volume</div><div style={{ fontSize: 28, fontWeight: 900 }}>{fmt(totals.bidVolume)}</div></div>
            <div style={styles.cardDark}><div style={styles.kicker}>Profit Floor</div><div style={{ fontSize: 28, fontWeight: 900 }}>{fmt(totals.grossProfitFloor)}</div></div>
            <div style={styles.cardDark}><div style={styles.kicker}>Receipts</div><div style={{ fontSize: 28, fontWeight: 900 }}>{fmt(totals.receipts)}</div></div>
            <div style={styles.cardDark}><div style={styles.kicker}>Mileage</div><div style={{ fontSize: 28, fontWeight: 900 }}>{totals.miles.toFixed(1)} mi</div></div>
          </div>

          <section style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div style={styles.kicker}>Active Projects</div>
              <button style={styles.button} disabled={saving} onClick={addProject}>Add Project</button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {(activeProject ? [activeProject] : []).map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  busy={saving}
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
            <p style={{ fontSize: 13, color: '#57534E' }}>Send selected quotes to {activeProject?.client || 'the active project'}.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {supplierQuotes.map(q => (
                <div className="v10-row" key={q.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr .9fr .7fr auto', gap: 10, alignItems: 'center', padding: 12, background: '#FAF7F2', borderRadius: 8 }}>
                  <div><b>{q.supplier}</b><div style={{ fontSize: 12, color: '#78716C' }}>{q.package}</div></div>
                  <input style={styles.input} value={q.status} onChange={e => updateList('supplier_quotes', q.id, 'status', e.target.value)} />
                  <input style={styles.input} type="number" value={q.quoted_total} onChange={e => updateList('supplier_quotes', q.id, 'quoted_total', Number(e.target.value))} />
                  <button disabled={!activeProject || saving} style={styles.ghost} onClick={() => sendSupplierToCogs(q.id)}>Send to COGS</button>
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
          <IntegrationSetup integrations={integrations} loading={integrationsLoading} error={integrationsError} onRefresh={loadIntegrations} />

          <section style={styles.card}>
            <div style={styles.kicker}>Text Ian / Builder</div>
            <textarea style={{ ...styles.input, minHeight: 120 }} value={note || primaryMessage} onChange={e => setNote(e.target.value)} />
            <div className="v10-actions" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <a style={{ ...styles.button, textDecoration: 'none' }} href={`sms:${state.builder.phone}?&body=${encodeURIComponent(note || primaryMessage)}`}>Text {state.builder.phone}</a>
              <button style={styles.button} disabled={saving || !integrations?.twilio?.configured} onClick={sendLiveSms}>Send Live SMS</button>
              <button style={styles.ghost} onClick={() => addActivity('Builder text', note || primaryMessage)}>Log text</button>
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Crew Messages</div>
            {!crewMessages.length && <p style={{ fontSize: 13 }}>No weather crew drafts for this project yet.</p>}
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
              Apple Weather forecasts for your configured project locations. Review rain, wind, freeze, and heat before planning exposed work.
            </p>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 900, color: '#57534E' }}>
              Project ZIP code
              <input style={{ ...styles.input, minHeight: 44 }} value={weatherZip} inputMode="numeric" maxLength={5} onChange={e => { weatherRequest.current += 1; setWeatherZip(e.target.value); setWeatherForecast(null); }} />
            </label>
            <div className="v10-actions" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button style={styles.button} disabled={!activeProject || saving || !/^\d{5}$/.test(weatherZip)} onClick={checkWeather}>Check Weather</button>
              <button style={styles.ghost} disabled={!weatherMatches || saving} onClick={logWeatherRisk}>Log Weather Risk</button>
              <a
                style={{ ...styles.ghost, textDecoration: 'none' }}
                href={`sms:${state.builder.phone}?&body=${encodeURIComponent((weatherMatches ? weatherForecast.crew_message : null) || `Weather check needed for ${weatherZip}.`)}`}
              >
                Text Weather Crew
              </a>
            </div>
            {weatherMatches && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: weatherForecast.risk_level === 'high' ? '#FEF2F2' : '#F5F0E8', fontSize: 13 }}>
                <b>{weatherForecast.location}</b>
                {weatherForecast.current && <p style={{margin:'8px 0'}}>
                  {Number.isFinite(weatherForecast.current.temp_f) ? `${Math.round(weatherForecast.current.temp_f)}°F` : 'Temperature unavailable'}
                  {Number.isFinite(weatherForecast.current.wind_mph) && ` · Wind ${Math.round(weatherForecast.current.wind_mph)} mph`}
                </p>}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,margin:'10px 0'}}>
                  {(weatherForecast.days || []).map(day => <div key={day.date} style={{background:'#fff',padding:10,borderRadius:6}}>
                    <b>{day.date}</b>
                    <div>{Math.round(day.high_f)}° / {Math.round(day.low_f)}°</div>
                    <div>{Math.round(day.rain_chance)}% precipitation</div>
                    <div>Wind up to {Math.round(day.wind_mph)} mph</div>
                  </div>)}
                </div>
                <WeatherAttribution forecast={weatherForecast} />
                <p style={{fontSize:12,color:'#57534e'}}>ABQ ADU planning estimates: construction risks and delay allowances calculated from Apple Weather data.</p>
                <div style={{ marginTop: 4 }}>{weatherForecast.crew_message}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...styles.badge, background: weatherForecast.risk_level === 'high' ? '#F87171' : '#C4954A' }}>
                    {weatherForecast.risk_level} risk
                  </span>
                  <span style={styles.badge}>Up to {weatherForecast.delay_days} day planning allowance</span>
                </div>
                {weatherForecast.checked_at && <small>Checked {new Date(weatherForecast.checked_at).toLocaleString()}</small>}
              </div>
            )}
            {!!projectWeatherChecks.length && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {projectWeatherChecks.slice(0, 3).map(check => (
                  <div key={check.id} style={{ fontSize: 12, borderLeft: '3px solid #0F1F3D', paddingLeft: 9 }}>
                    <b>{check.project} · {check.zip}</b><br />{check.crew_message}
                    <div>{check.checked_at ? `Saved ${new Date(check.checked_at).toLocaleString()}` : 'Saved weather check'} · ABQ ADU planning assessment</div>
                    <WeatherAttribution forecast={check} />
                    {check.provider !== 'weatherkit' && check.source !== 'Apple Weather' && <small>Source: {check.source || 'Earlier weather record'}</small>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Invoices & payments</div>
            <p style={{ fontSize: 13, color: '#78716C', marginBottom: 10 }}>Save the invoice drafts for {activeProject?.client || 'the active project'}, then create their invoice records. Repeating this step keeps the same invoices.</p>
            <button style={styles.button} disabled={!activeProject || saving} onClick={importInvoiceDrafts}>Create invoices from saved drafts</button>
            {importedInvoices && importedInvoices.projectId === activeProject?.id && <p role="status">{importedInvoices.count} invoice{importedInvoices.count === 1 ? '' : 's'} ready. Review amounts before creating payment links.</p>}
            <p><a href="/invoices">Open invoices and payments</a></p>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Receipt Text Entry</div>
            <p style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>Paste receipt text to suggest the vendor and total, then review the saved receipt. Photo scanning still needs setup.</p>
            <textarea style={{ ...styles.input, minHeight: 92, marginBottom: 8 }} value={receiptText} onChange={e => setReceiptText(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={styles.button} disabled={!activeProject || saving} onClick={parseReceiptOcr}>Read Receipt Text</button>
              <button style={styles.ghost} disabled={!activeProject || saving} onClick={addReceipt}>Add receipt manually</button>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {projectReceipts.map(r => (
                <div key={r.id} style={{ fontSize: 13, padding: 10, borderRadius: 8, background: '#FAF7F2' }}>
                  <p style={{ margin: '0 0 8px' }}>{r.project_id ? 'Project' : 'Legacy receipt · project not linked'}: {r.project || 'Unassigned'}</p>
                  <input aria-label={`Receipt vendor for ${r.project || 'unassigned project'}`} style={styles.input} value={r.vendor} onChange={e => updateList('receipts', r.id, 'vendor', e.target.value)} />
                  <input aria-label={`Receipt amount for ${r.vendor}`} style={{ ...styles.input, marginTop: 6 }} type="number" value={r.amount} onChange={e => updateList('receipts', r.id, 'amount', Number(e.target.value))} />
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Mileage Tracker Demo</div>
            <button style={styles.button} disabled={!activeProject || saving} onClick={addMileage}>Add trip</button>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              {projectMileage.map(m => (
                <div key={m.id} style={{ fontSize: 13, padding: 10, borderRadius: 8, background: '#FAF7F2' }}>
                  <p style={{ margin: '0 0 8px' }}>{m.project_id ? 'Project' : 'Legacy trip · project not linked'}: {m.project || 'Unassigned'}</p>
                  <input aria-label={`Trip purpose for ${m.project || 'unassigned project'}`} style={styles.input} value={m.purpose || ''} onChange={e => updateList('mileage', m.id, 'purpose', e.target.value)} />
                  <input aria-label={`Miles for ${m.project || 'unassigned project'}`} style={{ ...styles.input, marginTop: 6 }} type="number" value={m.miles} onChange={e => updateList('mileage', m.id, 'miles', Number(e.target.value))} />
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
            <div style={styles.kicker}>Sign-in Setup</div>
            <p style={{ fontSize: 13, color: '#78716C', marginBottom: 10 }}>Access requires a verified sign-in and an allowed staff account.</p>
            <button style={styles.button} onClick={checkClerkLogin}>Check Sign-in Settings</button>
          </section>
        </aside>
      </main>
      {clientPreview && <ClientPacket preview={clientPreview} onClose={() => setClientPreview(null)} onPrint={() => packetPdf.open(clientPreview.project?.id)} pdf={packetPdf.projectId === clientPreview.project?.id ? packetPdf : null} />}
    </div>
  );
}
