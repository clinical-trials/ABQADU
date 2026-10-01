import React, { useEffect, useRef, useState } from 'react';
import { DEMO_ROOM_SCAN, parseRoomScan } from '../utils/roomScan';
import RoomMeasurementReview from './RoomMeasurementReview';

const MAX_FILE_BYTES = 1024 * 1024;
const initial = { result: null, filename: '', selected: [], reviewed: false };
const kindLabels = { walls: 'Wall preparation / painting', floor: 'Flooring', ceiling: 'Ceiling work', baseboard: 'Baseboard / trim' };
const format = value => value == null ? 'Not captured' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function IndoorRoomScan({ initialDraft, onDraftChange, onAdd, canEdit, existingKeys, remainingLines }) {
  const [draft, setDraft] = useState(initialDraft || initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current += 1; }; }, []);
  const { result, filename, selected, reviewed } = draft;
  const importedKey = item => JSON.stringify([result.scanId, item.key]);
  const eligible = item => item.qty !== '' && Number(item.qty) > 0 && !existingKeys.includes(importedKey(item));
  const chosen = result?.ready ? result.items.filter(item => selected.includes(item.key) && eligible(item)) : [];
  function update(patch) {
    if (!canEdit()) return;
    const next = { ...draft, ...patch };
    setDraft(next); onDraftChange(next); setError('');
  }
  function accept(raw, name) {
    if (!canEdit()) return;
    const parsed = parseRoomScan(raw);
    if (!parsed.ready) { setError(parsed.errors.join(' ')); return; }
    const next = { result: parsed, filename: name, selected: parsed.items.filter(item => item.kind === 'walls' && item.qty !== '').map(item => item.key), reviewed: false };
    setDraft(next); onDraftChange(next); setError('');
  }
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canEdit()) return;
    const ticket = ++generation.current;
    setError('');
    if (!/\.json$/i.test(file.name) || file.size > MAX_FILE_BYTES || file.size === 0) {
      setError('Choose an ABQ room scan JSON file between 1 byte and 1 MB. Your current scan is unchanged.'); return;
    }
    setBusy(true);
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The file could not be read. Please choose it again.'));
        reader.readAsText(file);
      });
      if (alive.current && ticket === generation.current && canEdit()) accept(text, file.name);
    } catch (failure) {
      if (alive.current && ticket === generation.current && canEdit()) setError(failure.message);
    } finally {
      if (alive.current && ticket === generation.current) setBusy(false);
    }
  }
  function addSelected() {
    if (!canEdit() || !reviewed || !chosen.length || chosen.length > remainingLines || busy) return;
    const added = onAdd(chosen.map(item => ({ ...item, scanKey: importedKey(item) })), result);
    if (added) update({ selected: [] });
  }
  return <section id="room-scan" className="estimate-room-scan" aria-labelledby="room-scan-heading">
    <header className="estimate-scan-heading"><span className="estimate-eyebrow">Indoor / LiDAR</span><h3 id="room-scan-heading">Walk the room.<br/>Bring back the measurements.</h3><p>Review scanned walls, openings, and floor area before turning them into priced work.</p></header>
    <ol className="estimate-scan-steps"><li><b>1</b> Scan on iPhone or iPad</li><li><b>2</b> Import &amp; review</li><li><b>3</b> Add your costs</li></ol>
    <p className="estimate-help">Capture uses the ABQ Room Scanner companion on a LiDAR-equipped device. The companion still needs device setup and testing; this browser can review exported scans now.</p>
    <div className="estimate-scan-actions"><label htmlFor="room-scan-file">Import room scan<input id="room-scan-file" type="file" accept=".json,application/json" disabled={busy} onChange={importFile}/></label><button type="button" disabled={busy} onClick={() => { generation.current += 1; accept(DEMO_ROOM_SCAN, 'Sample room — demonstration only'); }}>Try sample room</button></div>
    <p className="estimate-help">ABQ room scan JSON · up to 1 MB. The file is read in this tab. Only selected quantities and their scan references are included when you save a bid.</p>
    {busy && <p role="status">Reading room measurements…</p>}
    {error && <p role="alert" className="estimate-feedback">{error}{result && ' The previous scan remains below.'}</p>}
    {result?.ready && <div className="estimate-scan-preview">
      <div className="estimate-scan-source"><b>{result.source.mode === 'fixture' ? 'Sample room · not a site measurement' : 'Imported room measurements · review required'}</b><span>{filename}</span></div>
      {result.rooms.map(room => <article className="estimate-scan-room" key={room.id}>
        <h4>{room.name}</h4><p className="estimate-help">{room.wallCount} walls · {room.openingCount} openings · {format(room.grossWallAreaSqFt)} sq ft of wall before deductions</p><dl className="estimate-scan-quantities"><div><dt>Walls after deductions</dt><dd>{format(room.netWallAreaSqFt)} <small>sq ft</small></dd></div><div><dt>Captured floor</dt><dd>{format(room.floorAreaSqFt)}{room.floorAreaSqFt != null && <small> sq ft</small>}</dd></div></dl>
        <RoomMeasurementReview room={room}/>
        <div className="estimate-scan-work">{result.items.filter(item => item.roomId === room.id).map(item => {
          const duplicate = existingKeys.includes(importedKey(item));
          const available = eligible(item);
          return <label key={item.key} className="estimate-scan-choice"><input type="checkbox" checked={available && selected.includes(item.key)} disabled={!available || busy} onChange={event => update({ selected: event.target.checked ? [...selected, item.key] : selected.filter(key => key !== item.key), reviewed: false })}/><span><strong>{kindLabels[item.kind]}</strong><small>{duplicate ? 'Already in this worksheet' : item.qty === '' ? 'Measure separately before estimating' : `${format(item.qty)} ${item.unit}`}</small></span></label>;
        })}</div>
      </article>)}
      {result.warnings.length > 0 && <details className="estimate-scan-warnings" open><summary>Measurement notes to review ({result.warnings.length})</summary><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      <label className="estimate-scan-choice estimate-scan-confirm"><input id="room-scan-reviewed" type="checkbox" checked={reviewed} disabled={busy} onChange={event => update({ reviewed: event.target.checked })}/><span>I reviewed the room measurements, openings, and notes for the selected work.</span></label>
      {chosen.length > remainingLines && <p role="alert">Select no more than {remainingLines} additional items for this worksheet.</p>}
      <button type="button" className="estimate-primary" disabled={busy || !reviewed || !chosen.length || chosen.length > remainingLines} onClick={addSelected}>Add {chosen.length || 'selected'} measured {chosen.length === 1 ? 'item' : 'items'}</button>
      <p className="estimate-help">Adds new lines with blank unit costs. Quantities can be adjusted in the worksheet. Check for overlapping work if you also added a trade checklist.</p>
    </div>}
  </section>;
}
