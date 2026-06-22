import { useState, useCallback } from 'react';

export const ZOOM_CONFIG = {
  day:   { label: 'Day',   pxPerDay: 40,  headerFn: d => d.toLocaleDateString('en-US', { weekday:'short', day:'numeric' }) },
  week:  { label: 'Week',  pxPerDay: 18,  headerFn: d => `W${getWeek(d)} ${d.toLocaleDateString('en-US', { month:'short', day:'numeric' })}` },
  month: { label: 'Month', pxPerDay: 6,   headerFn: d => d.toLocaleDateString('en-US', { month:'short', year:'numeric' }) },
};

function getWeek(d) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

export const ROW_HEIGHT = 36;
export const WBS_WIDTH  = 300;
export const HEADER_H   = 48;

export function useGanttState(activities) {
  const [zoom, setZoom] = useState('week');
  const [expanded, setExpanded] = useState(new Set());
  const [selected, setSelected] = useState(null);

  const toggleExpand = useCallback(id => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Compute view range from activity dates
  const dates = activities.flatMap(a => [
    a.planned_start && new Date(a.planned_start),
    a.planned_finish && new Date(a.planned_finish),
  ]).filter(Boolean);

  const viewStart = dates.length
    ? new Date(Math.min(...dates.map(d => d.getTime())) - 7 * 86400000)
    : new Date();
  const viewEnd = dates.length
    ? new Date(Math.max(...dates.map(d => d.getTime())) + 14 * 86400000)
    : new Date(Date.now() + 90 * 86400000);

  const pxPerDay = ZOOM_CONFIG[zoom].pxPerDay;

  const xFromDate = useCallback(date => {
    const d = date instanceof Date ? date : new Date(date);
    return Math.round((d - viewStart) / 86400000 * pxPerDay);
  }, [viewStart, pxPerDay]);

  const totalWidth = Math.round((viewEnd - viewStart) / 86400000 * pxPerDay);

  return { zoom, setZoom, expanded, toggleExpand, selected, setSelected,
           viewStart, viewEnd, xFromDate, totalWidth, pxPerDay };
}
