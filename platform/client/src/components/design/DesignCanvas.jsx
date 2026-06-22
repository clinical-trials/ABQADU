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

function RoomShape({ room, isSelected, onSelect, onMove, onResize }) {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

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
        draggable
        onClick={() => onSelect(room.id)}
        onTap={() => onSelect(room.id)}
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
      {isSelected && (
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
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  function handleWheel(e) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newScale = Math.min(3, Math.max(0.3, e.evt.deltaY < 0 ? oldScale * 1.1 : oldScale / 1.1));
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  function handleStageClick(e) {
    if (e.target === stageRef.current || e.target.getClassName() === 'Line') {
      if (tool !== 'select') {
        const stage = stageRef.current;
        const pos = stage.getPointerPosition();
        const x = (pos.x - stagePos.x) / stageScale;
        const y = (pos.y - stagePos.y) / stageScale;
        onAddRoom(tool, x, y);
      } else {
        onSelect(null);
      }
    }
  }

  return (
    <Stage
      ref={stageRef}
      width={CANVAS_W}
      height={CANVAS_H}
      scaleX={stageScale}
      scaleY={stageScale}
      x={stagePos.x}
      y={stagePos.y}
      onWheel={handleWheel}
      onClick={handleStageClick}
      onTap={handleStageClick}
      style={{
        background: '#f8f9fc',
        border: '1px solid #dde2ea',
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
            isSelected={selectedId === room.id}
            onSelect={onSelect}
            onMove={onMove}
            onResize={onResize}
          />
        ))}
      </Layer>
    </Stage>
  );
}
