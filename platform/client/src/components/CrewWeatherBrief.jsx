import React, { useEffect, useId, useRef, useState } from 'react';
import './CrewWeatherBrief.css';

const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const tradeNames = { concrete: 'Concrete', roofing: 'Roofing', excavation: 'Excavation', general: 'General work' };

function checkedTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver', timeZoneName: 'short' })
    : 'Not recorded';
}

function makeDraft(report, project) {
  const weather = report.weather || {};
  const current = ['current', 'partial'].includes(weather.status);
  const name = clean(project.name) || clean(project.client) || clean(report.project?.name) || 'Selected project';
  const trade = tradeNames[report.trade] || 'Selected trade';
  const lines = [`Crew update draft — ${name}`, `${trade} · next four forecast dates`];
  if (weather.status === 'partial') lines.push('Forecast coverage is incomplete; review missing data with the crew.');
  else if (!current) lines.push(`Forecast is ${weather.status === 'stale' ? 'stale' : 'unavailable'}; obtain a current forecast before confirming work.`);
  const days = Array.isArray(weather.planning) ? weather.planning.slice(0, 4) : [];
  const labels = {
    hold: 'Weather hold candidate', review: 'Weather review needed', unknown: 'Forecast details missing',
    plan: 'Review site conditions before confirming work',
  };
  for (const day of days) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day?.date || '') ? day.date : 'Forecast date unavailable';
    const summary = current ? labels[day?.level] || labels.unknown : 'Current forecast needed before scheduling work';
    const reasons = current && Array.isArray(day?.reasons) ? day.reasons.map(clean).filter(Boolean).slice(0, 2).join(' ') : '';
    lines.push(`${date}: ${summary}${reasons ? ` — ${reasons}` : '.'}`);
  }
  if (days.length < 4) lines.push('The four-day forecast is incomplete. Check the missing dates with the contractor.');
  const source = clean(weather.source_status?.source) || clean(weather.forecast?.source) || 'Not available';
  lines.push(`Source: ${source}.`, `Forecast checked: ${checkedTime(weather.source_status?.checked_at || weather.forecast?.checked_at)}.`);
  lines.push('Please confirm site conditions and the work plan with the contractor before changing work dates. This is a draft; no schedule changes are confirmed.');
  return lines.join('\n');
}

function CrewDraftForProject({ report, project, loading, expired }) {
  const fieldId = useId();
  const textarea = useRef(null);
  const mounted = useRef(false);
  const copyGeneration = useRef(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState('');
  const matchingReport = report?.project?.id != null && String(report.project.id) === String(project.id) ? report : null;
  const generatedText = matchingReport ? makeDraft(matchingReport, project) : null;
  const sourceKey = matchingReport ? JSON.stringify([matchingReport.generated_at, generatedText]) : null;
  const changed = Boolean(draft && sourceKey && draft.sourceKey !== sourceKey);
  const canGenerate = Boolean(matchingReport && !loading && !expired);
  let warning = '';
  if (loading) warning = 'Forecast is updating. Any existing draft is unchanged; review current conditions before sharing.';
  else if (expired) warning = 'Forecast has expired. Any existing draft needs a current weather review before sharing.';
  else if (!matchingReport) warning = 'A briefing for this project is needed. Any existing draft is unchanged; review it before sharing.';
  else if (changed) warning = 'A newer briefing is available. Your edits are unchanged; review them or use the updated forecast before sharing.';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; copyGeneration.current += 1; };
  }, []);
  useEffect(() => { if (open) textarea.current?.focus(); }, [open]);

  function clearCopyNotice() {
    copyGeneration.current += 1;
    setCopying(false); setNotice('');
  }
  function toggleDraft() {
    if (!open && !draft) {
      if (!canGenerate) return;
      setDraft({ text: generatedText, sourceKey });
    }
    clearCopyNotice(); setOpen(value => !value);
  }
  function useUpdatedForecast() {
    if (!canGenerate) return;
    clearCopyNotice(); setDraft({ text: generatedText, sourceKey });
    textarea.current?.focus();
  }
  async function copyUpdate() {
    if (!draft?.text.trim() || copying) return;
    const generation = ++copyGeneration.current;
    const current = () => mounted.current && copyGeneration.current === generation;
    setCopying(true); setNotice('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(draft.text);
      if (current()) setNotice('Copied. Review it before sharing with the crew.');
    } catch {
      if (current()) {
        textarea.current?.focus(); textarea.current?.select();
        setNotice('Could not copy automatically. The draft is selected; use your device’s Copy command.');
      }
    } finally {
      if (current()) setCopying(false);
    }
  }

  return <div className="crew-weather-brief">
    <button type="button" className="crew-weather-brief__prepare" aria-expanded={open} aria-controls={`${fieldId}-panel`}
      disabled={!draft && !canGenerate} onClick={toggleDraft}>{open ? 'Hide crew draft' : 'Prepare crew update'}</button>
    {warning && <p className="crew-weather-brief__warning" role="status">{warning}</p>}
    {open && draft && <div id={`${fieldId}-panel`} className="crew-weather-brief__panel">
      <label htmlFor={fieldId}>Crew update draft</label>
      <p id={`${fieldId}-help`}>Edit and copy this draft to share it with your crew. Work dates still need contractor confirmation. Copy any draft you want to keep before switching projects.</p>
      <textarea id={fieldId} ref={textarea} rows={10} value={draft.text} aria-describedby={`${fieldId}-help`}
        onChange={event => { clearCopyNotice(); setDraft({ ...draft, text: event.target.value }); }} />
      <div className="crew-weather-brief__actions">
        <button type="button" disabled={copying || !draft.text.trim()} onClick={copyUpdate}>{copying ? 'Copying…' : 'Copy update'}</button>
        {changed && <button type="button" disabled={!canGenerate} onClick={useUpdatedForecast}>Use updated forecast</button>}
      </div>
      {changed && <p>Using the updated forecast replaces this draft, including your edits. Copy any text you want to keep first.</p>}
      {notice && <p role="status">{notice}</p>}
    </div>}
  </div>;
}

export default function CrewWeatherBrief({ report, project, loading = false, expired = false }) {
  if (project?.id == null || project.id === '') return null;
  return <CrewDraftForProject key={String(project.id)} report={report} project={project} loading={loading} expired={expired} />;
}
