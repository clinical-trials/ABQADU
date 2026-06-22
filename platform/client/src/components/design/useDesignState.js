import { useState, useCallback } from 'react';

export const GRID = 12;        // 1 grid unit = 1 foot (12 px)
export const SNAP = GRID;

export const ROOM_TYPES = [
  { type: 'bedroom',   label: 'Bedroom',    color: '#C8D8E8', defaultW: 12, defaultH: 10 },
  { type: 'bathroom',  label: 'Bathroom',   color: '#D8E8C8', defaultW: 6,  defaultH: 8  },
  { type: 'kitchen',   label: 'Kitchen',    color: '#E8DCC8', defaultW: 10, defaultH: 8  },
  { type: 'living',    label: 'Living',     color: '#E8C8C8', defaultW: 14, defaultH: 12 },
  { type: 'dining',    label: 'Dining',     color: '#D8C8E8', defaultW: 10, defaultH: 8  },
  { type: 'utility',   label: 'Utility',    color: '#C8E8E8', defaultW: 6,  defaultH: 6  },
  { type: 'closet',    label: 'Closet',     color: '#E8E8C8', defaultW: 4,  defaultH: 4  },
  { type: 'porch',     label: 'Porch',      color: '#D0E0D0', defaultW: 8,  defaultH: 6  },
];

function snap(v) {
  return Math.round(v / SNAP) * SNAP;
}

let nextId = 1;

export default function useDesignState() {
  const [rooms, setRooms] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('select');   // 'select' | room type string

  const addRoom = useCallback((type, x, y) => {
    const def = ROOM_TYPES.find(r => r.type === type);
    if (!def) return;
    const room = {
      id: `room-${nextId++}`,
      type,
      label: def.label,
      color: def.color,
      x: snap(x),
      y: snap(y),
      w: def.defaultW * GRID,
      h: def.defaultH * GRID,
    };
    setRooms(prev => [...prev, room]);
    setSelectedId(room.id);
    setTool('select');
    return room.id;
  }, []);

  const moveRoom = useCallback((id, x, y) => {
    setRooms(prev => prev.map(r =>
      r.id === id ? { ...r, x: snap(x), y: snap(y) } : r
    ));
  }, []);

  const resizeRoom = useCallback((id, w, h) => {
    setRooms(prev => prev.map(r =>
      r.id === id
        ? { ...r, w: Math.max(GRID * 2, snap(w)), h: Math.max(GRID * 2, snap(h)) }
        : r
    ));
  }, []);

  const deleteRoom = useCallback((id) => {
    setRooms(prev => prev.filter(r => r.id !== id));
    setSelectedId(null);
  }, []);

  const updateLabel = useCallback((id, label) => {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, label } : r));
  }, []);

  const totalSqft = rooms.reduce((sum, r) => sum + (r.w / GRID) * (r.h / GRID), 0);

  return {
    rooms, setRooms, selectedId, setSelectedId,
    tool, setTool,
    addRoom, moveRoom, resizeRoom, deleteRoom, updateLabel,
    totalSqft,
  };
}
