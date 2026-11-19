import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Text, Line, Group, Transformer } from 'react-konva';
import { GRID, SNAP } from './useDesignState';

const CANVAS_W = 1200;
const CANVAS_H = 900;
const WALL_THICK = 3;

function GridLayer() {
  const lines = [];
  for (let x = 0; x <= CANVAS_W; x += GRID) {
    lines.push(
      <Line key={`v${x}`} points={[x, 0, x, CANVAS_H]}
        stroke={x % (GRID * 5) === 0 ? '#c8d0dc' : '#e4e8ef'} strokeWidth={1} />
    );
  }
  for (let y = 0; y <= CANVAS_H; y += GRID) {
    lines.push(
      <Line key={`h${y}`} points={[0, y, CANVAS_W, y]}
        stroke={y % (GRID * 5) === 0 ? '#c8d0dc' : '#e4e8ef'} strokeWidth={1} />
    );
  }
  return <>{lines}</>;
}

function RoomShape({ room, isSelected, onSelect, onMove, onResize, panning }) {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, panning]);

  function handleDragEnd(e) {
    onMove(room.id, e.target.x(), e.target.y());
  }

  function handleTransformEnd() {
    const node = shapeRef.current;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onResize(room.id, Math.max(SNAP * 2, node.width() * scaleX), Math.max(SNAP * 2, node.height() * scaleY));
  }

  return (
    <>
      <Group
        x={room.x} y={room.y}
        draggable={!panning}
        onPointerClick={() => !panning && onSelect(room.id)}
        onDragEnd={handleDragEnd}
        dragBoundFunc={pos => ({
          x: Math.round(pos.x / SNAP) * SNAP,
          y: Math.round(pos.y / SNAP) * SNAP,
        })}
      >
        <Rect
          ref={shapeRef}
          width={room.w}
          height={room.h}
          fill={room.color}
          stroke={isSelected ? '#C4954A' : '#1a2a4a'}
          strokeWidth={isSelected ? WALL_THICK + 1 : WALL_THICK}
          shadowColor={isSelected ? '#C4954A' : 'transparent'}
          shadowBlur={isSelected ? 8 : 0}
          onTransformEnd={handleTransformEnd}
        />
        <Text
          text={room.label}
          width={room.w}
          height={room.h}
          align="center"
          verticalAlign="middle"
          fontSize={11}
          fontFamily="DM Sans, sans-serif"
          fill="#0F1F3D"
          fontStyle="600"
        />
        <Text
          text={`${Math.round((room.w / GRID) * (room.h / GRID))} sf`}
          y={room.h / 2 + 10}
          width={room.w}
          align="center"
          fontSize={9}
          fontFamily="DM Sans, sans-serif"
          fill="#4a5a6a"
        />
      </Group>
      {isSelected && !panning && (
        <Transformer
          ref={trRef}
          keepRatio={false}
          rotateEnabled={false}
          boundBoxFunc={(oldBox, newBox) => ({
            ...newBox,
            width: Math.max(SNAP * 2, newBox.width),
            height: Math.max(SNAP * 2, newBox.height),
          })}
        />
      )}
    </>
  );
}

export default function DesignCanvas({ rooms, selectedId, tool, onSelect, onMove, onResize, onAddRoom }) {
  const stageRef = useRef();
  const hostRef = useRef();
  const [viewport, setViewport] = useState({ width: CANVAS_W, height: CANVAS_H });
  const [fitMode, setFitMode] = useState(true);
  const [panning, setPanning] = useState(false);
  useEffect(() => {
    const measure = () => {
      const width = Math.max(1, Math.min(CANVAS_W, Math.floor(hostRef.current?.getBoundingClientRect().width || CANVAS_W)));
      setViewport({ width, height: width < 768 ? 400 : 650 });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (hostRef.current) observer?.observe(hostRef.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  const fitScale = Math.min(viewport.width / CANVAS_W, viewport.height / CANVAS_H);
  const scale = fitMode ? fitScale : stageScale;
  const position = fitMode ? { x: 0, y: 0 } : stagePos;
  function zoom(factor) {
    const next = Math.max(0.1, Math.min(3, scale * factor));
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    setStagePos({ x: center.x - (center.x - position.x) * next / scale, y: center.y - (center.y - position.y) * next / scale });
    setStageScale(next); setFitMode(false);
  }

  function handleWheel(e) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newScale = Math.min(3, Math.max(0.1, e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1));
    setFitMode(false);
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  function handleStageClick(e) {
    if (panning) return;
    if (e.target === stageRef.current || e.target.getClassName() === 'Line') {
      if (tool !== 'select') {
        const stage = stageRef.current;
        const pos = stage.getPointerPosition();
        const x = (pos.x - position.x) / scale;
        const y = (pos.y - position.y) / scale;
        onAddRoom(tool, x, y);
      } else {
        onSelect(null);
      }
    }
  }

  return (
    <div ref={hostRef} className="design-canvas-viewport">
      <div className="design-canvas-controls" role="group" aria-label="Drawing view controls">
        <button type="button" onClick={() => zoom(1 / 1.25)}>Zoom out</button>
        <button type="button" onClick={() => { setFitMode(true); setStagePos({ x: 0, y: 0 }); }}>Fit plan</button>
        <button type="button" onClick={() => zoom(1.25)}>Zoom in</button>
        <button type="button" aria-pressed={panning} onClick={() => setPanning(value => !value)}>Move view</button>
      </div>
      <p className="design-canvas-help">{panning ? 'Drag the drawing to move your view. Turn off Move view to edit rooms.' : 'Tap a room to select it. Use the zoom buttons for details. Viewing controls do not change measurements.'}</p>
    <Stage
      ref={stageRef}
      width={viewport.width}
      height={viewport.height}
      scaleX={scale}
      scaleY={scale}
      x={position.x}
      y={position.y}
      draggable={panning}
      onDragEnd={event => { if (event.target === stageRef.current) { setFitMode(false); setStageScale(scale); setStagePos({ x: event.target.x(), y: event.target.y() }); } }}
      onWheel={handleWheel}
      onPointerClick={handleStageClick}
      style={{
        background: '#f8f9fc',
        outline: '1px solid #dde2ea',
        borderRadius: 4,
        cursor: tool !== 'select' ? 'crosshair' : 'default',
      }}
    >
      <Layer>
        <GridLayer />
      </Layer>
      <Layer>
        {rooms.map(room => (
          <RoomShape
            key={room.id}
            room={room}
            panning={panning}
            isSelected={selectedId === room.id}
            onSelect={onSelect}
            onMove={onMove}
            onResize={onResize}
          />
        ))}
      </Layer>
    </Stage>
    </div>
  );
}
