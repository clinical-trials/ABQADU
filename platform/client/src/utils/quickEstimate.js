// Scope starters contain no price assumptions. Contractors supply measured
// quantities and current supplier/subcontractor costs before creating a bid.
export const ESTIMATE_TRADES = [
  { id: 'adu', label: 'ADU / casita', environment: 'both', description: 'Start with the main building work packages.' },
  { id: 'concrete', label: 'Concrete', environment: 'outdoor', description: 'Preparation, concrete, placement, and cleanup.' },
  { id: 'stucco', label: 'Stucco / adobe', environment: 'outdoor', description: 'Surface repairs and exterior refinishing.' },
  { id: 'windows', label: 'Windows', environment: 'both', description: 'Window supply, installation, and finishing.' },
  { id: 'kitchen', label: 'Kitchen', environment: 'indoor', description: 'Cabinetry, surfaces, fixtures, and installation.' },
  { id: 'bathroom', label: 'Bathroom', environment: 'indoor', description: 'Waterproofing, fixtures, tile, and installation.' },
  { id: 'painting', label: 'Painting', environment: 'both', description: 'Prep, coatings, application, and cleanup.' },
  { id: 'yardwork', label: 'Yardwork', environment: 'outdoor', description: 'Grounds cleanup, materials, and labor.' },
  { id: 'cleaning', label: 'House cleaning', environment: 'indoor', description: 'Cleaning labor, supplies, and equipment.' },
  { id: 'sitework', label: 'Sitework & excavation', environment: 'outdoor', description: 'Measured earthwork, equipment, fill, and hauling.' },
  { id: 'utilities', label: 'Utility connections', environment: 'outdoor', description: 'Water, electrical, and sewer trade quotes with site restoration.' },
  { id: 'drainage', label: 'Drainage', environment: 'outdoor', description: 'Trenches, pipe, catch basins, and installation.' },
  { id: 'fencing', label: 'Fencing & gates', environment: 'outdoor', description: 'Posts, fence panels, gates, and installation.' },
  { id: 'pavers', label: 'Pavers', environment: 'outdoor', description: 'Measured base, bedding, paver area, and installation.' },
  { id: 'roofing', label: 'Roofing', environment: 'outdoor', description: 'Actual roof slope area, flashing, labor, and disposal.' },
  { id: 'decks', label: 'Decks & portals', environment: 'outdoor', description: 'Deck materials, foundations, covers, and construction labor.' },
  { id: 'other', label: 'Other work', environment: 'both', description: 'Build a custom materials and labor estimate.' },
];

const templates = {
  adu: [
    ['Other', 'Site preparation and utility connections', 'allowance'],
    ['Other', 'Foundation package', 'allowance'],
    ['Other', 'Framing, exterior, and roof package', 'allowance'],
    ['Other', 'Plumbing and electrical trade quotes', 'allowance'],
    ['Other', 'Interior finish package', 'allowance'],
    ['Other', 'Design, permit, and inspection fees', 'allowance'],
  ],
  concrete: [
    ['Labor', 'Excavation and subgrade preparation', 'hr'],
    ['Materials', 'Forms, base, and reinforcement', 'allowance'],
    ['Materials', 'Concrete supply and delivery', 'cu yd'],
    ['Labor', 'Concrete placement and finishing', 'hr'],
    ['Equipment', 'Equipment rental and cleanup', 'day'],
  ],
  stucco: [
    ['Labor', 'Surface inspection, preparation, and repairs', 'hr'],
    ['Materials', 'Repair and coating materials', 'allowance'],
    ['Labor', 'Stucco or adobe finish application', 'hr'],
    ['Equipment', 'Access equipment rental', 'day'],
  ],
  windows: [
    ['Materials', 'Selected windows', 'ea'],
    ['Materials', 'Flashing, sealants, and trim', 'allowance'],
    ['Labor', 'Removal and window installation', 'hr'],
    ['Labor', 'Interior and exterior finish repairs', 'hr'],
  ],
  kitchen: [
    ['Labor', 'Removal and preparation', 'hr'],
    ['Materials', 'Selected cabinets and countertops', 'allowance'],
    ['Materials', 'Selected appliances and fixtures', 'allowance'],
    ['Labor', 'Cabinet and finish installation', 'hr'],
    ['Other', 'Plumbing and electrical trade quotes', 'allowance'],
  ],
  bathroom: [
    ['Labor', 'Removal and preparation', 'hr'],
    ['Materials', 'Waterproofing and tile materials', 'allowance'],
    ['Materials', 'Selected fixtures and fittings', 'allowance'],
    ['Labor', 'Tile and finish installation', 'hr'],
    ['Other', 'Plumbing and electrical trade quotes', 'allowance'],
  ],
  painting: [
    ['Labor', 'Surface preparation and protection', 'hr'],
    ['Materials', 'Primer, paint, and supplies', 'allowance'],
    ['Labor', 'Paint application and cleanup', 'hr'],
  ],
  yardwork: [
    ['Labor', 'Yard cleanup and preparation', 'hr'],
    ['Materials', 'Selected landscape materials', 'allowance'],
    ['Labor', 'Landscape installation or maintenance', 'hr'],
    ['Other', 'Hauling and disposal', 'load'],
  ],
  cleaning: [
    ['Labor', 'House cleaning', 'hr'],
    ['Materials', 'Cleaning supplies', 'allowance'],
    ['Equipment', 'Specialty cleaning equipment', 'day'],
  ],
  sitework: [
    ['Labor', 'Excavation of measured soil volume', 'cu yd'],
    ['Equipment', 'Excavation and compaction equipment rental', 'day'],
    ['Materials', 'Selected fill material and delivery', 'cu yd'],
    ['Other', 'Hauling and disposal of excavated material', 'cu yd'],
    ['Labor', 'Final grading and compaction', 'hr'],
  ],
  utilities: [
    ['Other', 'Utility locating and provider coordination', 'allowance'],
    ['Other', 'Water service connection — trade quote', 'allowance'],
    ['Other', 'Electrical service connection — trade quote', 'allowance'],
    ['Other', 'Sewer service connection — trade quote', 'allowance'],
    ['Labor', 'Measured utility trench excavation and backfill', 'linear ft'],
    ['Other', 'Work area restoration', 'allowance'],
  ],
  drainage: [
    ['Labor', 'Drainage trench excavation', 'linear ft'],
    ['Materials', 'Selected drainage pipe', 'linear ft'],
    ['Materials', 'Catch basins and fittings', 'ea'],
    ['Materials', 'Drainage aggregate and bedding', 'cu yd'],
    ['Labor', 'Drainage installation and backfill', 'hr'],
  ],
  fencing: [
    ['Materials', 'Fence posts and footings', 'ea'],
    ['Materials', 'Fence panels or infill along measured run', 'linear ft'],
    ['Materials', 'Selected gates and hardware', 'ea'],
    ['Labor', 'Fence and gate installation', 'hr'],
  ],
  pavers: [
    ['Labor', 'Paver area excavation and preparation', 'hr'],
    ['Materials', 'Measured aggregate base', 'cu yd'],
    ['Materials', 'Measured bedding material', 'cu yd'],
    ['Materials', 'Selected pavers for measured surface area', 'sq ft'],
    ['Materials', 'Edge restraints', 'linear ft'],
    ['Labor', 'Paver installation and finishing', 'hr'],
  ],
  roofing: [
    ['Materials', 'Roof covering for measured actual slope area', 'sq ft'],
    ['Materials', 'Underlayment for measured actual slope area', 'sq ft'],
    ['Materials', 'Flashing and edge materials', 'linear ft'],
    ['Labor', 'Roof removal and installation', 'hr'],
    ['Other', 'Roofing debris hauling and disposal', 'load'],
  ],
  decks: [
    ['Materials', 'Selected deck surface materials', 'sq ft'],
    ['Materials', 'Deck or portal framing and connectors', 'allowance'],
    ['Other', 'Foundation and footing work — reviewed scope', 'allowance'],
    ['Materials', 'Selected portal or deck cover materials', 'sq ft'],
    ['Labor', 'Deck or portal construction and finishing', 'hr'],
  ],
  other: [
    ['Materials', 'Materials and supplies', 'allowance'],
    ['Labor', 'Installation or service labor', 'hr'],
    ['Equipment', 'Equipment rental', 'day'],
  ],
};

const scopeKeywords = {
  adu: /\b(?:adu|adus|casita|casitas|accessory dwelling)\b/i,
  concrete: /\b(?:concrete|slab|slabs|driveway|driveways|sidewalk|sidewalks)\b/i,
  stucco: /\b(?:stucco|adobe|plaster|plastering)\b/i,
  windows: /\b(?:window|windows|glazing)\b/i,
  kitchen: /\b(?:kitchen|kitchens|cabinet|cabinets|countertop|countertops)\b/i,
  bathroom: /\b(?:bathroom|bathrooms|shower|showers|bathtub|bathtubs)\b/i,
  painting: /\b(?:paint|painting|repaint|repainting)\b/i,
  yardwork: /\b(?:yard|yardwork|landscape|landscaping|lawn|mowing|weeding)\b/i,
  cleaning: /\b(?:clean|cleaning|housekeeping|janitorial)\b/i,
  sitework: /\b(?:site\s?work|excavat(?:e|ion|ing|or)|grading|earthwork|haul[- ]off)\b/i,
  utilities: /\b(?:utilit(?:y|ies)|sewer|water\s+(?:service|line|lines|connection|connections)|electric(?:al)?\s+(?:service|line|lines|connection|connections))\b/i,
  drainage: /\b(?:drainage|french\s+drains?|catch\s+basins?|drain\s+pipes?|swales?)\b/i,
  fencing: /\b(?:fence|fences|fencing|gates?)\b/i,
  pavers: /\b(?:pavers?|hardscape|hardscaping)\b/i,
  roofing: /\b(?:roofs?|roofing|re-?roof(?:ing)?)\b/i,
  decks: /\b(?:decks?|decking|portals?|pergolas?|patio\s+covers?)\b/i,
};

let lineSequence = 0;
export function createLine(overrides = {}) {
  lineSequence += 1;
  return {
    category: 'Materials', description: '', qty: '1', unit: 'ea', unit_cost: '',
    ...overrides,
    id: `estimate-line-${Date.now().toString(36)}-${lineSequence}`,
  };
}

export function createEstimate() {
  return { title: '', scope: '', client_id: '', markup_pct: '60', contingency_pct: '5', tax_pct: '', items: [] };
}

export function getTradeItems(tradeId) {
  if (!Object.prototype.hasOwnProperty.call(templates, tradeId)) return [];
  return templates[tradeId].map(([category, description, unit]) => createLine({ category, description, unit, qty: '' }));
}

export function suggestTrades(scope) {
  if (typeof scope !== 'string') return [];
  return ESTIMATE_TRADES.filter(trade => scopeKeywords[trade.id]?.test(scope)).map(trade => trade.id);
}

const isBlank = value => value == null || (typeof value === 'string' && value.trim() === '');
const isRecord = value => value != null && typeof value === 'object' && !Array.isArray(value);
// Match the bid calculator's aggregate rounding; do not round each line or
// intermediate percentage calculation before the final displayed amounts.
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

function numberValue(value, label, { decimals, max, positive = false }, errors) {
  if (isBlank(value)) {
    errors.push(`${label} is required.`);
    return null;
  }
  if ((typeof value !== 'string' && typeof value !== 'number')
    || !new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(String(value).trim())) {
    errors.push(`${label} must be a number with up to ${decimals} decimal places.`);
    return null;
  }
  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed > max || (positive ? parsed <= 0 : parsed < 0)) {
    errors.push(`${label} must be ${positive ? 'greater than 0' : '0 or more'} and no more than ${max.toLocaleString('en-US')}.`);
    return null;
  }
  return parsed;
}

function textValue(value, label, max, errors, required = false) {
  if (typeof value !== 'string') {
    errors.push(`${label} must be text.`);
  } else if (value.length > max) {
    errors.push(`${label} must be ${max} characters or fewer.`);
  } else if (required && !value.trim()) {
    errors.push(`${label} is required.`);
  }
}

function readEstimate(estimate) {
  const errors = [];
  const draft = isRecord(estimate) ? estimate : createEstimate();
  if (!isRecord(estimate)) errors.push('Enter an estimate before creating a bid.');
  textValue(draft.title, 'Estimate title', 200, errors, true);
  textValue(draft.scope, 'Scope', 5000, errors);
  const clientId = isBlank(draft.client_id) ? null : draft.client_id;
  if (clientId !== null && ((typeof clientId !== 'string' && typeof clientId !== 'number')
    || !/^[1-9]\d*$/.test(String(clientId))
    || !Number.isSafeInteger(Number(clientId)) || Number(clientId) > 2147483647)) {
    errors.push('Select a valid client or leave the client blank.');
  }
  const markupPct = numberValue(draft.markup_pct, 'Overhead and profit markup', { decimals: 2, max: 999.99 }, errors);
  const contingencyPct = numberValue(draft.contingency_pct, 'Contingency', { decimals: 2, max: 100 }, errors);
  const taxPct = numberValue(draft.tax_pct, 'Reviewed tax rate', { decimals: 3, max: 99.999 }, errors);
  const items = Array.isArray(draft.items) ? draft.items : [];
  if (!Array.isArray(draft.items)) errors.push('Estimate line items must be a list.');
  if (!items.length) errors.push('Add at least one priced line item.');
  if (items.length > 100) errors.push('Use no more than 100 line items per estimate.');
  let subtotal = 0;
  let unpricedCount = 0;
  let pricedCount = 0;
  const payloadItems = Array.from(items.slice(0, 100)).map((line, index) => {
    const label = `Line ${index + 1}`;
    if (!isRecord(line)) {
      errors.push(`${label} must contain a description, quantity, and cost.`);
      return null;
    }
    textValue(line.description, `${label} description`, 300, errors, true);
    textValue(line.category, `${label} category`, 80, errors, true);
    textValue(line.unit, `${label} unit`, 20, errors, true);
    if (isBlank(line.qty) || isBlank(line.unit_cost)) unpricedCount += 1;
    const qty = numberValue(line.qty, `${label} quantity`, { decimals: 2, max: 1000000, positive: true }, errors);
    const unitCost = numberValue(line.unit_cost, `${label} unit cost`, { decimals: 2, max: 1000000 }, errors);
    if (qty !== null && unitCost !== null) {
      subtotal += qty * unitCost;
      pricedCount += 1;
    }
    return { category: line.category, description: line.description, qty, unit: line.unit, unit_cost: unitCost, sort_order: index };
  });
  const markup = markupPct === null ? null : subtotal * (markupPct / 100);
  const contingency = contingencyPct === null ? null : subtotal * (contingencyPct / 100);
  const preTax = markup === null || contingency === null ? null : subtotal + markup + contingency;
  const tax = taxPct === null || preTax === null ? null : preTax * (taxPct / 100);
  const total = tax === null ? null : preTax + tax;
  if ([subtotal, preTax, total].some(amount => amount !== null && round2(amount) >= 10000000000)) {
    errors.push('Estimate exceeds the maximum amount supported by invoices. Split it into smaller estimates.');
  }
  const ready = errors.length === 0;
  return {
    result: {
      subtotal: round2(subtotal), markup: markup === null ? null : round2(markup),
      contingency: contingency === null ? null : round2(contingency),
      preTax: preTax === null ? null : round2(preTax), tax: tax === null ? null : round2(tax),
      total: ready ? round2(total) : null, unpricedCount, pricedCount, errors, ready,
    },
    payload: {
      title: draft.title, client_id: clientId === null ? null : String(clientId), project_id: null,
      markup_pct: markupPct, contingency_pct: contingencyPct, tax_pct: taxPct,
      notes: draft.scope, items: payloadItems,
    },
  };
}

export function calculateEstimate(estimate) {
  return readEstimate(estimate).result;
}

export function buildBidPayload(estimate) {
  const { result, payload } = readEstimate(estimate);
  if (!result.ready) throw new Error(result.errors.join(' '));
  return payload;
}
