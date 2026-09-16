import React, { useState } from 'react';
import { requestJson, requestList, requestPdf } from '../utils/api';
import useApiList from '../hooks/useApiList';
import useApiAction from '../hooks/useApiAction';
import ApiError from '../components/ApiError';

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

function checkedBid(value) {
  if (!value?.id || !Array.isArray(value.items) || value.items.some(item => !item || typeof item !== 'object')) {
    throw new Error('The server returned an invalid bid. Your current entries are unchanged. Please try again.');
  }
  return value;
}

export default function BidBuilder() {
  const bidList = useApiList('/api/bids');
  const clientList = useApiList('/api/clients');
  const bids = bidList.data;
  const clients = clientList.data;
  const loadBids = bidList.reload;
  const [active, setActive]   = useState(null);   // full bid object being edited
  const [notice, setNotice] = useState('');
  const { run, pending: saving, error: actionError } = useApiAction();
  const runAction = action => run(async () => { setNotice(''); return action(); });

  const openBid = id => runAction(async () => {
    setActive(checkedBid(await requestJson(`/api/bids/${id}`)));
  });

  const newBid = () => runAction(async () => {
    const bid = checkedBid(await requestJson('/api/bids', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'ADU Estimate', items: [] }),
    }));
    setActive(bid);
    await loadBids();
  });

  const updateField = (k, v) => setActive(a => ({ ...a, [k]: v }));
  const updateItem = (idx, k, v) => setActive(a => ({
    ...a, items: a.items.map((it, i) => i === idx ? { ...it, [k]: v } : it),
  }));
  const addItem = () => setActive(a => ({
    ...a, items: [...a.items, { category: 'General', description: '', qty: 1, unit: 'ea', unit_cost: 0 }],
  }));
  const removeItem = (idx) => setActive(a => ({ ...a, items: a.items.filter((_, i) => i !== idx) }));

  const persistActive = async () => {
    const updated = checkedBid(await requestJson(`/api/bids/${active.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: active.title, status: active.status, client_id: active.client_id,
        markup_pct: active.markup_pct, tax_pct: active.tax_pct,
        contingency_pct: active.contingency_pct, notes: active.notes,
        valid_until: active.valid_until, items: active.items,
      }),
    }));
    setActive(updated);
    await loadBids();
    return updated;
  };
  const save = () => runAction(async () => { await persistActive(); setNotice('Bid saved.'); });

  const downloadPdf = () => runAction(async () => {
    const saved = await persistActive();
    await requestPdf(`/api/bids/${saved.id}/pdf`, { method: 'POST' }, `${saved.bid_number}.pdf`);
  });

  const generateInvoices = () => runAction(async () => {
    const saved = await persistActive();
    const invoices = await requestList(`/api/invoices/from-bid/${saved.id}`, { method: 'POST' });
    if (!invoices.length) throw new Error('No draw invoices were returned. Check Invoices before trying again.');
    try {
      const updated = checkedBid(await requestJson(`/api/bids/${saved.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' }),
      }));
      setActive(updated);
    } catch (error) {
      throw new Error(`Draw invoices were created, but the bid status could not be updated. Check Invoices before creating another draw schedule. ${error.message}`);
    }
    setNotice('Draw schedule created — see the Invoices tab.');
    await loadBids();
  });

  const createInvoiceShelfEstimate = () => runAction(async () => {
    if (!active?.id) return;
    const saved = await persistActive();
    const payload = await requestJson(`/api/invoice-engine/bids/${saved.id}/estimate`, { method: 'POST' });
    if (!payload?.invoiceshelf_estimate_id) throw new Error('InvoiceShelf did not confirm an estimate. Check its status before trying again.');
    setNotice(`InvoiceShelf estimate created: ${payload.invoiceshelf_estimate_id}`);
    setActive(checkedBid(await requestJson(`/api/bids/${saved.id}`)));
    await loadBids();
  });

  const totals = active ? computeTotals(active.items, active) : null;

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh' }}>
      <div style={{ background: '#1C1917', color: '#F0EBE1', padding: '20px 32px', display: 'flex', alignItems: 'center' }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: 28, letterSpacing: '.02em', margin: 0 }}>
          Bids &amp; Estimates
        </h1>
        <button onClick={newBid} disabled={saving}
          style={{ marginLeft: 'auto', background: '#C4954A', color: '#FFF', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + New Bid
        </button>
      </div>

      <ApiError message={bidList.error} onRetry={loadBids} />
      <ApiError message={clientList.error} onRetry={clientList.reload} />
      <ApiError message={actionError} />
      {notice && <p role="status" style={{ padding: '0 24px' }}>{notice}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: 'calc(100vh - 68px)' }}>
        {/* Bid list */}
        <div style={{ borderRight: '1px solid #E7E0D5', background: '#FFF', padding: 12 }}>
          {bidList.loading && <p role="status">Loading bids…</p>}
          {bids.map(b => (
            <div key={b.id} onClick={() => { if (!saving) openBid(b.id); }}
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
          {!bidList.loading && !bidList.error && !bids.length && <div style={{ padding: 20, textAlign: 'center', color: '#A8A29E', fontSize: 13 }}>No bids yet</div>}
        </div>

        {/* Bid editor */}
        <div style={{ padding: 24, overflowY: 'auto' }}>
          {!active ? (
            <div style={{ color: '#A8A29E', textAlign: 'center', marginTop: 80 }}>Select or create a bid to begin.</div>
          ) : (
            <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
                <button onClick={createInvoiceShelfEstimate} style={{ background: '#0F1F3D', color: '#FFF', border: 'none', borderRadius: 4, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Create InvoiceShelf Estimate
                </button>
                <button onClick={generateInvoices} style={{ background: '#FFF', color: '#0F1F3D', border: '1px solid #0F1F3D', borderRadius: 4, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Accept &amp; Create Draw Schedule →
                </button>
              </div>
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
}
