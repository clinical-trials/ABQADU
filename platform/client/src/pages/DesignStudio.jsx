import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import DesignCanvas from '../components/design/DesignCanvas';
import RoomPalette from '../components/design/RoomPalette';
import RoomProperties from '../components/design/RoomProperties';
import TemplatePicker from '../components/design/TemplatePicker';
import ConstraintsPanel from '../components/design/ConstraintsPanel';
import useDesignState from '../components/design/useDesignState';

const S = {
  page: {
    height: '100vh', display: 'flex', flexDirection: 'column',
    background: '#0a1428', fontFamily: 'DM Sans, sans-serif',
  },
  toolbar: {
    background: '#0F1F3D', borderBottom: '1px solid #1e3060',
    padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16,
    flexShrink: 0,
  },
  title: {
    color: '#e0e8f4', fontSize: 14, fontFamily: 'Barlow Condensed, sans-serif',
    fontWeight: 600, letterSpacing: 1,
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  canvasWrap: {
    flex: 1, overflow: 'auto', padding: 24,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
    background: '#0a1428',
  },
  chip: {
    background: '#1a3060', color: '#a0b8d0',
    borderRadius: 4, padding: '3px 10px', fontSize: 11,
    border: '1px solid #2a4070',
  },
  saveBtn: {
    marginLeft: 'auto',
    background: '#C4954A', color: '#fff', border: 'none',
    borderRadius: 4, padding: '6px 18px', fontSize: 12,
    fontFamily: 'DM Sans, sans-serif', fontWeight: 600,
    cursor: 'pointer',
  },
  outlineBtn: {
    background: 'transparent', color: '#a0b8d0',
    border: '1px solid #2a4070', borderRadius: 4,
    padding: '6px 12px', fontSize: 12, cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  },
};

export default function DesignStudio() {
  const { id } = useParams();
  const {
    rooms, selectedId, setSelectedId,
    tool, setTool,
    addRoom, moveRoom, resizeRoom, deleteRoom, updateLabel,
    totalSqft,
    setRooms,
  } = useDesignState();

  const [showPicker, setShowPicker] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [designId, setDesignId] = useState(null);
  const [templateName, setTemplateName] = useState('');

  const selectedRoom = rooms.find(r => r.id === selectedId) || null;

  function handleTemplateSelect(templateRooms, tpl) {
    setRooms(templateRooms);
    setTemplateName(tpl?.name || '');
    setShowPicker(false);
  }

  async function handleSave() {
    setSaveStatus('Saving…');
    try {
      const payload = {
        project_id: id || null,
        name: templateName || 'Floor Plan',
        rooms,
      };
      const url = designId ? `/api/designs/${designId}` : '/api/designs';
      const method = designId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setDesignId(data.id);
        setSaveStatus('Saved ✓');
      } else {
        setSaveStatus('Error');
      }
    } catch {
      setSaveStatus('Error');
    }
    setTimeout(() => setSaveStatus(''), 2500);
  }

  return (
    <div style={S.page}>
      {showPicker && (
        <TemplatePicker
          onSelect={handleTemplateSelect}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div style={S.toolbar}>
        <span style={S.title}>Floor Plan Designer</span>
        {id && <span style={S.chip}>Project #{id}</span>}
        {templateName && <span style={{ ...S.chip, color: '#C4954A' }}>{templateName}</span>}
        <span style={{ ...S.chip, color: '#C4954A' }}>{Math.round(totalSqft)} sf total</span>
        <span style={{ ...S.chip, color: '#8090a8' }}>
          {tool === 'select' ? 'Select mode' : `Placing: ${tool}`}
        </span>
        <span style={{ ...S.chip, color: '#8090a8', fontSize: 10 }}>
          Scroll to zoom · Drag rooms to move
        </span>
        <button style={S.outlineBtn} onClick={() => setShowPicker(true)}>Templates</button>
        <button style={S.saveBtn} onClick={handleSave}>
          {saveStatus || 'Save Design'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div style={S.body}>
          <RoomPalette tool={tool} setTool={setTool} />

          <div style={S.canvasWrap}>
            <DesignCanvas
              rooms={rooms}
              selectedId={selectedId}
              tool={tool}
              onSelect={setSelectedId}
              onMove={moveRoom}
              onResize={resizeRoom}
              onAddRoom={addRoom}
            />
          </div>

          <RoomProperties
            room={selectedRoom}
            rooms={rooms}
            totalSqft={totalSqft}
            templateName={templateName}
            onUpdateLabel={updateLabel}
            onDelete={deleteRoom}
          />
        </div>

        <ConstraintsPanel rooms={rooms} totalSqft={totalSqft} />
      </div>
    </div>
  );
}
