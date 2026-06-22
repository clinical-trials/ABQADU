import React, { useState, useEffect } from 'react';
import { GRID } from './useDesignState';
import BOMPanel from './BOMPanel';
import AIDesignPanel from './AIDesignPanel';

const S = {
  panel: {
    width: 220, flexShrink: 0,
    background: '#0F1F3D',
    borderLeft: '1px solid #1e3060',
    padding: 16,
    display: 'flex', flexDirection: 'column', gap: 12,
    overflowY: 'auto',
  },
  heading: {
    color: '#C4954A', fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
  },
  label: {
    color: '#8090a8', fontSize: 10, fontFamily: 'DM Sans, sans-serif',
    marginBottom: 2,
  },
  input: {
    width: '100%', background: '#1a3060', border: '1px solid #2a4070',
    borderRadius: 4, color: '#e0e8f4', padding: '5px 8px',
    fontSize: 12, fontFamily: 'DM Sans, sans-serif',
    boxSizing: 'border-box',
  },
  row: { display: 'flex', gap: 8 },
  btn: {
    flex: 1, padding: '6px 0', borderRadius: 4, cursor: 'pointer',
    fontSize: 12, fontFamily: 'DM Sans, sans-serif',
    border: 'none',
  },
  deleteBtn: {
    background: '#B85C3822', border: '1px solid #B85C38',
    color: '#e07050',
  },
  dimRow: {
    background: '#0a1830', borderRadius: 4, padding: '8px 10px',
    color: '#e0e8f4', fontSize: 12, fontFamily: 'DM Sans, sans-serif',
    display: 'flex', justifyContent: 'space-between',
  },
  sqft: {
    background: '#1a3060', borderRadius: 4, padding: '10px 12px',
    textAlign: 'center',
  },
};

export default function RoomProperties({ room, rooms, totalSqft, templateName, onUpdateLabel, onDelete }) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (room) setLabel(room.label);
  }, [room?.id]);

  if (!room) {
    return (
      <div style={S.panel}>
        <div style={S.heading}>Properties</div>
        <div style={{ color: '#4a6080', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}>
          Select a room to edit
        </div>
        <div style={{ marginTop: 'auto' }}>
          <div style={S.heading}>Total Area</div>
          <div style={S.sqft}>
            <div style={{ color: '#C4954A', fontSize: 22, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700 }}>
              {Math.round(totalSqft)}
            </div>
            <div style={{ color: '#8090a8', fontSize: 10, fontFamily: 'DM Sans, sans-serif' }}>sq ft</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <BOMPanel rooms={rooms} />
          </div>
          <div style={{ marginTop: 12 }}>
            <AIDesignPanel rooms={rooms} templateName={templateName} />
          </div>
        </div>
      </div>
    );
  }

  const wFt = Math.round(room.w / GRID);
  const hFt = Math.round(room.h / GRID);
  const sqft = wFt * hFt;

  return (
    <div style={S.panel}>
      <div style={S.heading}>Properties</div>

      <div>
        <div style={S.label}>Room label</div>
        <input
          style={S.input}
          value={label}
          onChange={e => setLabel(e.target.value)}
          onBlur={() => onUpdateLabel(room.id, label)}
          onKeyDown={e => e.key === 'Enter' && onUpdateLabel(room.id, label)}
        />
      </div>

      <div>
        <div style={S.label}>Dimensions</div>
        <div style={S.dimRow}>
          <span>{wFt} ft W</span>
          <span>×</span>
          <span>{hFt} ft H</span>
        </div>
      </div>

      <div>
        <div style={S.label}>Area</div>
        <div style={S.sqft}>
          <div style={{ color: '#C4954A', fontSize: 20, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700 }}>
            {sqft} sf
          </div>
        </div>
      </div>

      <div style={S.row}>
        <button
          style={{ ...S.btn, ...S.deleteBtn }}
          onClick={() => onDelete(room.id)}
        >
          Delete
        </button>
      </div>

      <div style={{ marginTop: 'auto', borderTop: '1px solid #1e3060', paddingTop: 12 }}>
        <div style={S.heading}>Total Area</div>
        <div style={S.sqft}>
          <div style={{ color: '#C4954A', fontSize: 22, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700 }}>
            {Math.round(totalSqft)}
          </div>
          <div style={{ color: '#8090a8', fontSize: 10, fontFamily: 'DM Sans, sans-serif' }}>sq ft</div>
        </div>
      </div>
    </div>
  );
}
