import React from 'react';
import { ROW_HEIGHT, HEADER_H } from './useGanttState';

const BAR_H     = 20;
const BAR_Y_OFF = (ROW_HEIGHT - BAR_H) / 2;
const MID_Y     = BAR_Y_OFF + BAR_H / 2;

function activityIndex(activities, id) {
  return activities.findIndex(a => a.id === id);
}

export default function DependencyArrows({ activities, dependencies, xFromDate, totalWidth }) {
  const actByIdx = id => activities.find(a => a.id === id);

  return (
    <svg
      width={totalWidth}
      height={activities.length * ROW_HEIGHT}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#A8A29E" />
        </marker>
        <marker id="arrow-critical" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#B85C38" />
        </marker>
      </defs>

      {dependencies.map(dep => {
        const pred = actByIdx(dep.predecessor_id);
        const succ = actByIdx(dep.successor_id);
        if (!pred || !succ) return null;
        if (!pred.planned_start || !succ.planned_start) return null;

        const pi = activityIndex(activities, pred.id);
        const si = activityIndex(activities, succ.id);

        const isCritical = pred.is_critical && succ.is_critical;
        const color = isCritical ? '#B85C38' : '#A8A29E';
        const marker = isCritical ? 'url(#arrow-critical)' : 'url(#arrow)';

        let x1, y1, x2, y2, path;

        switch (dep.dep_type) {
          case 'FS':
          default: {
            x1 = xFromDate(pred.planned_finish);
            y1 = pi * ROW_HEIGHT + MID_Y;
            x2 = xFromDate(succ.planned_start) - 1;
            y2 = si * ROW_HEIGHT + MID_Y;
            const mx = (x1 + x2) / 2;
            path = `M${x1},${y1} H${mx} V${y2} H${x2}`;
            break;
          }
          case 'SS': {
            x1 = xFromDate(pred.planned_start);
            y1 = pi * ROW_HEIGHT + MID_Y;
            x2 = xFromDate(succ.planned_start) - 1;
            y2 = si * ROW_HEIGHT + MID_Y;
            path = `M${x1},${y1} V${y2} H${x2}`;
            break;
          }
          case 'FF': {
            x1 = xFromDate(pred.planned_finish);
            y1 = pi * ROW_HEIGHT + MID_Y;
            x2 = xFromDate(succ.planned_finish) + 1;
            y2 = si * ROW_HEIGHT + MID_Y;
            path = `M${x1},${y1} V${y2} H${x2}`;
            break;
          }
          case 'SF': {
            x1 = xFromDate(pred.planned_start);
            y1 = pi * ROW_HEIGHT + MID_Y;
            x2 = xFromDate(succ.planned_finish) + 1;
            y2 = si * ROW_HEIGHT + MID_Y;
            const mx2 = (x1 + x2) / 2;
            path = `M${x1},${y1} H${mx2} V${y2} H${x2}`;
            break;
          }
        }

        return (
          <path key={dep.id} d={path}
            fill="none" stroke={color} strokeWidth={1.5}
            markerEnd={marker} />
        );
      })}
    </svg>
  );
}
