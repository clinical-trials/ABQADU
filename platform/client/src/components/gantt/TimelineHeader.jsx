import React, { useMemo } from 'react';
import { ZOOM_CONFIG, HEADER_H } from './useGanttState';

export default function TimelineHeader({ viewStart, viewEnd, pxPerDay, zoom, totalWidth }) {
  const config = ZOOM_CONFIG[zoom];

  const ticks = useMemo(() => {
    const result = [];
    const d = new Date(viewStart);
    while (d <= viewEnd) {
      result.push(new Date(d));
      d.setDate(d.getDate() + (zoom === 'day' ? 1 : zoom === 'week' ? 7 : 30));
    }
    return result;
  }, [viewStart, viewEnd, zoom]);

  const today = new Date();
  const todayX = Math.round((today - viewStart) / 86400000 * pxPerDay);

  return (
    <svg width={totalWidth} height={HEADER_H} style={{ display: 'block', flexShrink: 0 }}>
      {/* Weekend shading */}
      {zoom !== 'month' && Array.from({ length: Math.ceil((viewEnd - viewStart) / 86400000) }, (_, i) => {
        const d = new Date(viewStart);
        d.setDate(d.getDate() + i);
        const dow = d.getDay();
        if (dow === 0 || dow === 6) {
          return (
            <rect key={i} x={i * pxPerDay} y={0} width={pxPerDay} height={HEADER_H}
              fill="rgba(0,0,0,0.04)" />
          );
        }
        return null;
      })}

      {/* Tick labels */}
      {ticks.map((d, i) => {
        const x = Math.round((d - viewStart) / 86400000 * pxPerDay);
        return (
          <g key={i}>
            <line x1={x} y1={HEADER_H - 8} x2={x} y2={HEADER_H} stroke="#C9B99A" strokeWidth={1} />
            <text x={x + 4} y={HEADER_H - 14} fontSize={10} fill="#78716C" fontFamily="DM Sans, sans-serif">
              {config.headerFn(d)}
            </text>
          </g>
        );
      })}

      {/* Today line */}
      {todayX >= 0 && todayX <= totalWidth && (
        <line x1={todayX} y1={0} x2={todayX} y2={HEADER_H} stroke="#B85C38" strokeWidth={2} />
      )}

      <line x1={0} y1={HEADER_H - 1} x2={totalWidth} y2={HEADER_H - 1} stroke="#E7E0D5" strokeWidth={1} />
    </svg>
  );
}
