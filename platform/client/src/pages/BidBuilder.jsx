import React, { useState, useEffect } from 'react';

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function computeTotals(items, bid) {
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.qty || 0) * parseFloat(i.unit_cost || 0)), 0);
  const markup = subtotal * (parseFloat(bid.markup_pct || 0) / 100);
  const contingency = subtotal * (parseFloat(bid.contingency_pct || 0) / 100);
  const preTax = subtotal + markup + contingency;
  const tax = preTax * (parseFloat(bid.tax_pct || 0) / 100);
  return { subtotal, markup, contingency, preTax, tax, total: preTax + tax };
}

const cell = { padding: '6px 8px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', width: '100%' };

export default function BidBuilder() {
  const [bids, setBids]       = useState([]);
  const [clients, setClients] = useState([]);
  const [active, setActive]   = useState(null);   // full bid object being edited
  const [saving, setSaving]   = useState(false);

  const loadBids = () => fetch('/api/bids').then(r => r.json()).then(setBids);
  useEffect(() => {
    loadBids();
    fetch('/api/clients').then(r => r.json()).then(setClients);
  }, []);

  const openBid = async (id) => {
    const bid = await fetch(`/api/bids/${id}`).then(r => r.json());
    setActive(bid);
  };

  const newBid = async () => {
    const bid = await fetch('/api/bids', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'ADU Estimate', items: [] }),
    }).then(r => r.json());
    loadBids();
    setActive(bid);
  };

  const updateField = (k, v) => setActive(a => ({ ...a, [k]: v }));
  const updateItem = (idx, k, v) => setActive(a => ({
    ...a, items: a.items.map((it, i) => i === idx ? { ...it, [k]: v } : it),
  }));
  const addItem = () => setActive(a => ({
    ...a, items: [...a.items, { category: 'General', description: '', qty: 1, unit: 'ea', unit_cost: 0 }],
  }));
  const removeItem = (idx) => setActive(a => ({ ...a, items: a.items.filter((_, i) => i !== idx) }));

  const save = async () => {
    setSaving(true);
    const updated = await fetch(`/api/bids/${active.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: active.title, status: active.status, client_id: active.client_id,
        markup_pct: active.markup_pct, tax_pct: active.tax_pct,
        contingency_pct: active.contingency_pct, notes: active.notes,
        valid_until: active.valid_until, items: active.items,
      }),
    }).then(r => r.json());
    setActive(updated);
    loadBids();
    setSaving(false);
  };

  const downloadPdf = async () => {
    await save();
    const res = await fetch(`/api/bids/${active.id}/pdf`, { method: 'POST' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${active.bid_number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const generateInvoices = async () => {
    await save();
    await fetch(`/api/invoices/from-bid/${active.id}`, { method: 'POST' });
    await fetch(`/api/bids/${active.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    alert('Draw schedule created — see the Invoices tab.');
    openBid(active.id);
    loadBids();
  };

  const totals = active ? computeTotals(active.items, active) : null;

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh' }}>
      <div style={{ background: '#1C1917', color: '#F0EBE1', padding: '20px 32px', display: 'flex', alignItems: 'center' }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: 28, letterSpacing: '.02em', margin: 0 }}>
          Bids &amp; Estimates
        </h1>
        <button onClick={newBid}
          style={{ marginLeft: 'auto', background: '#C4954A', color: '#FFF', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + New Bid
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: 'calc(100vh - 68px)' }}>
        {/* Bid list */}
        <div style={{ borderRight: '1px solid #E7E0D5', background: '#FFF', padding: 12 }}>
          {bids.map(b => (
            <div key={b.id} onClick={() => openBid(b.id)}
              style={{ padding: '12px 14px', borderRadius: 6, cursor: 'pointer', marginBottom: 6,
                background: active?.id === b.id ? '#F5F0E8' : 'transparent',
                border: active?.id === b.id ? '1px solid #C4954A' : '1px solid transparent' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.title}</div>
              <div style={{ fontSize: 11, color: '#A8A29E', marginTop: 2 }}>
                {b.bid_number} · {b.client_name || 'No client'}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
                color: b.status === 'accepted' ? '#065F46' : b.status === 'sent' ? '#1E40AF' : '#92400E' }}>
                {b.status}
              </span>
            </div>
          ))}
          {!bids.length && <div style={{ padding: 20, textAlign: 'center', color: '#A8A29E', fontSize: 13 }}>No bids yet</div>}
        </div>

        {/* Bid editor */}
        <div style={{ padding: 24, overflowY: 'auto' }}>
          {!active ? (
            <div style={{ color: '#A8A29E', textAlign: 'center', marginTop: 80 }}>Select or create a bid to begin.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap' }}>
                <input value={active.title} onChange={e => updateField('title', e.target.value)}
                  style={{ ...cell, fontSize: 18, fontWeight: 700, flex: 1, minWidth: 240 }} />
                <select value={active.client_id || ''} onChange={e => updateField('client_id', e.target.value ? parseInt(e.target.value) : null)}
                  style={{ ...cell, width: 200 }}>
                  <option value="">— Select client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Line items */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#FFF', borderRadius: 8 }}>
                <thead>
                  <tr style={{ background: '#F5F0E8' }}>
                    {['Category', 'Description', 'Qty', 'Unit', 'Unit Cost', 'Total', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#78716C' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F0EBE1' }}>
                      <td style={{ padding: 4, width: 110 }}><input value={it.category || ''} onChange={e => updateItem(idx, 'category', e.target.value)} style={cell} /></td>
                      <td style={{ padding: 4 }}><input value={it.description} onChange={e => updateItem(idx, 'description', e.target.value)} style={cell} /></td>
                      <td style={{ padding: 4, width: 70 }}><input type="number" value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} style={{ ...cell, textAlign: 'right' }} /></td>
                      <td style={{ padding: 4, width: 60 }}><input value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} style={cell} /></td>
                      <td style={{ padding: 4, width: 100 }}><input type="number" value={it.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)} style={{ ...cell, textAlign: 'right' }} /></td>
                      <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600, width: 100 }}>{fmt(parseFloat(it.qty || 0) * parseFloat(it.unit_cost || 0))}</td>
                      <td style={{ padding: 4, width: 30 }}><button onClick={() => removeItem(idx)} style={{ border: 'none', background: 'none', color: '#B85C38', cursor: 'pointer', fontSize: 16 }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addItem} style={{ marginTop: 10, background: 'none', border: '1px dashed #C4954A', color: '#C4954A', borderRadius: 4, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
                + Add line item
              </button>

              {/* Totals + settings */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, marginTop: 24 }}>
                <div style={{ background: '#FFF', border: '1px solid #E7E0D5', borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#78716C', marginBottom: 12 }}>Pricing Settings</div>
                  {[['markup_pct', 'Overhead & profit %'], ['contingency_pct', 'Contingency %'], ['tax_pct', 'NM gross receipts tax %']].map(([k, label]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <label style={{ fontSize: 13, color: '#57534E' }}>{label}</label>
                      <input type="number" step="0.001" value={active[k]} onChange={e => updateField(k, e.target.value)}
                        style={{ ...cell, width: 90, textAlign: 'right' }} />
                    </div>
                  ))}
                  <textarea placeholder="Notes / scope clarifications" value={active.notes || ''} onChange={e => updateField('notes', e.target.value)}
                    style={{ ...cell, marginTop: 8, minHeight: 60, resize: 'vertical' }} />
                </div>

                <div style={{ background: '#0F1F3D', borderRadius: 8, padding: 20, color: '#F0EBE1' }}>
                  {[['Subtotal', totals.subtotal], ['Overhead & profit', totals.markup], ['Contingency', totals.contingency], ['Tax', totals.tax]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'rgba(240,235,225,.7)' }}>
                      <span>{l}</span><span>{fmt(v)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid rgba(196,149,74,.4)', paddingTop: 12, marginTop: 12 }}>
                    <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 18, fontWeight: 700 }}>Total</span>
                    <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 24, fontWeight: 700, color: '#C4954A' }}>{fmt(totals.total)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button onClick={save} disabled={saving} style={{ background: '#3D5247', color: '#FFF', border: 'none', borderRadius: 4, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Bid'}
                </button>
                <button onClick={downloadPdf} style={{ background: '#C4954A', color: '#FFF', border: 'none', borderRadius: 4, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Download PDF
                </button>
                <button onClick={generateInvoices} style={{ background: '#FFF', color: '#0F1F3D', border: '1px solid #0F1F3D', borderRadius: 4, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Accept &amp; Create Draw Schedule →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
