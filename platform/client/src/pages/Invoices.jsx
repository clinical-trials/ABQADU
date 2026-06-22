import React, { useState, useEffect } from 'react';

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS = {
  draft:   { bg: '#F3F4F6', fg: '#6B7280' },
  sent:    { bg: '#DBEAFE', fg: '#1E40AF' },
  paid:    { bg: '#D1FAE5', fg: '#065F46' },
  overdue: { bg: '#FEE2E2', fg: '#B91C1C' },
};

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [payFor, setPayFor]     = useState(null);
  const [payAmt, setPayAmt]     = useState('');
  const [payMethod, setPayMethod] = useState('check');

  const load = () => fetch('/api/invoices').then(r => r.json()).then(setInvoices);
  useEffect(() => { load(); }, []);

  const setStatus = async (id, status) => {
    await fetch(`/api/invoices/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const recordPayment = async () => {
    if (!payAmt) return;
    await fetch(`/api/invoices/${payFor.id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(payAmt), method: payMethod }),
    });
    setPayFor(null); setPayAmt(''); load();
  };

  const downloadPdf = async (inv) => {
    const res = await fetch(`/api/invoices/${inv.id}/pdf`, { method: 'POST' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${inv.invoice_number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  const totalBilled = invoices.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const totalPaid   = invoices.reduce((s, i) => s + parseFloat(i.paid || 0), 0);
  const outstanding = totalBilled - totalPaid;

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh' }}>
      <div style={{ background: '#1C1917', color: '#F0EBE1', padding: '20px 32px' }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: 28, letterSpacing: '.02em', margin: 0 }}>
          Invoices &amp; Payments
        </h1>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {[['Total Billed', totalBilled, '#1C1917'], ['Collected', totalPaid, '#3D5247'], ['Outstanding', outstanding, '#B85C38']].map(([l, v, c]) => (
          <div key={l} style={{ background: '#FFF', border: '1px solid #E7E0D5', borderRadius: 8, padding: 18 }}>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 30, fontWeight: 900, color: c }}>{fmt(v)}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#78716C', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 24px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#FFF', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#F5F0E8' }}>
              {['Invoice', 'Client', 'Description', 'Amount', 'Paid', 'Balance', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#78716C' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id} style={{ borderBottom: '1px solid #F0EBE1' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{inv.invoice_number}</td>
                <td style={{ padding: '10px 12px', color: '#57534E' }}>{inv.client_name || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#78716C', fontSize: 12 }}>{inv.description}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(inv.amount)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#3D5247' }}>{fmt(inv.paid)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: parseFloat(inv.balance) > 0 ? '#B85C38' : '#3D5247' }}>{fmt(inv.balance)}</td>
                <td style={{ padding: '10px 12px' }}>
                  <select value={inv.status} onChange={e => setStatus(inv.id, e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 12, fontWeight: 600,
                      background: (STATUS[inv.status] || {}).bg, color: (STATUS[inv.status] || {}).fg }}>
                    {['draft', 'sent', 'paid', 'overdue'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  {parseFloat(inv.balance) > 0 && (
                    <button onClick={() => { setPayFor(inv); setPayAmt(String(inv.balance)); }}
                      style={{ background: '#3D5247', color: '#FFF', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 }}>
                      Record Payment
                    </button>
                  )}
                  <button onClick={() => downloadPdf(inv)}
                    style={{ background: 'none', border: '1px solid #C4954A', color: '#C4954A', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
                    PDF
                  </button>
                </td>
              </tr>
            ))}
            {!invoices.length && (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#A8A29E' }}>No invoices yet — accept a bid to generate a draw schedule.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment modal */}
      {payFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setPayFor(null)}>
          <div style={{ background: '#FFF', borderRadius: 8, padding: 24, width: 360 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Record Payment</div>
            <div style={{ fontSize: 12, color: '#A8A29E', marginBottom: 16 }}>{payFor.invoice_number} · Balance {fmt(payFor.balance)}</div>
            <label style={{ fontSize: 12, color: '#57534E' }}>Amount</label>
            <input type="number" value={payAmt} onChange={e => setPayAmt(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 14, marginBottom: 12, marginTop: 4 }} />
            <label style={{ fontSize: 12, color: '#57534E' }}>Method</label>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 14, marginBottom: 16, marginTop: 4 }}>
              {['check', 'card', 'ach', 'cash'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={recordPayment} style={{ flex: 1, background: '#3D5247', color: '#FFF', border: 'none', borderRadius: 4, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Save Payment</button>
              <button onClick={() => setPayFor(null)} style={{ border: '1px solid #E7E0D5', background: '#FFF', borderRadius: 4, padding: '10px 14px', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
