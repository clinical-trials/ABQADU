import React, { useEffect, useState } from 'react';

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#0F1F3D', border: '1px solid #1e3060', borderRadius: 8,
    width: 720, maxHeight: '80vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    padding: '20px 24px', borderBottom: '1px solid #1e3060',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  title: {
    color: '#e0e8f4', fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 18, fontWeight: 700, letterSpacing: 1,
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#6080a0',
    fontSize: 20, cursor: 'pointer',
  },
  body: { padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: '#1a3060', border: '1px solid #2a4070', borderRadius: 6,
    padding: '14px 16px', cursor: 'pointer', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center',
    transition: 'border-color .15s',
  },
  cardName: {
    color: '#e0e8f4', fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 16, fontWeight: 600,
  },
  cardDesc: {
    color: '#8090a8', fontSize: 12, fontFamily: 'DM Sans, sans-serif', marginTop: 3,
  },
  chip: {
    background: '#0F1F3D', border: '1px solid #2a4070',
    borderRadius: 4, padding: '3px 8px', color: '#C4954A',
    fontSize: 11, fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
  },
  meta: { display: 'flex', gap: 8, alignItems: 'center' },
  blankBtn: {
    background: 'transparent', border: '1px dashed #2a4070',
    borderRadius: 6, padding: '14px 16px', color: '#6080a0',
    fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer',
    textAlign: 'left',
  },
};

export default function TemplatePicker({ onSelect, onClose }) {
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    fetch('/api/designs/templates')
      .then(r => r.json())
      .then(setTemplates)
      .catch(() => {});
  }, []);

  async function handleTemplate(tpl) {
    const res = await fetch(`/api/designs/templates/${tpl.id}`);
    const { design } = await res.json();
    onSelect(design?.rooms || [], tpl);
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.header}>
          <span style={S.title}>Choose a Starting Point</span>
          <button style={S.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={S.body}>
          <button style={S.blankBtn} onClick={() => onSelect([], null)}>
            + Start with blank canvas
          </button>

          {templates.map(tpl => (
            <div
              key={tpl.id}
              style={S.card}
              onClick={() => handleTemplate(tpl)}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#C4954A'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#2a4070'}
            >
              <div>
                <div style={S.cardName}>{tpl.name}</div>
                <div style={S.cardDesc}>{tpl.description}</div>
              </div>
              <div style={S.meta}>
                <span style={S.chip}>{tpl.sqft} sf</span>
                <span style={S.chip}>{tpl.bedrooms}BR / {tpl.bathrooms}BA</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
