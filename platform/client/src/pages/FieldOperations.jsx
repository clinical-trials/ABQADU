import React, { useState } from 'react';
import { requestJson } from '../utils/api';
import useApiList from '../hooks/useApiList';
import useApiAction from '../hooks/useApiAction';
import ApiError from '../components/ApiError';

const COLUMNS = [
  { status: 'pending',     label: 'To Do',       bg: '#F5F0E8', accent: '#A8A29E' },
  { status: 'in_progress', label: 'In Progress',  bg: '#EFF6FF', accent: '#3B82F6' },
  { status: 'complete',    label: 'Done',          bg: '#F0FDF4', accent: '#16A34A' },
  { status: 'blocked',     label: 'Blocked',       bg: '#FEF2F2', accent: '#DC2626' },
];

export default function FieldOperations({ projectId }) {
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);
  const [form, setForm]     = useState({ title: '', task_date: date });

  const { data: tasks, loading, error, reload: load } = useApiList(projectId ? `/api/field-tasks/${projectId}?date=${date}` : null);
  const { run, pending, error: actionError } = useApiAction();

  const updateStatus = (id, status) => run(async () => {
    await requestJson(`/api/field-tasks/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  });

  const addTask = () => run(async () => {
    if (!form.title.trim() || !projectId) return;
    await requestJson('/api/field-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, project_id: projectId, task_date: date }),
    });
    setAdding(false);
    setForm({ title: '', task_date: date });
    await load();
  });

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh' }}>
      <div style={{ background: '#1C1917', color: '#F0EBE1', padding: '16px 24px',
        display: 'flex', alignItems: 'center', gap: 16 }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
          fontSize: 24, margin: 0, letterSpacing: '.02em' }}>Field Operations</h1>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 4, border: 'none',
            fontSize: 13, background: '#2C2420', color: '#F0EBE1' }} />
        <button onClick={() => setAdding(true)}
          style={{ marginLeft: 'auto', background: '#C4954A', color: '#FFF', border: 'none',
            borderRadius: 4, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Task
        </button>
      </div>

      <ApiError message={error} onRetry={load} />
      <ApiError message={actionError} />
      {loading && <p role="status">Loading field tasks…</p>}
      {adding && (
        <div style={{ padding: '16px 24px', background: '#FFF', borderBottom: '1px solid #E7E0D5',
          display: 'flex', gap: 10, alignItems: 'center' }}>
          <input placeholder="Task title…" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #E7E0D5',
              borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }} />
          <button onClick={addTask} disabled={pending}
            style={{ background: '#3D5247', color: '#FFF', border: 'none',
              borderRadius: 4, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
            Add
          </button>
          <button onClick={() => setAdding(false)}
            style={{ border: '1px solid #E7E0D5', borderRadius: 4,
              padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, padding: 24 }}>
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.status);
          return (
            <div key={col.status}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em',
                  textTransform: 'uppercase', color: col.accent }}>{col.label}</span>
                <span style={{ background: col.bg, color: col.accent, fontSize: 11,
                  fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                  {colTasks.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 120 }}>
                {colTasks.map(task => (
                  <div key={task.id} style={{ background: '#FFF', border: '1px solid #E7E0D5',
                    borderRadius: 8, padding: '12px 14px', borderLeft: `3px solid ${col.accent}` }}>
                    <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>{task.title}</div>
                    {task.resource_name && (
                      <div style={{ fontSize: 11, color: '#78716C', marginBottom: 8 }}>
                        👷 {task.resource_name}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {COLUMNS.filter(c => c.status !== col.status).map(c => (
                        <button key={c.status} disabled={pending} onClick={() => updateStatus(task.id, c.status)}
                          style={{ fontSize: 10, padding: '2px 8px', border: `1px solid ${c.accent}`,
                            borderRadius: 999, color: c.accent, background: 'transparent',
                            cursor: 'pointer', fontWeight: 600 }}>
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!loading && !error && !colTasks.length && (
                  <div style={{ textAlign: 'center', color: '#D4C9B8', fontSize: 12,
                    padding: '20px 0', border: '2px dashed #E7E0D5', borderRadius: 8 }}>
                    No tasks
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
