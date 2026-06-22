import React from 'react';
import { ROW_HEIGHT, HEADER_H, WBS_WIDTH } from './useGanttState';

export default function WBSTree({ activities, expanded, onToggle, selected, onSelect }) {
  return (
    <div style={{
      width: WBS_WIDTH, flexShrink: 0, borderRight: '1px solid #E7E0D5',
      background: '#FAF7F2', overflowY: 'hidden',
    }}>
      {/* Header spacer */}
      <div style={{
        height: HEADER_H, borderBottom: '1px solid #E7E0D5',
        display: 'flex', alignItems: 'center', padding: '0 12px',
        fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
        textTransform: 'uppercase', color: '#A8A29E',
      }}>
        Activity
      </div>

      {activities.map((a, i) => {
        const indent = (a.wbs_level || 0) * 16;
        const isSelected = selected === a.id;
        const isCritical = a.is_critical;

        return (
          <div
            key={a.id}
            onClick={() => onSelect(a.id)}
            style={{
              height: ROW_HEIGHT, display: 'flex', alignItems: 'center',
              padding: `0 12px 0 ${12 + indent}px`,
              borderBottom: '1px solid #F0EBE1',
              background: isSelected ? '#FFF3E0' : i % 2 === 0 ? '#FAF7F2' : '#FFFFFF',
              cursor: 'pointer', userSelect: 'none',
              transition: 'background .1s',
            }}
          >
            {a.has_children && (
              <span
                onClick={e => { e.stopPropagation(); onToggle(a.id); }}
                style={{ marginRight: 6, fontSize: 10, color: '#A8A29E', cursor: 'pointer' }}
              >
                {expanded.has(a.id) ? '▼' : '▶'}
              </span>
            )}
            <span style={{
              fontSize: 12,
              fontWeight: a.has_children ? 600 : 400,
              color: isCritical ? '#B85C38' : '#1C1917',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {a.name}
            </span>
            {a.pct_complete > 0 && (
              <span style={{ fontSize: 10, color: '#78716C', marginLeft: 6 }}>
                {Math.round(a.pct_complete)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
