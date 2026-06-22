import React from 'react';

const LABELS = ['', 'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'];
const IMPACT = ['', 'Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

function cellColor(p, i) {
  const score = p * i;
  if (score >= 15) return '#FEE2E2';
  if (score >= 8)  return '#FEF3C7';
  return '#D1FAE5';
}

export default function RiskMatrix({ risks, onSelect }) {
  // Map risk positions
  const risksByCell = {};
  for (const r of risks) {
    if (r.probability && r.impact) {
      const key = `${r.probability}-${r.impact}`;
      if (!risksByCell[key]) risksByCell[key] = [];
      risksByCell[key].push(r);
    }
  }

  const size = 52;

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em',
        textTransform: 'uppercase', color: '#A8A29E', marginBottom: 12 }}>
        Risk Matrix (Probability × Impact)
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `48px repeat(5, ${size}px)`, gap: 2 }}>
        {/* Header row */}
        <div />
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ fontSize: 9, textAlign: 'center', color: '#78716C',
            fontWeight: 600, padding: '2px 0' }}>
            {IMPACT[i]}
          </div>
        ))}

        {/* Grid rows (probability 5→1, top to bottom) */}
        {[5,4,3,2,1].map(p => (
          <React.Fragment key={p}>
            <div style={{ fontSize: 9, color: '#78716C', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              paddingRight: 6 }}>
              {LABELS[p]}
            </div>
            {[1,2,3,4,5].map(i => {
              const key = `${p}-${i}`;
              const cellRisks = risksByCell[key] || [];
              return (
                <div key={i} style={{
                  width: size, height: size, background: cellColor(p, i),
                  border: '1px solid rgba(0,0,0,0.06)', borderRadius: 4,
                  display: 'flex', flexWrap: 'wrap', gap: 2,
                  padding: 4, cursor: cellRisks.length ? 'pointer' : 'default',
                }}>
                  {cellRisks.map(r => (
                    <div key={r.id} onClick={() => onSelect && onSelect(r)}
                      title={r.title}
                      style={{
                        width: 12, height: 12, borderRadius: '50%',
                        background: '#1C1917', opacity: .7,
                        fontSize: 8, color: '#FFF', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}>
                      {r.risk_score}
                    </div>
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 10, color: '#78716C' }}>
        <span>🟢 Low (1-7)</span>
        <span>🟡 Medium (8-14)</span>
        <span>🔴 High (15-25)</span>
      </div>
    </div>
  );
}
