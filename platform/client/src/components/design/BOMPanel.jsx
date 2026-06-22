import React, { useState, useEffect, useRef } from 'react';

const CATEGORIES = ['Structure', 'Exterior', 'Interior', 'MEP', 'Plumbing', 'Bathroom', 'Kitchen'];

const S = {
  panel: {
    background: '#0F1F3D', border: '1px solid #1e3060', borderRadius: 6,
    padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
  },
  heading: {
    color: '#C4954A', fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', fontSize: 9, fontFamily: 'DM Sans, sans-serif',
    color: '#4a6080', padding: '3px 6px', borderBottom: '1px solid #1e3060',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  td: {
    fontSize: 11, fontFamily: 'DM Sans, sans-serif',
    color: '#c0d0e0', padding: '3px 6px',
  },
  tdRight: {
    fontSize: 11, fontFamily: 'DM Sans, sans-serif',
    color: '#e0e8f4', padding: '3px 6px', textAlign: 'right',
  },
  catRow: {
    color: '#8090a8', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1,
    fontFamily: 'DM Sans, sans-serif', padding: '6px 6px 2px',
  },
  total: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderTop: '1px solid #2a4070', paddingTop: 8, marginTop: 4,
  },
  totalLabel: { color: '#8090a8', fontSize: 11, fontFamily: 'DM Sans, sans-serif' },
  totalVal: { color: '#C4954A', fontSize: 18, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700 },
};

function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
}

export default function BOMPanel({ rooms }) {
  const [bom, setBom] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    if (!rooms || rooms.length === 0) { setBom(null); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/designs/bom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rooms }),
        });
        const data = await res.json();
        setBom(data);
      } catch { }
      setLoading(false);
    }, 600);
  }, [JSON.stringify(rooms)]);

  if (!bom && !loading) return null;

  return (
    <div style={S.panel}>
      <div style={S.heading}>Estimate {loading && <span style={{ color: '#4a6080' }}>updating…</span>}</div>

      {bom && (
        <>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Item</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Qty</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Unit</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat => {
                const catItems = bom.items?.filter(i => i.category === cat);
                if (!catItems?.length) return null;
                return (
                  <React.Fragment key={cat}>
                    <tr><td colSpan={4} style={S.catRow}>{cat}</td></tr>
                    {catItems.map((item, i) => (
                      <tr key={i}>
                        <td style={S.td}>{item.label}</td>
                        <td style={S.tdRight}>{item.qty?.toLocaleString()}</td>
                        <td style={{ ...S.td, color: '#4a6080' }}>{item.unit}</td>
                        <td style={S.tdRight}>{fmt(item.total)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          <div style={S.total}>
            <div>
              <div style={S.totalLabel}>Estimated Build Cost</div>
              <div style={{ ...S.totalLabel, fontSize: 9 }}>
                {bom.totalSf} sf · {fmt(bom.costPerSf)}/sf
              </div>
            </div>
            <div style={S.totalVal}>{fmt(bom.grandTotal)}</div>
          </div>
        </>
      )}
    </div>
  );
}
