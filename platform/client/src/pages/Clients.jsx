import React, { useState, useEffect } from 'react';

const STATUS_COLORS = {
  lead:   { bg: '#FEF3C7', fg: '#92400E' },
  active: { bg: '#DBEAFE', fg: '#1E40AF' },
  won:    { bg: '#D1FAE5', fg: '#065F46' },
  lost:   { bg: '#F3F4F6', fg: '#6B7280' },
};

const input = {
  width: '100%', padding: '8px 10px', border: '1px solid #E7E0D5',
  borderRadius: 4, fontSize: 13, fontFamily: 'inherit', marginBottom: 10,
};

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [adding, setAdding]   = useState(false);
  const [form, setForm]       = useState({ name: '', email: '', phone: '', address: '', lead_source: '', status: 'lead' });

  const load = () => fetch('/api/clients').then(r => r.json()).then(setClients);
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) return;
    await fetch('/api/clients', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setAdding(false);
    setForm({ name: '', email: '', phone: '', address: '', lead_source: '', status: 'lead' });
    load();
  };

  const updateStatus = async (id, status) => {
    await fetch(`/api/clients/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh' }}>
      <div style={{ background: '#1C1917', color: '#F0EBE1', padding: '20px 32px', display: 'flex', alignItems: 'center' }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: 28, letterSpacing: '.02em', margin: 0 }}>
          Clients &amp; Leads
        </h1>
        <button onClick={() => setAdding(true)}
          style={{ marginLeft: 'auto', background: '#C4954A', color: '#FFF', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Add Client
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        {adding && (
          <div style={{ background: '#FFF', border: '1px solid #E7E0D5', borderRadius: 8, padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 14 }}>New Client / Lead</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input style={input} placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <input style={input} placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <input style={input} placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <input style={input} placeholder="Lead source (e.g. website, referral)" value={form.lead_source} onChange={e => setForm(f => ({ ...f, lead_source: e.target.value }))} />
            </div>
            <input style={input} placeholder="Property address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={save} style={{ background: '#3D5247', color: '#FFF', border: 'none', borderRadius: 4, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>Save</button>
              <button onClick={() => setAdding(false)} style={{ border: '1px solid #E7E0D5', borderRadius: 4, padding: '8px 14px', fontSize: 13, cursor: 'pointer', background: '#FFF' }}>Cancel</button>
            </div>
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#FFF', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#F5F0E8' }}>
              {['Name', 'Contact', 'Source', 'Bids', 'Status'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#78716C' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #F0EBE1' }}>
                <td style={{ padding: '12px', fontWeight: 600 }}>
                  {c.name}
                  {c.address && <div style={{ fontSize: 11, color: '#A8A29E', fontWeight: 400 }}>{c.address}</div>}
                </td>
                <td style={{ padding: '12px', color: '#57534E' }}>
                  {c.email && <div>{c.email}</div>}
                  {c.phone && <div style={{ fontSize: 12, color: '#A8A29E' }}>{c.phone}</div>}
                </td>
                <td style={{ padding: '12px', color: '#78716C' }}>{c.lead_source || '—'}</td>
                <td style={{ padding: '12px', color: '#78716C' }}>{c.bid_count || 0}</td>
                <td style={{ padding: '12px' }}>
                  <select value={c.status} onChange={e => updateStatus(c.id, e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 12, fontWeight: 600,
                      background: (STATUS_COLORS[c.status] || {}).bg, color: (STATUS_COLORS[c.status] || {}).fg }}>
                    {['lead', 'active', 'won', 'lost'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {!clients.length && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#A8A29E' }}>No clients yet — add your first lead.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
