import React, { useState, useEffect } from 'react';
import RiskMatrix from '../components/risk/RiskMatrix';

const CATEGORIES = ['schedule','cost','safety','weather','permit','subcontractor'];
const STATUS_COLORS = { open: '#FEE2E2', mitigated: '#FEF3C7', closed: '#D1FAE5', realized: '#F3F4F6' };

export default function RiskRegister({ projectId }) {
  const [risks, setRisks]     = useState([]);
  const [form, setForm]       = useState({ title:'', category:'schedule', probability:3, impact:3 });
  const [adding, setAdding]   = useState(false);

  const load = () =>
    fetch(`/api/risks/${projectId}`).then(r => r.json()).then(setRisks);

  useEffect(() => { load(); }, [projectId]);

  const save = async () => {
    await fetch('/api/risks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, project_id: projectId }),
    });
    setAdding(false);
    setForm({ title:'', category:'schedule', probability:3, impact:3 });
    load();
  };

  const updateStatus = async (id, status) => {
    await fetch(`/api/risks/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh' }}>
      <div style={{ background: '#1C1917', color: '#F0EBE1', padding: '20px 32px',
        display: 'flex', alignItems: 'center' }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
          fontSize: 28, letterSpacing: '.02em', margin: 0 }}>Risk Register</h1>
        <button onClick={() => setAdding(true)}
          style={{ marginLeft: 'auto', background: '#C4954A', color: '#FFF', border: 'none',
            borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Add Risk
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0 }}>
        {/* Risk table */}
        <div style={{ padding: 24 }}>
          {adding && (
            <div style={{ background: '#FFF', border: '1px solid #E7E0D5', borderRadius: 8,
              padding: 20, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 14 }}>New Risk</div>
              <input placeholder="Risk title" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E7E0D5',
                  borderRadius: 4, marginBottom: 10, fontSize: 13, fontFamily: 'inherit' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <select value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ padding: '8px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 13 }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={form.probability}
                  onChange={e => setForm(f => ({ ...f, probability: parseInt(e.target.value) }))}
                  style={{ padding: '8px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 13 }}>
                  {[1,2,3,4,5].map(v => <option key={v} value={v}>P: {v}</option>)}
                </select>
                <select value={form.impact}
                  onChange={e => setForm(f => ({ ...f, impact: parseInt(e.target.value) }))}
                  style={{ padding: '8px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 13 }}>
                  {[1,2,3,4,5].map(v => <option key={v} value={v}>I: {v}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={save}
                  style={{ background: '#3D5247', color: '#FFF', border: 'none',
                    borderRadius: 4, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>
                  Save
                </button>
                <button onClick={() => setAdding(false)}
                  style={{ border: '1px solid #E7E0D5', borderRadius: 4,
                    padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F5F0E8' }}>
                {['Risk', 'Category', 'P×I', 'Score', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#78716C' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {risks.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #F0EBE1' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{r.title}</td>
                  <td style={{ padding: '10px 12px', color: '#78716C' }}>{r.category}</td>
                  <td style={{ padding: '10px 12px' }}>{r.probability} × {r.impact}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11,
                      fontWeight: 700,
                      background: r.risk_score >= 15 ? '#FEE2E2' : r.risk_score >= 8 ? '#FEF3C7' : '#D1FAE5',
                      color: r.risk_score >= 15 ? '#B91C1C' : r.risk_score >= 8 ? '#92400E' : '#065F46' }}>
                      {r.risk_score}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select value={r.status}
                      onChange={e => updateStatus(r.id, e.target.value)}
                      style={{ padding: '4px 6px', border: '1px solid #E7E0D5',
                        borderRadius: 4, fontSize: 12,
                        background: STATUS_COLORS[r.status] || '#FFF' }}>
                      {['open','mitigated','closed','realized'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#A8A29E', fontSize: 11 }}>
                    {r.owner_name || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Risk matrix sidebar */}
        <div style={{ borderLeft: '1px solid #E7E0D5', background: '#FFF' }}>
          <RiskMatrix risks={risks} />
        </div>
      </div>
    </div>
  );
}
