const wasteField = { name: 'waste_pct', label: 'Waste allowance', unit: '%', optional: true };

export const MEASUREMENT_TYPES = [
  {
    id: 'area', label: 'Area / coverage', unit: 'sq ft',
    description: 'Measure one rectangular surface at a time. For roofing, use actual sloped surface measurements for each roof plane, not the building footprint.',
    fields: [
      { name: 'length', label: 'Length', unit: 'ft' },
      { name: 'width', label: 'Width', unit: 'ft' },
      wasteField,
    ],
  },
  {
    id: 'concrete', label: 'Concrete volume', unit: 'cu yd',
    description: 'Convert a measured length, width, and thickness to cubic yards.',
    fields: [
      { name: 'length', label: 'Length', unit: 'ft' },
      { name: 'width', label: 'Width', unit: 'ft' },
      { name: 'depth', label: 'Thickness', unit: 'in' },
      wasteField,
    ],
  },
  {
    id: 'excavation', label: 'Excavation volume', unit: 'cu yd',
    description: 'Estimate a rectangular excavation using measured depth in feet.',
    fields: [
      { name: 'length', label: 'Length', unit: 'ft' },
      { name: 'width', label: 'Width', unit: 'ft' },
      { name: 'depth', label: 'Depth', unit: 'ft' },
      wasteField,
    ],
  },
  {
    id: 'wall', label: 'Wall / stucco area', unit: 'sq ft',
    description: 'Deduct door and window opening areas from one rectangular wall.',
    fields: [
      { name: 'length', label: 'Wall length', unit: 'ft' },
      { name: 'height', label: 'Wall height', unit: 'ft' },
      { name: 'openings', label: 'Openings to deduct', unit: 'sq ft', optional: true },
      wasteField,
    ],
  },
  {
    id: 'fence', label: 'Fence / linear run', unit: 'linear ft',
    description: 'Deduct gate and other opening widths from the measured run.',
    fields: [
      { name: 'length', label: 'Run length', unit: 'ft' },
      { name: 'openings', label: 'Gates / openings to deduct', unit: 'ft', optional: true },
      wasteField,
    ],
  },
];

const isBlank = value => value == null || (typeof value === 'string' && value.trim() === '');
const display = scaled => String(Number(scaled) / 100);

function parseDimension(value, field, errors) {
  if (isBlank(value)) {
    if (field.optional) return 0n;
    errors.push(`${field.label} is required.`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length > 32 || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    errors.push(`${field.label} must be a number with up to 2 decimal places.`);
    return null;
  }
  const [integer, fraction = ''] = value.trim().split('.');
  const scaled = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0'));
  const maximum = field.name === 'waste_pct' ? 10000n : 100000000n;
  if (scaled > maximum || (!field.optional && scaled === 0n)) {
    errors.push(`${field.label} must be ${field.optional ? '0 or more' : 'greater than 0'} and no more than ${field.name === 'waste_pct' ? '100' : '1,000,000'} ${field.unit}.`);
    return null;
  }
  return scaled;
}

export function calculateOutdoorQuantity(type, inputs) {
  const metadata = MEASUREMENT_TYPES.find(entry => entry.id === type);
  const errors = [];
  const invalid = () => ({ ready: false, quantity: null, unit: metadata?.unit || '', description: '', formula: '', errors });
  if (!metadata) {
    errors.push('Choose a supported measurement type.');
    return invalid();
  }
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    errors.push('Enter the dimensions for this measurement.');
    return invalid();
  }
  const values = {};
  for (const field of metadata.fields) values[field.name] = parseDimension(inputs[field.name], field, errors);
  if (errors.length) return invalid();

  const { length, width, height, depth, openings, waste_pct: waste } = values;
  let numerator;
  let denominator;
  let dimensions;
  let equation;

  // Integer hundredths keep exact input precision even for large dimensions.
  // Carry the rational quantity through unit conversion and waste, then round
  // up once; floating-point multiplication must not add an extra hundredth.
  if (type === 'area') {
    numerator = length * width;
    denominator = 10000n;
    dimensions = `${display(length)} ft × ${display(width)} ft`;
    equation = `${display(length)} × ${display(width)}`;
  } else if (type === 'concrete') {
    numerator = length * width * depth;
    denominator = 1000000n * 12n * 27n;
    dimensions = `${display(length)} ft × ${display(width)} ft × ${display(depth)} in`;
    equation = `${display(length)} × ${display(width)} × (${display(depth)} ÷ 12) ÷ 27`;
  } else if (type === 'excavation') {
    numerator = length * width * depth;
    denominator = 1000000n * 27n;
    dimensions = `${display(length)} ft × ${display(width)} ft × ${display(depth)} ft`;
    equation = `${display(length)} × ${display(width)} × ${display(depth)} ÷ 27`;
  } else if (type === 'wall') {
    numerator = length * height - openings * 100n;
    denominator = 10000n;
    dimensions = `${display(length)} ft × ${display(height)} ft; deduct ${display(openings)} sq ft openings`;
    equation = `(${display(length)} × ${display(height)}) − ${display(openings)}`;
  } else {
    numerator = length - openings;
    denominator = 100n;
    dimensions = `${display(length)} ft run; deduct ${display(openings)} ft gates / openings`;
    equation = `${display(length)} − ${display(openings)}`;
  }

  if (numerator <= 0n) {
    errors.push('Openings must leave a measured area or run greater than zero.');
    return invalid();
  }
  numerator *= 10000n + waste;
  denominator *= 10000n;
  if (numerator > denominator * 1000000n) {
    errors.push('Calculated quantity exceeds the 1,000,000 limit. Split the work into smaller measured sections.');
    return invalid();
  }
  const quantityHundredths = (numerator * 100n + denominator - 1n) / denominator;
  const quantity = Number(quantityHundredths) / 100;
  return {
    ready: true,
    quantity,
    unit: metadata.unit,
    description: `${metadata.label}: ${dimensions}; ${display(waste)}% waste; ${quantity} ${metadata.unit} (rounded up).`,
    formula: `(${equation}) × (1 + ${display(waste)} ÷ 100) = ${quantity} ${metadata.unit}, rounded up to 0.01 ${metadata.unit}.`,
    errors,
  };
}
