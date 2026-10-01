import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { getAuthSession, subscribeAuthSession } from '../utils/authFetch';
import { scanReceiptPhoto } from '../utils/receiptScan';
import { parseReceiptDraft, validateReceiptReview } from '../utils/parseReceiptDraft';
import './ReceiptCapture.css';

let receiptSequence = 0;
function newReceiptId() {
  return `receipt-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${++receiptSequence}-${Math.random().toString(36).slice(2, 10)}`}`;
}

function CaptureForProject({ project, busy = false, onSave }) {
  const fieldId = useId();
  const [draftId, setDraftId] = useState(newReceiptId);
  const [rawText, setRawText] = useState('');
  const [source, setSource] = useState('manual');
  const [review, setReview] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [approved, setApproved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ status: 'Starting scan', progress: 0 });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const mounted = useRef(false);
  const operation = useRef(0);
  const controller = useRef(null);
  const savePending = useRef(false);
  const locked = busy || scanning || saving;
  const errors = review ? validateReceiptReview(review) : [];

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current += 1; controller.current?.abort(); };
  }, []);

  function clearReview() { setReview(null); setWarnings([]); setApproved(false); }
  function reviewText(manual = false) {
    if (locked) return;
    const parsed = manual ? { vendor: '', date: '', amount: '', warnings: [] } : parseReceiptDraft(rawText);
    setReview({ vendor: parsed.vendor, date: parsed.date, amount: parsed.amount });
    setWarnings(parsed.warnings); setApproved(false); setNotice('');
  }
  function changeReview(key, value) {
    setReview(current => ({ ...current, [key]: value })); setApproved(false); setNotice('');
  }
  function cancelScan() {
    operation.current += 1; controller.current?.abort(); controller.current = null;
    setScanning(false); setNotice('Scan cancelled. Your existing receipt text is unchanged.');
  }
  async function choosePhoto(event) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file || locked) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setNotice('Choose a JPG, PNG, or WebP receipt photo.'); return;
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 12 * 1024 * 1024) {
      setNotice('Choose a receipt photo larger than 0 bytes and no more than 12 MB.'); return;
    }
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const owner = ++operation.current;
    const current = () => mounted.current && operation.current === owner && !abort.signal.aborted;
    clearReview(); setScanning(true); setProgress({ status: 'Starting scan', progress: 0 }); setNotice('');
    try {
      const text = await scanReceiptPhoto(file, { signal: abort.signal, onProgress: value => {
        if (!current()) return;
        const amount = typeof value === 'number' ? value : value?.progress;
        setProgress({ status: typeof value?.status === 'string' ? value.status.slice(0, 100) : 'Reading receipt text',
          progress: Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0 });
      } });
      if (!current()) return;
      if (typeof text !== 'string' || !text.trim()) throw new Error('No readable receipt text was found. Try a clearer photo or enter the details manually.');
      if (text.length > 20000) throw new Error('The extracted text is too long. Use a photo of one receipt or paste the relevant receipt text.');
      setRawText(text); setSource('photo-ocr'); setNotice('Text is ready. Choose Review receipt text and check the suggested details.');
    } catch (error) {
      if (current()) setNotice(error?.message || 'The photo could not be read. Paste receipt text or enter the details manually.');
    } finally {
      if (current()) { setScanning(false); controller.current = null; }
    }
  }
  async function saveReviewed() {
    if (locked || savePending.current || !approved || !review || errors.length || typeof onSave !== 'function') return;
    savePending.current = true; setSaving(true); setNotice('');
    const owner = operation.current;
    const current = () => mounted.current && operation.current === owner;
    try {
      const saved = await onSave({ id: draftId, vendor: review.vendor.trim(), date: review.date,
        amount: Number(review.amount), raw_text: rawText, source });
      if (!current()) return;
      if (saved) {
        setDraftId(newReceiptId()); setRawText(''); setSource('manual'); clearReview();
        setNotice('Receipt saved to this job.');
      } else setNotice('The receipt was not saved. Your reviewed details are still here to retry.');
    } catch (error) {
      if (current()) setNotice(error?.message || 'The receipt could not be saved. Your reviewed details are still here.');
    } finally {
      savePending.current = false;
      if (current()) setSaving(false);
    }
  }

  return <div className="receipt-capture" aria-label="Receipt capture">
    <div><h3>Capture a receipt</h3><p>For {project.client || project.name || 'this job'}. Read a photo on this device, paste receipt text, or enter the details manually.</p></div>
    <div className="receipt-capture__photo-actions">
      <label className="receipt-capture__upload">Choose receipt photo<input aria-label="Receipt photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={choosePhoto}/></label>
      <label className="receipt-capture__upload">Take receipt photo<input aria-label="Receipt camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={locked} onChange={choosePhoto}/></label>
    </div>
    <small>JPG, PNG, or WebP · up to 12 MB. The photo is not attached to the saved receipt.</small>
    {scanning && <div className="receipt-capture__progress" role="status"><p>{progress.status} · {Math.round(progress.progress * 100)}%</p><progress max="1" value={progress.progress} aria-label="Receipt scan progress"/><button type="button" onClick={cancelScan}>Cancel scan</button></div>}
    <label htmlFor={`${fieldId}-text`}>Receipt text<textarea id={`${fieldId}-text`} aria-label="Receipt text" rows={5} value={rawText} disabled={locked} maxLength={20000}
      placeholder="Paste the text from your receipt here." onChange={event => { setRawText(event.target.value); setSource(event.target.value.trim() ? (source === 'photo-ocr' ? 'photo-ocr' : 'pasted-text') : 'manual'); clearReview(); setNotice(''); }}/></label>
    <div className="receipt-capture__actions"><button type="button" disabled={locked || !rawText.trim()} onClick={() => reviewText(false)}>Review receipt text</button><button type="button" disabled={locked} onClick={() => reviewText(true)}>Enter manually</button></div>
    {review && <div className="receipt-capture__review">
      <h4>Check before saving</h4><p>These are suggestions. Compare the vendor, date, and final total with the original receipt.</p>
      {!!warnings.length && <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      <label htmlFor={`${fieldId}-vendor`}>Vendor<input id={`${fieldId}-vendor`} aria-label="Receipt vendor" value={review.vendor} maxLength={120} disabled={locked} onChange={event => changeReview('vendor', event.target.value)}/></label>
      <div className="receipt-capture__fields"><label htmlFor={`${fieldId}-date`}>Receipt date<input id={`${fieldId}-date`} aria-label="Receipt date" type="date" value={review.date} disabled={locked} onChange={event => changeReview('date', event.target.value)}/></label>
        <label htmlFor={`${fieldId}-total`}>Final total ($)<input id={`${fieldId}-total`} aria-label="Receipt total" inputMode="decimal" value={review.amount} maxLength={16} placeholder="284.76" disabled={locked} onChange={event => changeReview('amount', event.target.value)}/></label></div>
      {!!errors.length && <ul className="receipt-capture__errors">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
      <label className="receipt-capture__approve"><input type="checkbox" aria-label="Confirm receipt details" checked={approved} disabled={locked} onChange={event => setApproved(event.target.checked)}/><span>I checked the vendor, date, and total against the receipt.</span></label>
      <button type="button" className="receipt-capture__save" disabled={locked || !approved || errors.length > 0 || typeof onSave !== 'function'} onClick={saveReviewed}>{saving ? 'Saving receipt…' : 'Save reviewed receipt'}</button>
    </div>}
    {notice && <p className="receipt-capture__notice" role="status">{notice}</p>}
    <small>Nothing is saved until you choose Save reviewed receipt. Save or copy anything you need before switching jobs or signing out.</small>
  </div>;
}

export default function ReceiptCapture(props) {
  const session = useSyncExternalStore(subscribeAuthSession, getAuthSession, getAuthSession);
  if (props.project?.id == null || props.project.id === '') return <p>Choose a job to capture a receipt.</p>;
  return <CaptureForProject key={`${session.epoch}:${props.project.id}`} {...props}/>;
}
