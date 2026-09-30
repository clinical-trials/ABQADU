import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { requestJson } from '../utils/api';
import { getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';
import './CfoCashScenario.css';

const MAX_CENTS = 10000000000;
const DAY = 86400000;
const money = cents => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyFields = [
  { name: 'opening_cash', label: 'Starting available cash', help: 'The cash you can use at the start of this scenario.' },
  { name: 'weekly_inflow', label: 'Expected weekly money in', help: 'Receipts expected each week before the delay below.' },
  { name: 'weekly_outflow', label: 'Total weekly cash out', help: 'Include wages, materials, tax, debt payments and overhead.' },
];

function parseMoney(raw) {
  const text = raw.trim().replace(/^\$\s*/, '');
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) return null;
  const [whole = '0', fraction = ''] = text.replace(/,/g, '').split('.');
  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) return null;
  return { cents, dollars: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}` };
}

function denverDate(instant) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
const dateLabel = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Denver' });

function checkedProjection(payload, expected) {
  const invalid = () => { throw new Error('This cash scenario could not be verified against your inputs. Your amounts are still here; calculate again.'); };
  if (!payload || payload.currency !== 'USD' || typeof payload.generated_at !== 'string'
    || !payload.generated_at.endsWith('Z') || !Number.isFinite(Date.parse(payload.generated_at))
    || payload.as_of !== denverDate(payload.generated_at)
    || typeof payload.basis !== 'string' || !payload.basis.trim()
    || !Array.isArray(payload.weeks) || payload.weeks.length !== 13) invalid();
  if (Object.entries(expected).some(([key, value]) => payload.assumptions?.[key] !== value)) invalid();
  const start = Date.parse(`${payload.as_of}T00:00:00Z`);
  const date = days => new Date(start + days * DAY).toISOString().slice(0, 10);
  let balance = expected.opening_cash_cents;
  const balances = [];
  for (let index = 0; index < 13; index += 1) {
    const week = payload.weeks[index];
    const inflow = index >= expected.collection_delay_weeks ? expected.weekly_inflow_cents : 0;
    balance += inflow - expected.weekly_outflow_cents;
    if (!week || week.week !== index + 1 || week.start_date !== date(index * 7) || week.end_date !== date(index * 7 + 6)
      || week.inflow_cents !== inflow || week.outflow_cents !== expected.weekly_outflow_cents
      || !Number.isSafeInteger(week.closing_cash_cents) || week.closing_cash_cents !== balance) invalid();
    balances.push(balance);
  }
  const negativeIndex = balances.findIndex(value => value < 0);
  if (payload.lowest_cash_cents !== Math.min(...balances) || payload.ending_cash_cents !== balance
    || payload.first_negative_week !== (negativeIndex < 0 ? null : negativeIndex + 1)
    || payload.receipts_after_horizon_cents !== expected.weekly_inflow_cents * expected.collection_delay_weeks) invalid();
  return payload;
}

function CashChart({ report, summaryId }) {
  const titleId = useId();
  const values = [report.assumptions.opening_cash_cents, ...report.weeks.map(week => week.closing_cash_cents)];
  const bottom = Math.min(0, ...values), top = Math.max(0, ...values);
  const margin = Math.max((top - bottom) * .12, 100);
  const low = bottom - margin, high = top + margin;
  const x = index => 20 + index * (660 / 13);
  const y = value => 16 + (high - value) / (high - low) * 200;
  const zero = y(0);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  return <figure className="cfo-cash__chart">
    <figcaption>Cash at the end of each week</figcaption>
    <svg viewBox="0 0 700 236" role="img" aria-labelledby={titleId} aria-describedby={summaryId}>
      <title id={titleId}>13-week cash scenario, from starting cash to week 13</title>
      <rect x="20" y={zero} width="660" height={220 - zero} className="cfo-cash__negative-area" />
      <line x1="20" x2="680" y1={zero} y2={zero} className="cfo-cash__zero" />
      <polyline points={points} className="cfo-cash__line" />
      {values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r={index === 0 || index === 13 ? 5 : 3.5}
        className={value < 0 ? 'cfo-cash__point cfo-cash__point--negative' : 'cfo-cash__point'} />)}
    </svg>
    <div className="cfo-cash__chart-labels"><span>Start · {money(values[0])}</span><span>Week 13</span></div>
    <p className="cfo-cash__muted">The dashed line marks $0. Shaded space is below zero. Weekly detail is available below.</p>
  </figure>;
}

function ScenarioForSession({ owner }) {
  const id = useId();
  const [inputs, setInputs] = useState({ opening_cash: '', weekly_inflow: '', weekly_outflow: '', collection_delay_weeks: '0' });
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [needsCalculation, setNeedsCalculation] = useState(false);
  const fields = useRef({});
  const pending = useRef(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; pending.current?.abort(); };
  }, []);

  function edit(name, value) {
    const previousCalculation = Boolean(report || pending.current);
    generation.current += 1; pending.current?.abort(); pending.current = null;
    setInputs(current => ({ ...current, [name]: value })); setReport(null); setError(null); setBusy(false);
    setNeedsCalculation(current => current || previousCalculation);
  }

  async function calculate(event) {
    event.preventDefault();
    if (pending.current || !isAuthSessionCurrent(owner)) return;
    const submitted = {}, expected = {};
    for (const field of moneyFields) {
      const amount = parseMoney(inputs[field.name]);
      if (!amount) {
        setError({ field: field.name, message: `Enter ${field.label.toLowerCase()} from $0 to $100,000,000, with no more than two decimal places. Enter 0 if none.` });
        fields.current[field.name]?.focus(); return;
      }
      submitted[field.name] = amount.dollars; expected[`${field.name}_cents`] = amount.cents;
    }
    const delay = Number(inputs.collection_delay_weeks);
    if (!/^[0-4]$/.test(inputs.collection_delay_weeks) || !Number.isInteger(delay)) {
      setError({ field: 'collection_delay_weeks', message: 'Choose a receipt delay from 0 to 4 weeks.' });
      fields.current.collection_delay_weeks?.focus(); return;
    }
    submitted.collection_delay_weeks = delay; expected.collection_delay_weeks = delay;
    const controller = new AbortController(), requestGeneration = ++generation.current;
    pending.current = controller; setBusy(true); setError(null); setReport(null);
    const current = () => mounted.current && !controller.signal.aborted && generation.current === requestGeneration && isAuthSessionCurrent(owner);
    try {
      const payload = await requestJson('/api/executive/cfo/cash-scenario', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted), signal: controller.signal, authSession: owner,
      });
      if (!current()) return;
      const verified = checkedProjection(payload, expected);
      setReport(verified); setNeedsCalculation(false);
    } catch (failure) {
      if (current()) setError({ message: failure.message || 'The cash scenario is unavailable. Your inputs are still here; try again.' });
    } finally {
      if (pending.current === controller) pending.current = null;
      if (current()) setBusy(false);
    }
  }

  return <section className="cfo-cash" id="cash-scenario" aria-labelledby={`${id}-heading`}>
    <header className="cfo-cash__heading">
      <div><p className="cfo-cash__eyebrow">CFO · Cash planning</p><h2 id={`${id}-heading`}>See the next 13 weeks.</h2></div>
      <span className="cfo-cash__badge">Temporary scenario</span>
    </header>
    <p className="cfo-cash__intro">Try your own cash assumptions. This scenario is not saved and is not connected to a bank.</p>
    <form onSubmit={calculate} noValidate className="cfo-cash__form" aria-label="Cash scenario assumptions">
      <div className="cfo-cash__fields">
        {moneyFields.map(field => <div className="cfo-cash__field" key={field.name}>
          <label htmlFor={`${id}-${field.name}`}>{field.label} <span>(USD)</span></label>
          <input id={`${id}-${field.name}`} name={field.name} ref={node => { fields.current[field.name] = node; }} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
            value={inputs[field.name]} placeholder="Enter amount" required aria-invalid={error?.field === field.name}
            aria-describedby={`${id}-${field.name}-help${error?.field === field.name ? ` ${id}-error` : ''}`} onChange={event => edit(field.name, event.target.value)} />
          <p id={`${id}-${field.name}-help`}>{field.help}</p>
        </div>)}
        <div className="cfo-cash__field">
          <label htmlFor={`${id}-delay`}>Receipt delay</label>
          <select id={`${id}-delay`} name="collection_delay_weeks" ref={node => { fields.current.collection_delay_weeks = node; }} value={inputs.collection_delay_weeks}
            aria-describedby={`${id}-delay-help`} onChange={event => edit('collection_delay_weeks', event.target.value)}>
            {[0, 1, 2, 3, 4].map(weeks => <option key={weeks} value={weeks}>{weeks === 0 ? 'On time · no delay' : `${weeks} ${weeks === 1 ? 'week' : 'weeks'} later`}</option>)}
          </select>
          <p id={`${id}-delay-help`}>Shift money in to later weeks. Weekly cash out keeps its timing.</p>
        </div>
      </div>
      <div className="cfo-cash__calculate"><button type="submit" disabled={busy}>{busy ? 'Calculating…' : 'Calculate 13 weeks'}</button><p>Use 0 when an amount is zero. Blank amounts stay unknown.</p></div>
      {error && <p role="alert" id={`${id}-error`} className="cfo-cash__error">{error.message}</p>}
      {busy && <p role="status">Calculating this scenario from your four assumptions…</p>}
      {needsCalculation && !busy && <p role="status">Inputs changed. Calculate again to see the updated scenario.</p>}
    </form>
    {report && <div className="cfo-cash__results">
      <div className={`cfo-cash__risk${report.first_negative_week === null ? '' : ' cfo-cash__risk--negative'}`} role="status" id={`${id}-summary`}>
        <strong>{report.first_negative_week === null ? 'No negative week in this scenario.' : `Cash turns negative in week ${report.first_negative_week}.`}</strong>
        <p>Lowest end-of-week cash: {money(report.lowest_cash_cents)}. {report.first_negative_week !== null && `The first negative week runs ${dateLabel(report.weeks[report.first_negative_week - 1].start_date)}–${dateLabel(report.weeks[report.first_negative_week - 1].end_date)}.`}</p>
      </div>
      <dl className="cfo-cash__totals">
        <div><dt>Lowest weekly cash</dt><dd>{money(report.lowest_cash_cents)}</dd></div>
        <div><dt>Cash at week 13</dt><dd>{money(report.ending_cash_cents)}</dd></div>
        <div><dt>Receipts after week 13</dt><dd>{money(report.receipts_after_horizon_cents)}</dd></div>
      </dl>
      <CashChart report={report} summaryId={`${id}-summary`} />
      <details className="cfo-cash__weekly"><summary>Review all 13 weeks</summary>
        <div className="cfo-cash__table-scroll" role="region" aria-label="Weekly cash movement" tabIndex={0}>
          <table><caption>Weekly cash movement · USD</caption><thead><tr><th scope="col">Week</th><th scope="col">Dates</th><th scope="col">Money in</th><th scope="col">Cash out</th><th scope="col">Closing cash</th></tr></thead>
            <tbody>{report.weeks.map(week => <tr key={week.week} className={week.closing_cash_cents < 0 ? 'cfo-cash__negative-row' : ''}>
              <th scope="row">{week.week}</th><td><time dateTime={week.start_date}>{dateLabel(week.start_date)}</time>–<time dateTime={week.end_date}>{dateLabel(week.end_date)}</time></td>
              <td>{money(week.inflow_cents)}</td><td>{money(week.outflow_cents)}</td><td>{money(week.closing_cash_cents)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
      <p className="cfo-cash__basis">Starting {dateLabel(report.as_of)}, {report.as_of.slice(0, 4)} · Albuquerque time. {report.basis}</p>
    </div>}
  </section>;
}

export default function CfoCashScenario() {
  const owner = useSyncExternalStore(subscribeAuthSession, getAuthSession);
  if (!owner.userId) return <section className="cfo-cash" id="cash-scenario"><p>Sign in to use a temporary cash scenario.</p></section>;
  return <ScenarioForSession key={owner.epoch} owner={owner} />;
}
