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
  button: { border: 'none', borderRadius: 8, background: '#3D5247', color: '#FFF', padding: '10px 13px', fontSize: 13, fontWeight: 800, cursor: 'pointer' },
  ghost: { border: '1px solid #E7E0D5', borderRadius: 8, background: '#FFF', color: '#1C1917', padding: '10px 13px', fontSize: 13, fontWeight: 800, cursor: 'pointer' },
  input: { border: '1px solid #E7E0D5', borderRadius: 7, padding: '9px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' },
};

function useMobilePatch() {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 840px){
        .v9-shell{grid-template-columns:1fr!important}
        .v9-row{grid-template-columns:1fr!important}
        .v9-actions{position:sticky;bottom:0;background:#FAF7F2;padding:10px 0}
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
}

function ProjectCard({ project, onChange }) {
  const profitLow = Number(project.bid_total || 0) - Number(project.cogs_high || 0);
  const profitHigh = Number(project.bid_total || 0) - Number(project.cogs_low || 0);
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
        <div><div style={styles.kicker}>Model</div><input style={styles.input} value={project.model} onChange={e => onChange(project.id, 'model', e.target.value)} /><input style={{ ...styles.input, marginTop: 6 }} type="number" value={project.sqft} onChange={e => onChange(project.id, 'sqft', Number(e.target.value))} /></div>
        <div><div style={styles.kicker}>Bid</div><input style={styles.input} type="number" value={project.bid_total} onChange={e => onChange(project.id, 'bid_total', Number(e.target.value))} /><div>{fmt(Number(project.bid_total || 0) / Number(project.sqft || 1))}/sf</div></div>
        <div><div style={styles.kicker}>COGS Range</div><input style={styles.input} type="number" value={project.cogs_low} onChange={e => onChange(project.id, 'cogs_low', Number(e.target.value))} /><input style={{ ...styles.input, marginTop: 6 }} type="number" value={project.cogs_high} onChange={e => onChange(project.id, 'cogs_high', Number(e.target.value))} /><div>Profit {fmt(profitLow)} - {fmt(profitHigh)}</div></div>
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

  const updateList = (key, id, field, value) => {
    saveState({
      ...state,
      [key]: (state[key] || []).map(item => item.id === id ? { ...item, [field]: value } : item),
    });
  };

  if (!state) {
    return <div style={{ ...styles.page, padding: 32 }}>Loading Version 9 builder command center…</div>;
  }

  const primaryMessage = state.message_drafts?.[0]?.body || '';

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Builder Command Center</h1>
          <div style={{ color: '#CFC7BC', marginTop: 6 }}>Server-backed Version 9 demo · mobile-first builder triage</div>
        </div>
        <span style={styles.badge}>Version 9</span>
        <button style={{ ...styles.button, marginLeft: 'auto' }} onClick={() => addActivity('Client view', 'Client opened the simulated estimate/invoice view.')}>Simulate Client View</button>
      </header>

      <main className="v9-shell" style={styles.shell}>
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
              {state.projects.map(p => <ProjectCard key={p.id} project={p} onChange={(id, field, value) => updateList('projects', id, field, value)} />)}
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.kicker}>Supplier Quote Comparator</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {state.supplier_quotes.map(q => (
                <div className="v9-row" key={q.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr .9fr .7fr', gap: 10, alignItems: 'center', padding: 12, background: '#FAF7F2', borderRadius: 8 }}>
                  <div><b>{q.supplier}</b><div style={{ fontSize: 12, color: '#78716C' }}>{q.package}</div></div>
                  <input style={styles.input} value={q.status} onChange={e => updateList('supplier_quotes', q.id, 'status', e.target.value)} />
                  <input style={styles.input} type="number" value={q.quoted_total} onChange={e => updateList('supplier_quotes', q.id, 'quoted_total', Number(e.target.value))} />
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
            <div className="v9-actions" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <a style={{ ...styles.button, textDecoration: 'none' }} href={`sms:${state.builder.phone}?&body=${encodeURIComponent(note || primaryMessage)}`}>Text {state.builder.phone}</a>
              <button style={styles.button} onClick={sendLiveSms}>Send Live SMS</button>
              <button style={styles.ghost} onClick={() => addActivity('Builder text', note || primaryMessage)}>Log text</button>
            </div>
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
