import React, { useState, useEffect, useCallback } from 'react';
import GanttChart from '../components/gantt/GanttChart';

const API = '/api';

export default function Scheduler({ projectId }) {
  const [activities, setActivities]     = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [aiSummary, setAiSummary]       = useState('');

  const load = useCallback(async () => {
    const [actsRes, depsRes] = await Promise.all([
      fetch(`${API}/activities/${projectId}`).then(r => r.json()),
      fetch(`${API}/dependencies/${projectId}`).then(r => r.json()),
    ]);
    setActivities(actsRes);
    setDependencies(depsRes);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveActivity = async (id, form) => {
    await fetch(`${API}/activities/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    await load();
  };

  const handleDragActivity = async (id, daysShift) => {
    const act = activities.find(a => a.id === id);
    if (!act || !act.planned_start) return;
    const newStart = new Date(act.planned_start);
    newStart.setDate(newStart.getDate() + daysShift);
    await handleSaveActivity(id, { planned_start: newStart.toISOString().slice(0, 10) });
  };

  const loadAISummary = async () => {
    const res = await fetch(`${API}/claude/forecast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    });
    const { summary } = await res.json();
    setAiSummary(summary);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: '#78716C', fontFamily: 'DM Sans, sans-serif' }}>
      Loading schedule…
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#FAF7F2' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', background: '#1C1917', color: '#F0EBE1',
        display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
          fontSize: 18, letterSpacing: '.04em' }}>
          ABQ ADU · Schedule
        </span>
        <button onClick={loadAISummary}
          style={{ marginLeft: 'auto', background: '#C4954A', color: '#FFF', border: 'none',
            borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          AI Forecast
        </button>
      </div>

      {/* AI summary bar */}
      {aiSummary && (
        <div style={{ background: '#FFF7ED', borderBottom: '1px solid #FCD34D',
          padding: '10px 20px', fontSize: 13, color: '#1C1917', lineHeight: 1.6 }}>
          <strong style={{ color: '#C4954A' }}>AI Forecast: </strong>{aiSummary}
          <button onClick={() => setAiSummary('')}
            style={{ marginLeft: 12, background: 'none', border: 'none',
              color: '#A8A29E', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Gantt */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <GanttChart
          activities={activities}
          dependencies={dependencies}
          onSaveActivity={handleSaveActivity}
          onDragActivity={handleDragActivity}
        />
      </div>
    </div>
  );
}
