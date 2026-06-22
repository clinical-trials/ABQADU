import React, { useRef, useCallback } from 'react';
import { ROW_HEIGHT, HEADER_H } from './useGanttState';

const BAR_H     = 20;
const BAR_Y_OFF = (ROW_HEIGHT - BAR_H) / 2;
const BL_H      = 6;
const BL_Y_OFF  = ROW_HEIGHT - 8;

export default function ActivityBars({ activities, xFromDate, totalWidth, onDrop, onSelect, selected }) {
  const dragging = useRef(null);

  const handleMouseDown = useCallback((e, activity) => {
    if (!activity.planned_start) return;
    dragging.current = {
      activityId: activity.id,
      startX: e.clientX,
      origStart: new Date(activity.planned_start),
      pxPerDay: null, // filled on first move
    };
    const onMove = ev => {
      if (!dragging.current) return;
      const dx = ev.clientX - dragging.current.startX;
      dragging.current.dx = dx;
    };
    const onUp = ev => {
      if (dragging.current && dragging.current.dx) {
        const pxPerDay = xFromDate(new Date(Date.now() + 86400000)) - xFromDate(new Date());
        const daysShift = Math.round(dragging.current.dx / pxPerDay);
        if (daysShift !== 0) onDrop(dragging.current.activityId, daysShift);
      }
      dragging.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [xFromDate, onDrop]);

  return (
    <svg width={totalWidth} height={activities.length * ROW_HEIGHT} style={{ display: 'block' }}>
      {activities.map((a, i) => {
        if (!a.planned_start || !a.planned_finish) return null;
        const x  = xFromDate(a.planned_start);
        const x2 = xFromDate(a.planned_finish);
        const w  = Math.max(x2 - x, 4);
        const y  = i * ROW_HEIGHT;
        const fillW = w * (parseFloat(a.pct_complete) / 100);
        const isCritical = a.is_critical;
        const isSelected = selected === a.id;

        const barColor   = isCritical ? '#B85C38' : '#3D5247';
        const fillColor  = isCritical ? '#D97654' : '#5A7A6A';
        const strokeColor = isSelected ? '#C4954A' : 'transparent';

        return (
          <g key={a.id} style={{ cursor: 'ew-resize' }}
            onMouseDown={e => handleMouseDown(e, a)}
            onClick={() => onSelect(a.id)}
          >
            {/* Row background (alternating) */}
            <rect x={0} y={y} width={totalWidth} height={ROW_HEIGHT}
              fill={i % 2 === 0 ? '#FAF7F2' : '#FFFFFF'} />

            {/* Baseline bar (if present) */}
            {a.bl_start && a.bl_finish && (() => {
              const bx  = xFromDate(a.bl_start);
              const bx2 = xFromDate(a.bl_finish);
              return (
                <rect x={bx} y={y + BL_Y_OFF} width={Math.max(bx2 - bx, 2)} height={BL_H}
                  fill="rgba(120,113,108,0.3)" rx={1} />
              );
            })()}

            {/* Float bar */}
            {a.total_float > 0 && a.planned_finish && (() => {
              const fx  = xFromDate(a.planned_finish);
              const fw  = a.total_float * (xFromDate(new Date(Date.now() + 86400000)) - xFromDate(new Date()));
              return (
                <rect x={fx} y={y + BAR_Y_OFF} width={Math.max(fw, 0)} height={BAR_H}
                  fill={`${barColor}22`} rx={2} />
              );
            })()}

            {/* Main bar background */}
            <rect x={x} y={y + BAR_Y_OFF} width={w} height={BAR_H}
              fill={barColor} rx={3}
              stroke={strokeColor} strokeWidth={isSelected ? 2 : 0}
            />

            {/* Progress fill */}
            {fillW > 0 && (
              <rect x={x} y={y + BAR_Y_OFF} width={fillW} height={BAR_H}
                fill={fillColor} rx={3} />
            )}

            {/* Activity label */}
            {w > 40 && (
              <text x={x + 6} y={y + BAR_Y_OFF + 13}
                fontSize={11} fill="#FFFFFF" fontFamily="DM Sans, sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {a.name.length > 20 ? a.name.slice(0, 18) + '…' : a.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
