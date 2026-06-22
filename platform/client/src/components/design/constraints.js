// ABQ ADU zoning & building code constraint engine
// City of Albuquerque IDO (Integrated Development Ordinance) §14-16-6-7

export const ABQ_RULES = {
  minLotSqft: 5000,
  maxAduSqft: 1000,           // or 50% of primary dwelling, whichever is less
  minAduSqft: 150,
  maxHeight: 18,              // feet (detached ADU)
  minSetbackFront: 20,        // feet
  minSetbackSide: 3,          // feet
  minSetbackRear: 5,          // feet
  egressMinWidth: 20,         // inches (egress window/door)
  egressMinHeight: 24,        // inches
  bedroomMinSqft: 70,         // IRC R304.1 minimum bedroom
  bathroomMinSqft: 35,        // practical minimum
  livingMinSqft: 120,         // IRC R304.1 habitable room
  ceilingMinHeight: 7,        // feet (habitable rooms)
};

export function checkConstraints(rooms, totalSqft) {
  const warnings = [];
  const errors = [];

  // Total size checks
  if (totalSqft > ABQ_RULES.maxAduSqft) {
    errors.push(`Total area ${Math.round(totalSqft)} sf exceeds ABQ ADU maximum of ${ABQ_RULES.maxAduSqft} sf`);
  }
  if (totalSqft < ABQ_RULES.minAduSqft && totalSqft > 0) {
    errors.push(`Total area ${Math.round(totalSqft)} sf is below minimum ADU size of ${ABQ_RULES.minAduSqft} sf`);
  }

  rooms.forEach(room => {
    const GRID = 12;
    const wFt = room.w / GRID;
    const hFt = room.h / GRID;
    const sqft = Math.round(wFt * hFt);

    switch (room.type) {
      case 'bedroom':
        if (sqft < ABQ_RULES.bedroomMinSqft) {
          errors.push(`"${room.label}" is ${sqft} sf — bedrooms must be at least ${ABQ_RULES.bedroomMinSqft} sf (IRC R304.1)`);
        }
        // Egress: at least one wall must be wide enough for egress window (20" min)
        if (wFt * 12 < ABQ_RULES.egressMinWidth && hFt * 12 < ABQ_RULES.egressMinWidth) {
          warnings.push(`"${room.label}" may not accommodate egress window — minimum 20" clear opening required`);
        }
        break;
      case 'bathroom':
        if (sqft < ABQ_RULES.bathroomMinSqft) {
          warnings.push(`"${room.label}" is ${sqft} sf — tight fit for a bathroom (35 sf recommended minimum)`);
        }
        break;
      case 'living':
      case 'dining':
      case 'kitchen':
        if (sqft < ABQ_RULES.livingMinSqft) {
          errors.push(`"${room.label}" is ${sqft} sf — habitable rooms must be at least ${ABQ_RULES.livingMinSqft} sf (IRC R304.1)`);
        }
        break;
      default:
        break;
    }

    // General: rooms shouldn't be thinner than 7 ft in any direction (IRC R304.2)
    if ((wFt < 7 || hFt < 7) && ['bedroom', 'living', 'dining', 'kitchen'].includes(room.type)) {
      warnings.push(`"${room.label}" is less than 7 ft wide — habitable rooms must have a minimum horizontal dimension of 7 ft`);
    }
  });

  // Must have at least one habitable room
  const habitable = rooms.filter(r => ['bedroom', 'living', 'dining', 'kitchen'].includes(r.type));
  if (rooms.length > 0 && habitable.length === 0) {
    errors.push('Floor plan must include at least one habitable room (bedroom, living, kitchen, or dining)');
  }

  // Must have a bathroom if bedrooms exist
  const bedrooms = rooms.filter(r => r.type === 'bedroom');
  const bathrooms = rooms.filter(r => r.type === 'bathroom');
  if (bedrooms.length > 0 && bathrooms.length === 0) {
    errors.push('ADU with bedrooms must include at least one bathroom');
  }

  return { errors, warnings, valid: errors.length === 0 };
}
