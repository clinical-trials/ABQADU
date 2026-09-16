import React, { useState } from 'react';
import GanttChart from '../components/gantt/GanttChart';
import { requestJson } from '../utils/api';
import useApiList from '../hooks/useApiList';
import useApiAction from '../hooks/useApiAction';
import ApiError from '../components/ApiError';

const API = '/api';

export default function Scheduler({ projectId }) {
  const activityList = useApiList(projectId ? `${API}/activities/${projectId}` : null);
  const dependencyList = useApiList(projectId ? `${API}/dependencies/${projectId}` : null);
  const activities = activityList.data;
  const dependencies = dependencyList.data;
  const { run, pending, error: actionError } = useApiAction();
  const [aiSummary, setAiSummary]       = useState('');

  const load = () => Promise.all([activityList.reload(), dependencyList.reload()]);

  const handleSaveActivity = async (id, form) => {
    const result = await run(async () => {
      await requestJson(`${API}/activities/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      await load();
    });
    return result.ok;
  };

  const handleDragActivity = async (id, daysShift) => {
    const act = activities.find(a => a.id === id);
    if (!act || !act.planned_start) return;
    const newStart = new Date(act.planned_start);
    newStart.setDate(newStart.getDate() + daysShift);
    await handleSaveActivity(id, { planned_start: newStart.toISOString().slice(0, 10) });
  };

  const loadAISummary = () => run(async () => {
    const { summary } = await requestJson(`${API}/claude/forecast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (typeof summary !== 'string') throw new Error('The server returned an invalid forecast. Please try again.');
    setAiSummary(summary);
  });

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#FAF7F2' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', background: '#1C1917', color: '#F0EBE1',
        display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
          fontSize: 18, letterSpacing: '.04em' }}>
          ABQ ADU · Schedule
        </span>
        <button disabled={pending} onClick={loadAISummary}
          style={{ marginLeft: 'auto', background: '#C4954A', color: '#FFF', border: 'none',
            borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          AI Forecast
        </button>
      </div>

      <ApiError message={activityList.error || dependencyList.error} onRetry={load} />
      <ApiError message={actionError} />
      {(activityList.loading || dependencyList.loading) && <p role="status" style={{ padding: '0 20px' }}>Loading schedule…</p>}
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
          saving={pending}
          saveError={actionError}
        />
      </div>
    </div>
  );
}
