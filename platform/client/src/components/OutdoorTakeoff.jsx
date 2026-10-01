import React, { useState } from 'react';
import { MEASUREMENT_TYPES, calculateOutdoorQuantity } from '../utils/outdoorEstimate';

export default function OutdoorTakeoff({ onAdd, full, initialDraft, onDraftChange, indoor = false }) {
  const [draft, setDraft] = useState(initialDraft || { type: 'concrete', inputs: {}, added: false });
  const { type, inputs, added } = draft;
  const definition = MEASUREMENT_TYPES.find(item => item.id === type);
  const result = calculateOutdoorQuantity(type, inputs);
  function update(patch) {
    const next = { ...draft, ...patch };
    setDraft(next); onDraftChange(next);
  }
  function change(name, value) { update({ inputs: { ...inputs, [name]: value }, added: false }); }
  return <section className="estimate-takeoff" aria-labelledby="estimate-measure-heading">
    <div className="estimate-takeoff-heading"><span className="estimate-eyebrow">Measure → quantity → cost</span><h3 id="estimate-measure-heading">{indoor ? 'Manual room measurements' : 'Measure outdoor work'}</h3><p>{indoor ? 'Use measured dimensions when a room scan is unavailable.' : 'Concrete, earthwork, walls, patios, and fencing.'}</p></div>
    <label htmlFor="estimate-measure-type">What are you measuring?<select id="estimate-measure-type" value={type} onChange={event => update({ type: event.target.value, inputs: {}, added: false })}>{MEASUREMENT_TYPES.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
    <p className="estimate-help">{definition.description}</p>
    <div className="estimate-measure-fields">{definition.fields.filter(field => field.name !== 'waste_pct').map(field => <label key={field.name} htmlFor={`estimate-measure-${field.name}`}>{field.label} ({field.unit}){field.optional && <small> · Optional</small>}<input id={`estimate-measure-${field.name}`} inputMode="decimal" maxLength={12} placeholder={field.optional ? '0' : 'Measured value'} value={inputs[field.name] || ''} onChange={event => change(field.name, event.target.value)}/></label>)}
      <label htmlFor="estimate-measure-waste">Extra material / waste (%) <small>Optional</small><input id="estimate-measure-waste" inputMode="decimal" maxLength={6} placeholder="0" value={inputs.waste_pct || ''} onChange={event => change('waste_pct', event.target.value)}/></label>
    </div>
    <div className="estimate-measured-result"><span>Measured quantity</span><output aria-live="polite">{result.ready ? <><b>{result.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b> {result.unit}</> : 'Enter measurements'}</output>{result.ready && <p>{result.formula}</p>}</div>
    {!result.ready && Object.values(inputs).some(Boolean) && <ul className="estimate-measure-errors">{result.errors.map(error => <li key={error}>{error}</li>)}</ul>}
    <p className="estimate-help">Use your specified dimensions. Quantities round up to 0.01; no waste is added unless you enter it. This calculates material quantities, not a structural design.</p>
    <button type="button" className="estimate-add-measurement" disabled={!result.ready || full || added} onClick={() => { onAdd(result); update({ added: true }); }}>{added ? 'Quantity added to worksheet' : 'Add as a new line item'}</button>
    <p className="estimate-help">Adds the measurement and quantity with a blank unit cost. Combine or remove overlapping checklist items before saving.</p>
  </section>;
}
