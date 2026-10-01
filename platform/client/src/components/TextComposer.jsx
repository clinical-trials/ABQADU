import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { getAuthSession, subscribeAuthSession } from '../utils/authFetch';
import { TEXT_TEMPLATES, makeJobText, normalizeTextPhone, smsDraftHref, hasTextPlaceholders } from '../utils/textDraft';
import './TextComposer.css';

function ProjectTextComposer({ project, builder, forecast, fresh, busy, onCheckWeather }) {
  const id = useId();
  const [recipient, setRecipient] = useState('homeowner');
  const [phone, setPhone] = useState(project.client_phone || '');
  const [template, setTemplate] = useState('');
  const [dayDate, setDayDate] = useState('');
  const [draft, setDraft] = useState({ text: '', weatherKey: null });
  const [notice, setNotice] = useState('');
  const [copying, setCopying] = useState(false);
  const [now, setNow] = useState(Date.now());
  const textarea = useRef(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const options = { project, forecast, fresh, dayDate, now };
  const currentWeather = makeJobText('weather_hold', options);
  const weatherChanged = template === 'weather_hold' && (currentWeather.needsWeatherRefresh || currentWeather.weatherKey !== draft.weatherKey);
  const incomplete = hasTextPlaceholders(draft.text);
  const shareable = Boolean(draft.text.trim() && !incomplete && !weatherChanged && draft.text.length <= 1600);
  const normalizedPhone = normalizeTextPhone(phone);
  const appleDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const href = shareable ? smsDraftHref(phone, draft.text, appleDevice) : null;
  const recipientLabel = recipient === 'homeowner' ? project.client || 'Homeowner' : recipient === 'office' ? 'Office' : 'Crew / another number';

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => { mounted.current = false; generation.current += 1; clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!draft.text.trim()) return undefined;
    const preventLoss = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [draft.text]);

  function clearNotice() { generation.current += 1; setCopying(false); setNotice(''); }
  function chooseRecipient(value) {
    clearNotice(); setRecipient(value);
    setPhone(value === 'homeowner' ? project.client_phone || '' : value === 'office' ? builder?.phone || '' : '');
  }
  function useTemplate(value) {
    clearNotice(); setTemplate(value);
    const next = makeJobText(value, { ...options, now: Date.now() });
    setDraft({ text: next.text, weatherKey: next.weatherKey });
    textarea.current?.focus();
  }
  function canShareNow() {
    if (!shareable) return false;
    if (template !== 'weather_hold') return true;
    const current = makeJobText('weather_hold', { ...options, now: Date.now() });
    if (current.needsWeatherRefresh || current.weatherKey !== draft.weatherKey) {
      setNow(Date.now()); setNotice('Refresh and review the weather draft before sharing.'); return false;
    }
    return true;
  }
  async function copyDraft() {
    if (copying || !canShareNow()) return;
    const owner = ++generation.current;
    const current = () => mounted.current && generation.current === owner;
    setCopying(true); setNotice('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(draft.text);
      if (current()) setNotice('Copied. Review the recipient and message before sending from your phone.');
    } catch {
      if (current()) {
        textarea.current?.focus(); textarea.current?.select();
        setNotice('Select and copy the draft with your device’s Copy command. Automatic copying was unavailable.');
      }
    } finally { if (current()) setCopying(false); }
  }

  return <div className="text-composer" aria-label="Job text composer">
    <p>Draft a message, then review and send it in your phone’s texting app. No texting service setup is needed.</p>
    <div className="text-composer__recipients">
      <label htmlFor={`${id}-recipient`}>To<select id={`${id}-recipient`} aria-label="Text recipient" value={recipient} onChange={event => chooseRecipient(event.target.value)}>
        <option value="homeowner">Homeowner</option><option value="office">Office</option><option value="other">Crew / another number</option>
      </select></label>
      <label htmlFor={`${id}-phone`}>Mobile number<input id={`${id}-phone`} aria-label="Recipient mobile number" type="tel" inputMode="tel" autoComplete="off" value={phone} maxLength={40}
        placeholder="505 555 0123" onChange={event => { clearNotice(); setPhone(event.target.value); }} /></label>
    </div>
    <p className="text-composer__recipient"><strong>Recipient: {recipientLabel}</strong><span>{normalizedPhone || 'Enter a complete mobile number. Use +country code outside the U.S.'}</span><small>Editing this number changes only this draft.</small></p>
    <div className="text-composer__templates" role="group" aria-label="Message templates">{TEXT_TEMPLATES.map(item => <button type="button" key={item.id} aria-pressed={template === item.id} onClick={() => useTemplate(item.id)}>{item.label}</button>)}</div>
    <small>Choosing a template replaces the current message. Edit the draft below before sharing.</small>
    {template === 'weather_hold' && <div className="text-composer__weather">
      <label htmlFor={`${id}-weather`}>Forecast day<select id={`${id}-weather`} aria-label="Message forecast day" value={dayDate || forecast?.days?.[0]?.date || ''}
        onChange={event => { clearNotice(); setDayDate(event.target.value); }}>
        {!forecast?.days?.length && <option value="">Refresh needed</option>}
        {forecast?.days?.map(day => <option key={day.date} value={day.date}>{day.date}</option>)}
      </select></label>
      {currentWeather.needsWeatherRefresh ? <p role="status">{currentWeather.warning}</p> : weatherChanged && <p role="status">The forecast or selected date changed. Use the current forecast to replace this draft before sharing.</p>}
      <div className="text-composer__actions"><button type="button" onClick={onCheckWeather} disabled={busy}>Refresh weather</button>
        {weatherChanged && !currentWeather.needsWeatherRefresh && <button type="button" onClick={() => useTemplate('weather_hold')}>Use current forecast</button>}</div>
    </div>}
    <label htmlFor={`${id}-message`}>Message preview · editable<textarea id={`${id}-message`} aria-label="Message draft" ref={textarea} rows={8} maxLength={1600} value={draft.text}
      placeholder="Choose a template or write your message here." onChange={event => { clearNotice(); setDraft(current => ({ ...current, text: event.target.value })); }} /></label>
    <div className="text-composer__count"><span>{Array.from(draft.text).length} characters</span><span>Draft only · nothing sent</span></div>
    {incomplete && <p className="text-composer__warning">Replace the bracketed prompt with your job details before sharing.</p>}
    <div className="text-composer__actions">
      {href ? <a className="field-button" href={href} onClick={event => {
        if (!canShareNow()) { event.preventDefault(); return; }
        setNotice('Your device was asked to open its texting app. Review the recipient and tap Send there. If it does not open or fill the message, use Copy draft.');
      }}>Open phone text app</a> : <button type="button" className="field-button" disabled>Open phone text app</button>}
      <button type="button" className="field-button field-button-outline" disabled={!shareable || copying} onClick={copyDraft}>{copying ? 'Copying…' : 'Copy draft'}</button>
    </div>
    {notice && <p className="text-composer__notice" role="status">{notice}</p>}
    <p className="text-composer__footnote">Replies stay in your phone when you send from your phone. Copy any draft you want to keep before switching jobs or signing out. This draft is not saved to the job.</p>
  </div>;
}

export default function TextComposer(props) {
  const session = useSyncExternalStore(subscribeAuthSession, getAuthSession, getAuthSession);
  if (props.project?.id == null || props.project.id === '') return <p className="field-empty-note">Choose a job to prepare a text message.</p>;
  return <ProjectTextComposer key={`${session.epoch}:${props.project.id}`} {...props} />;
}
