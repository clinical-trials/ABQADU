import React, { useState } from 'react';

const S = {
  panel: {
    background: '#0F1F3D', border: '1px solid #1e3060', borderRadius: 6,
    padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
  },
  heading: {
    color: '#C4954A', fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  badge: {
    background: '#C4954A22', border: '1px solid #C4954A66',
    color: '#C4954A', borderRadius: 3, fontSize: 9,
    padding: '1px 6px', letterSpacing: 1,
  },
  btnRow: { display: 'flex', gap: 6 },
  btn: {
    flex: 1, padding: '6px 4px', borderRadius: 4, border: 'none',
    fontSize: 10, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
    background: '#1a3060', color: '#a0b8d0',
  },
  activeBtn: {
    background: '#C4954A22', border: '1px solid #C4954A',
    color: '#C4954A',
  },
  output: {
    background: '#0a1828', border: '1px solid #1e3060', borderRadius: 4,
    padding: 10, fontSize: 11, fontFamily: 'DM Sans, sans-serif',
    color: '#c0d0e0', lineHeight: 1.6, whiteSpace: 'pre-wrap',
    maxHeight: 200, overflowY: 'auto',
  },
  loading: {
    color: '#4a6080', fontSize: 11, fontFamily: 'DM Sans, sans-serif',
    fontStyle: 'italic',
  },
};

const ACTIONS = [
  { key: 'brief',     label: 'Design Brief',  endpoint: '/api/claude-design/brief'            },
  { key: 'compliance',label: 'Compliance',    endpoint: '/api/claude-design/compliance'        },
  { key: 'permit',    label: 'Permit Text',   endpoint: '/api/claude-design/permit-narrative'  },
];

export default function AIDesignPanel({ rooms, templateName }) {
  const [active, setActive] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  async function run(action) {
    if (loading) return;
    setActive(action.key);
    setText('');
    setLoading(true);
    try {
      const res = await fetch(action.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms, template_name: templateName }),
      });
      const data = await res.json();
      setText(data.text || data.analysis || '');
    } catch (e) {
      setText('Error connecting to AI service.');
    }
    setLoading(false);
  }

  return (
    <div style={S.panel}>
      <div style={S.heading}>
        AI Design Assistant
        <span style={S.badge}>Claude</span>
      </div>

      <div style={S.btnRow}>
        {ACTIONS.map(a => (
          <button
            key={a.key}
            style={{ ...S.btn, ...(active === a.key ? S.activeBtn : {}) }}
            onClick={() => run(a)}
            disabled={loading || rooms.length === 0}
          >
            {a.label}
          </button>
        ))}
      </div>

      {loading && <div style={S.loading}>Claude is analyzing your floor plan…</div>}
      {text && !loading && <div style={S.output}>{text}</div>}
      {rooms.length === 0 && (
        <div style={{ ...S.loading, fontStyle: 'normal', color: '#3a5070' }}>
          Add rooms to enable AI analysis
        </div>
      )}
    </div>
  );
}
