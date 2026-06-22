import React from 'react';
import { ROOM_TYPES } from './useDesignState';

export default function RoomPalette({ tool, setTool }) {
  return (
    <div style={{
      width: 160, flexShrink: 0,
      background: '#0F1F3D',
      borderRight: '1px solid #1e3060',
      padding: '16px 12px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ color: '#C4954A', fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
        Rooms
      </div>

      <button
        onClick={() => setTool('select')}
        style={{
          background: tool === 'select' ? '#C4954A' : '#1a3060',
          color: tool === 'select' ? '#fff' : '#a0b0c8',
          border: 'none', borderRadius: 4, padding: '6px 8px',
          fontSize: 12, fontFamily: 'DM Sans, sans-serif',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        ↖ Select
      </button>

      <div style={{ borderTop: '1px solid #1e3060', margin: '4px 0' }} />

      {ROOM_TYPES.map(rt => (
        <button
          key={rt.type}
          onClick={() => setTool(rt.type)}
          style={{
            background: tool === rt.type ? '#C4954A22' : 'transparent',
            border: tool === rt.type ? '1px solid #C4954A' : '1px solid #1e3060',
            borderRadius: 4, padding: '7px 8px',
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', color: '#e0e8f4',
            fontSize: 12, fontFamily: 'DM Sans, sans-serif',
          }}
        >
          <span style={{
            width: 12, height: 12, borderRadius: 2, flexShrink: 0,
            background: rt.color, border: '1px solid #0F1F3D',
          }} />
          {rt.label}
        </button>
      ))}

      <div style={{ color: '#4a6080', fontSize: 10, fontFamily: 'DM Sans, sans-serif', marginTop: 8 }}>
        Click canvas to place room
      </div>
    </div>
  );
}
