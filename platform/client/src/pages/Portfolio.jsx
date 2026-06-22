import React, { useState, useEffect } from 'react';

const HEALTH_CONFIG = {
  on_schedule: { label: 'On Schedule', bg: '#D1FAE5', color: '#065F46' },
  at_risk:     { label: 'At Risk',     bg: '#FEF3C7', color: '#92400E' },
  delayed:     { label: 'Delayed',     bg: '#FEE2E2', color: '#B91C1C' },
};

export default function Portfolio() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/portfolio')
      .then(r => r.json())
      .then(data => { setProjects(data); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ padding: 40, fontFamily: 'DM Sans, sans-serif', color: '#78716C' }}>
      Loading portfolio…
    </div>
  );

  const totals = {
    projects: projects.length,
    onTrack:  projects.filter(p => p.health === 'on_schedule').length,
    atRisk:   projects.filter(p => p.health === 'at_risk').length,
    delayed:  projects.filter(p => p.health === 'delayed').length,
  };

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh' }}>
      <div style={{ background: '#1C1917', color: '#F0EBE1', padding: '20px 32px' }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
          fontSize: 28, letterSpacing: '.02em', margin: 0 }}>
          ABQ ADU · Portfolio
        </h1>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 16, padding: '20px 32px',
        borderBottom: '1px solid #E7E0D5', background: '#FFF' }}>
        {[
          { label: 'Total Projects', value: totals.projects, color: '#1C1917' },
          { label: 'On Schedule',   value: totals.onTrack,  color: '#065F46' },
          { label: 'At Risk',       value: totals.atRisk,   color: '#92400E' },
          { label: 'Delayed',       value: totals.delayed,  color: '#B91C1C' },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, background: '#FAF7F2', borderRadius: 8,
            padding: '14px 18px', border: '1px solid #E7E0D5' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color,
              fontFamily: 'Barlow Condensed, sans-serif' }}>{k.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
              textTransform: 'uppercase', color: '#A8A29E', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Project rows */}
      <div style={{ padding: '24px 32px' }}>
        {projects.map(p => {
          const health = HEALTH_CONFIG[p.health] || HEALTH_CONFIG.on_schedule;
          const pct = parseFloat(p.pct_complete) || 0;

          return (
            <div key={p.id} style={{ background: '#FFF', borderRadius: 8, border: '1px solid #E7E0D5',
              marginBottom: 12, padding: '16px 20px', display: 'flex',
              alignItems: 'center', gap: 20 }}>
              <div style={{ flex: 2 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#78716C', marginTop: 2 }}>
                  {p.project_start} → {p.planned_finish} · {p.total_activities} activities
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ flex: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  fontSize: 11, color: '#78716C', marginBottom: 4 }}>
                  <span>Progress</span><span>{pct}%</span>
                </div>
                <div style={{ background: '#E7E0D5', borderRadius: 999, height: 8 }}>
                  <div style={{ width: `${pct}%`, height: 8, borderRadius: 999,
                    background: health.color, transition: 'width .3s' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {p.high_risks > 0 && (
                  <span style={{ fontSize: 11, color: '#B91C1C', fontWeight: 600 }}>
                    ⚠ {p.high_risks} high risk{p.high_risks > 1 ? 's' : ''}
                  </span>
                )}
                <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11,
                  fontWeight: 700, background: health.bg, color: health.color }}>
                  {health.label}
                </span>
              </div>
            </div>
          );
        })}

        {!projects.length && (
          <div style={{ textAlign: 'center', color: '#A8A29E', padding: 48, fontSize: 14 }}>
            No active projects yet.
          </div>
        )}
      </div>
    </div>
  );
}
