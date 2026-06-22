// Auto bill-of-materials from floor plan room data

const MATERIAL_RATES = {
  framing:         { unit: 'lf',   costPerUnit: 4.50,  label: 'Framing lumber' },
  insulation:      { unit: 'sf',   costPerUnit: 1.80,  label: 'Wall insulation' },
  drywall:         { unit: 'sf',   costPerUnit: 2.20,  label: 'Drywall (walls + ceiling)' },
  flooring:        { unit: 'sf',   costPerUnit: 8.50,  label: 'Flooring (LVP)' },
  paint:           { unit: 'sf',   costPerUnit: 1.20,  label: 'Paint (walls + ceiling)' },
  electrical:      { unit: 'sf',   costPerUnit: 12.00, label: 'Electrical rough-in' },
  plumbing:        { unit: 'fix',  costPerUnit: 850,   label: 'Plumbing fixture (each)' },
  hvac:            { unit: 'sf',   costPerUnit: 9.00,  label: 'HVAC (mini-split system)' },
  tile:            { unit: 'sf',   costPerUnit: 14.00, label: 'Tile (bathroom)' },
  cabinetry:       { unit: 'lf',   costPerUnit: 280,   label: 'Cabinetry' },
  countertop:      { unit: 'lf',   costPerUnit: 95,    label: 'Countertop' },
  roofing:         { unit: 'sf',   costPerUnit: 6.50,  label: 'Roofing (metal)' },
  exterior_siding: { unit: 'sf',   costPerUnit: 7.00,  label: 'Exterior siding' },
  foundation:      { unit: 'sf',   costPerUnit: 18.00, label: 'Foundation/slab' },
};

const CEILING_HEIGHT = 9;
const GRID = 12;

function ftFromPx(px) { return px / GRID; }

function perimeter(rooms) {
  return rooms.reduce((sum, r) => {
    const w = ftFromPx(r.w);
    const h = ftFromPx(r.h);
    return sum + 2 * (w + h);
  }, 0);
}

function totalSqft(rooms) {
  return rooms.reduce((sum, r) => sum + ftFromPx(r.w) * ftFromPx(r.h), 0);
}

function countByType(rooms, type) {
  return rooms.filter(r => r.type === type).length;
}

function sqftByType(rooms, type) {
  return rooms.filter(r => r.type === type).reduce((s, r) => s + ftFromPx(r.w) * ftFromPx(r.h), 0);
}

function kitchenLf(rooms) {
  return rooms.filter(r => r.type === 'kitchen').reduce((s, r) => {
    const w = ftFromPx(r.w);
    const h = ftFromPx(r.h);
    return s + Math.min(w, h);
  }, 0);
}

export function generateBOM(rooms) {
  if (!rooms || rooms.length === 0) return [];

  const totalSf = totalSqft(rooms);
  const perimLf = perimeter(rooms);
  const wallSf = perimLf * CEILING_HEIGHT;
  const bathroomSf = sqftByType(rooms, 'bathroom');
  const bathCount = countByType(rooms, 'bathroom');
  const bedroomCount = countByType(rooms, 'bedroom');
  const kitchenLfVal = kitchenLf(rooms);

  const items = [
    { category: 'Structure',  ...MATERIAL_RATES.foundation,      qty: Math.round(totalSf),     total: Math.round(totalSf * MATERIAL_RATES.foundation.costPerUnit) },
    { category: 'Structure',  ...MATERIAL_RATES.framing,         qty: Math.round(perimLf * 3), total: Math.round(perimLf * 3 * MATERIAL_RATES.framing.costPerUnit) },
    { category: 'Structure',  ...MATERIAL_RATES.roofing,         qty: Math.round(totalSf * 1.15), total: Math.round(totalSf * 1.15 * MATERIAL_RATES.roofing.costPerUnit) },
    { category: 'Exterior',   ...MATERIAL_RATES.exterior_siding, qty: Math.round(wallSf * 0.7), total: Math.round(wallSf * 0.7 * MATERIAL_RATES.exterior_siding.costPerUnit) },
    { category: 'Interior',   ...MATERIAL_RATES.insulation,      qty: Math.round(wallSf),      total: Math.round(wallSf * MATERIAL_RATES.insulation.costPerUnit) },
    { category: 'Interior',   ...MATERIAL_RATES.drywall,         qty: Math.round(wallSf + totalSf), total: Math.round((wallSf + totalSf) * MATERIAL_RATES.drywall.costPerUnit) },
    { category: 'Interior',   ...MATERIAL_RATES.flooring,        qty: Math.round(totalSf - bathroomSf), total: Math.round((totalSf - bathroomSf) * MATERIAL_RATES.flooring.costPerUnit) },
    { category: 'Interior',   ...MATERIAL_RATES.paint,           qty: Math.round(wallSf + totalSf), total: Math.round((wallSf + totalSf) * MATERIAL_RATES.paint.costPerUnit) },
    { category: 'MEP',        ...MATERIAL_RATES.electrical,      qty: Math.round(totalSf),     total: Math.round(totalSf * MATERIAL_RATES.electrical.costPerUnit) },
    { category: 'MEP',        ...MATERIAL_RATES.hvac,            qty: Math.round(totalSf),     total: Math.round(totalSf * MATERIAL_RATES.hvac.costPerUnit) },
  ];

  if (bathCount > 0) {
    items.push({ category: 'Plumbing', ...MATERIAL_RATES.plumbing, qty: bathCount * 3 + bedroomCount, total: (bathCount * 3 + bedroomCount) * MATERIAL_RATES.plumbing.costPerUnit });
    items.push({ category: 'Bathroom', ...MATERIAL_RATES.tile,     qty: Math.round(bathroomSf * 2.5), total: Math.round(bathroomSf * 2.5 * MATERIAL_RATES.tile.costPerUnit) });
  }

  if (kitchenLfVal > 0) {
    items.push({ category: 'Kitchen', ...MATERIAL_RATES.cabinetry,   qty: Math.round(kitchenLfVal), total: Math.round(kitchenLfVal * MATERIAL_RATES.cabinetry.costPerUnit) });
    items.push({ category: 'Kitchen', ...MATERIAL_RATES.countertop,  qty: Math.round(kitchenLfVal), total: Math.round(kitchenLfVal * MATERIAL_RATES.countertop.costPerUnit) });
  }

  const grandTotal = items.reduce((s, i) => s + i.total, 0);

  return { items, grandTotal, totalSf: Math.round(totalSf), costPerSf: Math.round(grandTotal / totalSf) };
}
