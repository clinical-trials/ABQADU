import React, { memo, useState } from 'react';

const format = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const confidence = value => value === 'high' ? 'High' : value === 'medium' ? 'Medium' : value === 'low' ? 'Low' : 'Unknown';

function Opening({ opening }) {
  const floorNote = opening.wallId == null
    ? 'No wall assigned. No area or baseboard deduction applied.'
    : opening.kind === 'window'
      ? 'Window: no baseboard deduction.'
      : opening.reachesFloor === null
        ? 'Floor contact unknown. Check on site; no baseboard deduction applied.'
        : opening.reachesFloor
          ? `${format(opening.baseboardDeductionFt)} ft deducted from baseboard.`
          : 'Above the floor: no baseboard deduction.';
  return <li className="estimate-scan-opening">
    <div className="estimate-surface-heading"><strong>{opening.label}</strong><span className="estimate-surface-confidence" data-confidence={opening.confidence}>RoomPlan confidence: {confidence(opening.confidence)}</span></div>
    <p>{format(opening.widthFt)} ft wide × {format(opening.heightFt)} ft high · {format(opening.wallDeductionSqFt)} sq ft deducted</p>
    <p className="estimate-help">{floorNote}</p>
  </li>;
}

function RoomMeasurementReview({ room }) {
  const [expanded, setExpanded] = useState(false);
  const unlinked = room.openings.filter(opening => opening.wallId == null);
  return <details className="estimate-surface-review" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>Check walls &amp; openings <span>{room.wallCount} walls · {room.openingCount} openings</span></summary>
    {expanded && <>
    <p className="estimate-help">Dimensions are in feet. Areas and deductions use the original scan measurements; rounded rows may differ slightly from the room total. RoomPlan confidence describes surface classification, not measurement accuracy.</p>
    <div className="estimate-wall-list">{room.walls.map(wall => {
      const openings = room.openings.filter(opening => opening.wallId === wall.id);
      const retained = wall.grossAreaSqFt > 0 ? Math.min(100, Math.max(0, wall.netAreaSqFt / wall.grossAreaSqFt * 100)) : 0;
      return <section className="estimate-wall" key={wall.id} aria-label={`${room.name}, ${wall.label}`}>
        <div className="estimate-surface-heading"><h5>{wall.label}</h5><span className="estimate-surface-confidence" data-confidence={wall.confidence}>RoomPlan confidence: {confidence(wall.confidence)}</span></div>
        <p className="estimate-wall-dimensions">{format(wall.lengthFt)} <small>ft long</small> × {format(wall.heightFt)} <small>ft high</small></p>
        <div className="estimate-wall-bar" aria-hidden="true"><span style={{ width: `${retained}%` }}/></div>
        <dl className="estimate-wall-calculation">
          <div><dt>Gross wall</dt><dd>{format(wall.grossAreaSqFt)} <small>sq ft</small></dd></div>
          <div><dt>− Openings</dt><dd>{format(wall.openingDeductionSqFt)} <small>sq ft</small></dd></div>
          <div><dt>= Paintable wall</dt><dd>{format(wall.netAreaSqFt)} <small>sq ft</small></dd></div>
        </dl>
        <p className="estimate-help">Baseboard: {format(wall.baseboardLengthFt)} ft after {format(wall.baseboardDeductionFt)} ft of confirmed floor openings.</p>
        {openings.length > 0 ? <ul className="estimate-opening-list" aria-label={`${wall.label} openings`}>{openings.map(opening => <Opening key={opening.id} opening={opening}/>)}</ul> : <p className="estimate-help">No openings linked to this wall. Check that none were missed.</p>}
      </section>;
    })}</div>
    {unlinked.length > 0 && <section className="estimate-unlinked-openings" aria-label="Openings without a wall">
      <h5>Openings that need a wall</h5><p className="estimate-help">These openings were captured but could not be matched to a wall. No deductions were made for them in the totals above.</p>
      <ul className="estimate-opening-list">{unlinked.map(opening => <Opening key={opening.id} opening={opening}/>)}</ul>
    </section>}
    <p className="estimate-help">Check dimensions and deductions on site. You can adjust the selected quantities in the worksheet before pricing.</p>
    </>}
  </details>;
}

export default memo(RoomMeasurementReview);
