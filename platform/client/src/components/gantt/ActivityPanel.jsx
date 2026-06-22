import React, { useState, useEffect } from 'react';

export default function ActivityPanel({ activity, onClose, onSave }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (activity) setForm({
      name: activity.name || '',
      duration_days: activity.duration_days || 1,
      pct_complete: activity.pct_complete || 0,
      planned_start: activity.planned_start || '',
      actual_start: activity.actual_start || '',
      actual_finish: activity.actual_finish || '',
      activity_type: activity.activity_type || 'task_dependent',
    });
  }, [activity]);

  if (!activity) return null;

  const field = (label, key, type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
        textTransform: 'uppercase', color: '#78716C', marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type}
        value={form[key] ?? ''}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid #E7E0D5',
          borderRadius: 4, fontSize: 13, fontFamily: 'inherit', background: '#FAFAF8' }}
      />
    </div>
  );

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 340,
      background: '#FFFFFF', borderLeft: '1px solid #E7E0D5',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.08)', zIndex: 200,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #E7E0D5',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Edit Activity</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none',
          fontSize: 18, cursor: 'pointer', color: '#78716C' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {field('Activity Name', 'name')}
        {field('Duration (days)', 'duration_days', 'number')}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
            textTransform: 'uppercase', color: '#78716C', marginBottom: 4 }}>
            % Complete
          </label>
          <input type="range" min={0} max={100}
            value={form.pct_complete ?? 0}
            onChange={e => setForm(f => ({ ...f, pct_complete: e.target.value }))}
            style={{ width: '100%' }} />
          <span style={{ fontSize: 12, color: '#78716C' }}>{form.pct_complete}%</span>
        </div>

        {field('Planned Start', 'planned_start', 'date')}
        {field('Actual Start',  'actual_start',  'date')}
        {field('Actual Finish', 'actual_finish', 'date')}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
            textTransform: 'uppercase', color: '#78716C', marginBottom: 4 }}>
            Type
          </label>
          <select value={form.activity_type || 'task_dependent'}
            onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #E7E0D5',
              borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="task_dependent">Task Dependent</option>
            <option value="fixed_duration">Fixed Duration</option>
            <option value="fixed_units">Fixed Units</option>
          </select>
        </div>

        {/* Read-only CPM info */}
        <div style={{ background: '#F5F0E8', borderRadius: 6, padding: 14, fontSize: 12, marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: '.1em',
            textTransform: 'uppercase', color: '#A8A29E', marginBottom: 8 }}>CPM</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['ES', activity.es], ['EF', activity.ef],
              ['LS', activity.ls], ['LF', activity.lf],
              ['Total Float', activity.total_float],
              ['Free Float', activity.free_float],
            ].map(([label, val]) => (
              <div key={label}>
                <span style={{ color: '#A8A29E', fontSize: 10 }}>{label}: </span>
                <span style={{ fontWeight: 600 }}>{val ?? '—'}</span>
              </div>
            ))}
          </div>
          {activity.is_critical && (
            <div style={{ marginTop: 8, color: '#B85C38', fontWeight: 700, fontSize: 11 }}>
              ● CRITICAL PATH
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: 16, borderTop: '1px solid #E7E0D5', display: 'flex', gap: 10 }}>
        <button onClick={() => onSave(activity.id, form)}
          style={{ flex: 1, background: '#3D5247', color: '#FFF', border: 'none',
            borderRadius: 4, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Save Changes
        </button>
        <button onClick={onClose}
          style={{ padding: '10px 16px', border: '1px solid #E7E0D5',
            borderRadius: 4, fontSize: 13, cursor: 'pointer', background: '#FFF' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
