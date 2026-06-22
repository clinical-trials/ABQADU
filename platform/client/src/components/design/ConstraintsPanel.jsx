import React from 'react';
import { checkConstraints, ABQ_RULES } from './constraints';

const S = {
  panel: {
    background: '#0F1F3D', borderTop: '1px solid #1e3060',
    padding: '10px 20px', display: 'flex', gap: 24, alignItems: 'flex-start',
    flexShrink: 0, maxHeight: 120, overflowY: 'auto', flexWrap: 'wrap',
  },
  section: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 },
  label: {
    color: '#C4954A', fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
  },
  item: (kind) => ({
    fontSize: 11, fontFamily: 'DM Sans, sans-serif',
    color: kind === 'error' ? '#e05050' : kind === 'warn' ? '#d4a020' : '#40b870',
    display: 'flex', alignItems: 'flex-start', gap: 4,
  }),
  dot: (kind) => ({
    flexShrink: 0, marginTop: 2,
    color: kind === 'error' ? '#e05050' : kind === 'warn' ? '#d4a020' : '#40b870',
  }),
  rule: {
    fontSize: 10, fontFamily: 'DM Sans, sans-serif', color: '#4a6080',
  },
};

export default function ConstraintsPanel({ rooms, totalSqft }) {
  const { errors, warnings, valid } = checkConstraints(rooms, totalSqft);

  if (rooms.length === 0) return null;

  return (
    <div style={S.panel}>
      <div style={S.section}>
        <div style={S.label}>ABQ Zoning Check</div>
        {valid && warnings.length === 0 && (
          <div style={S.item('ok')}>
            <span style={S.dot('ok')}>✓</span> Meets all ABQ ADU requirements
          </div>
        )}
        {errors.map((e, i) => (
          <div key={i} style={S.item('error')}>
            <span style={S.dot('error')}>✗</span> {e}
          </div>
        ))}
        {warnings.map((w, i) => (
          <div key={i} style={S.item('warn')}>
            <span style={S.dot('warn')}>⚠</span> {w}
          </div>
        ))}
      </div>

      <div style={S.section}>
        <div style={S.label}>Key Limits</div>
        <div style={S.rule}>Max ADU: {ABQ_RULES.maxAduSqft} sf · Min bedroom: {ABQ_RULES.bedroomMinSqft} sf</div>
        <div style={S.rule}>Min habitable room: {ABQ_RULES.livingMinSqft} sf · Min dim: 7 ft</div>
        <div style={S.rule}>Setbacks: {ABQ_RULES.minSetbackFront}′ front · {ABQ_RULES.minSetbackSide}′ side · {ABQ_RULES.minSetbackRear}′ rear</div>
      </div>
    </div>
  );
}
