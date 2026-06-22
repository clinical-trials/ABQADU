import React, { useRef } from 'react';
import { useGanttState, ZOOM_CONFIG, WBS_WIDTH, HEADER_H, ROW_HEIGHT } from './useGanttState';
import TimelineHeader from './TimelineHeader';
import WBSTree from './WBSTree';
import ActivityBars from './ActivityBars';
import DependencyArrows from './DependencyArrows';
import ActivityPanel from './ActivityPanel';

export default function GanttChart({ activities, dependencies, onSaveActivity, onDragActivity }) {
  const scrollRef = useRef(null);
  const {
    zoom, setZoom, expanded, toggleExpand, selected, setSelected,
    viewStart, viewEnd, xFromDate, totalWidth, pxPerDay,
  } = useGanttState(activities);

  const selectedActivity = activities.find(a => a.id === selected);
  const totalHeight = activities.length * ROW_HEIGHT;
  const today = new Date();
  const todayX = Math.round((today - viewStart) / 86400000 * pxPerDay);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '1px solid #E7E0D5', background: '#FAF7F2' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#78716C', marginRight: 4 }}>Zoom:</span>
        {Object.entries(ZOOM_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setZoom(key)}
            style={{
              padding: '4px 12px', borderRadius: 4, border: '1px solid',
              borderColor: zoom === key ? '#3D5247' : '#E7E0D5',
              background: zoom === key ? '#3D5247' : '#FFF',
              color: zoom === key ? '#FFF' : '#57534E',
              fontSize: 12, cursor: 'pointer', fontWeight: zoom === key ? 600 : 400,
            }}>
            {cfg.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: '#A8A29E' }}>
          {activities.filter(a => a.is_critical).length} critical ·
          {' '}{activities.filter(a => a.pct_complete > 0 && a.pct_complete < 100).length} in progress
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: WBS tree */}
        <WBSTree
          activities={activities}
          expanded={expanded}
          onToggle={toggleExpand}
          selected={selected}
          onSelect={setSelected}
        />

        {/* Right: Gantt scroll area */}
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <div style={{ minWidth: totalWidth, position: 'relative' }}>
            <TimelineHeader
              viewStart={viewStart} viewEnd={viewEnd}
              pxPerDay={pxPerDay} zoom={zoom} totalWidth={totalWidth}
            />

            {/* Today vertical line */}
            {todayX >= 0 && todayX <= totalWidth && (
              <div style={{
                position: 'absolute', top: HEADER_H, left: todayX,
                width: 2, height: totalHeight,
                background: '#B85C38', opacity: 0.6, pointerEvents: 'none',
              }} />
            )}

            {/* Bars + arrows container */}
            <div style={{ position: 'relative' }}>
              <ActivityBars
                activities={activities}
                xFromDate={xFromDate}
                totalWidth={totalWidth}
                onDrop={onDragActivity}
                onSelect={setSelected}
                selected={selected}
              />
              <DependencyArrows
                activities={activities}
                dependencies={dependencies}
                xFromDate={xFromDate}
                totalWidth={totalWidth}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Activity edit panel */}
      <ActivityPanel
        activity={selectedActivity}
        onClose={() => setSelected(null)}
        onSave={(id, form) => { onSaveActivity(id, form); setSelected(null); }}
      />
    </div>
  );
}
