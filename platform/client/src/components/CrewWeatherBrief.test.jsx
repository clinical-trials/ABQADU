import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import CrewWeatherBrief from './CrewWeatherBrief';

const report = {
  generated_at: '2026-09-30T16:00:00Z', project: { id: 'one', name: 'West gate ADU' }, trade: 'concrete',
  weather: {
    status: 'partial', source_status: { source: 'National Weather Service', checked_at: '2026-09-30T15:55:00Z' },
    planning: [
      { date: '2026-10-01', level: 'hold', label: 'Hold', reasons: ['Rain can affect exposed concrete.'] },
      { date: '2026-10-02', level: 'review', label: 'Review', reasons: ['Check wind before work.'] },
      { date: '2026-10-03', level: 'unknown', label: 'Unknown', reasons: ['Wind coverage is missing.'] },
      { date: '2026-10-04', level: 'plan', label: 'Safe to work', reasons: [] },
    ],
  },
};
let host, root, props;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const render = async () => act(async () => root.render(<CrewWeatherBrief {...props} />));
const button = label => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === label);
const click = async label => act(async () => button(label).click());
const change = async value => act(async () => Simulate.change(host.querySelector('textarea'), { target: { value } }));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  props = { report, project: { id: 'one', name: 'West gate ADU' } };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockResolvedValue() } });
  global.fetch = jest.fn();
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else delete navigator.clipboard;
  jest.restoreAllMocks();
});

test('prepares an editable dated crew update with source and confirmation language only after a click', async () => {
  await render();
  expect(host.querySelector('textarea')).toBeNull();
  await click('Prepare crew update');
  const draft = host.querySelector('textarea').value;
  expect(draft).toContain('West gate ADU'); expect(draft).toContain('Concrete');
  for (const day of report.weather.planning) expect(draft).toContain(day.date);
  expect(draft).toContain('Weather hold candidate'); expect(draft).toContain('Weather review needed');
  expect(draft).toContain('Forecast details missing'); expect(draft).toContain('Rain can affect exposed concrete.');
  expect(draft).toContain('National Weather Service'); expect(draft).toMatch(/checked:.*Sep 30, 2026/i);
  expect(draft).toMatch(/confirm.*before changing work dates/i);
  expect(draft).not.toMatch(/safe to work|day off|pay|cancelled|canceled/i);
  expect(fetch).not.toHaveBeenCalled(); expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
});

test.each(['unavailable', 'stale'])('%s forecasts cannot reuse reassuring planning claims or reasons', async status => {
  props.report = { ...report, weather: { ...report.weather, status, planning: report.weather.planning.map(day => ({ ...day, level: 'plan', reasons: ['Safe to work; no weather concerns.'] })) } };
  await render(); await click('Prepare crew update');
  const draft = host.querySelector('textarea').value;
  expect(draft).toContain(status); expect(draft).toMatch(/current forecast/i);
  expect(draft).not.toContain('Safe to work'); expect(draft).not.toContain('no weather concerns');
  expect(draft).toContain('2026-10-01');
});

test('copies exactly the reviewed draft and reports success without claiming a message was sent', async () => {
  await render(); await click('Prepare crew update'); await change('Reviewed crew note.');
  await click('Copy update');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Reviewed crew note.');
  expect(host.textContent).toContain('Copied. Review it before sharing with the crew.');
  expect(host.textContent).not.toMatch(/update sent|message sent/i);
  expect(fetch).not.toHaveBeenCalled();
});

test.each(['denied', 'missing'])('clipboard %s selects the text for manual copying without claiming success', async failure => {
  if (failure === 'denied') navigator.clipboard.writeText.mockRejectedValue(new Error('Clipboard permission denied'));
  else delete navigator.clipboard;
  await render(); await click('Prepare crew update'); await change('Copy this manually.');
  await click('Copy update');
  const textarea = host.querySelector('textarea');
  expect(document.activeElement).toBe(textarea);
  expect(textarea.selectionStart).toBe(0); expect(textarea.selectionEnd).toBe(textarea.value.length);
  expect(host.textContent).toContain('Could not copy automatically. The draft is selected; use your device’s Copy command.');
  expect(host.textContent).not.toContain('Copied.');
});

test('closing and reopening the panel preserves edits', async () => {
  await render(); await click('Prepare crew update'); await change('Keep my crew instructions.');
  await click('Hide crew draft'); await click('Prepare crew update');
  expect(host.querySelector('textarea').value).toBe('Keep my crew instructions.');
});

test('forecast refresh preserves edits and replacement requires an explicit action', async () => {
  await render(); await click('Prepare crew update'); await change('Preserve my crew instructions.');
  props.report = { ...report, generated_at: '2026-09-30T17:00:00Z', trade: 'roofing' };
  await render();
  expect(host.querySelector('textarea').value).toBe('Preserve my crew instructions.');
  expect(host.textContent).toContain('A newer briefing is available.');
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  await click('Use updated forecast');
  expect(host.querySelector('textarea').value).toContain('Roofing');
  expect(host.querySelector('textarea').value).not.toContain('Preserve my crew instructions.');
  expect(host.textContent).not.toContain('A newer briefing is available.');
});

test('updating and expired forecasts preserve a draft for manual copying without generating a new one', async () => {
  await render(); await click('Prepare crew update'); await change('Keep this reviewable draft.');
  props.report = null; props.loading = true; await render();
  expect(host.querySelector('textarea').value).toBe('Keep this reviewable draft.');
  expect(host.textContent).toContain('Forecast is updating.');
  await click('Copy update');
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Keep this reviewable draft.');
  props.report = { ...report, generated_at: '2026-09-30T17:00:00Z' }; props.loading = false; props.expired = true; await render();
  expect(host.textContent).toContain('Forecast has expired.');
  expect(button('Use updated forecast').disabled).toBe(true);
  expect(host.querySelector('textarea').value).toBe('Keep this reviewable draft.');
});

test('a missing briefing cannot generate a draft and project changes never show the previous project text', async () => {
  props.report = null; props.loading = true; await render();
  expect(button('Prepare crew update').disabled).toBe(true);
  props.report = report; props.loading = false; await render(); await click('Prepare crew update'); await change('Private first project instruction.');
  props.project = { id: 'two', name: 'Second job' }; await render();
  expect(host.querySelector('textarea')).toBeNull(); expect(button('Prepare crew update').disabled).toBe(true);
  props.report = { ...report, project: { id: 'two', name: 'Second job' } }; await render(); await click('Prepare crew update');
  expect(host.querySelector('textarea').value).toContain('Second job');
  expect(host.querySelector('textarea').value).not.toContain('Private first project instruction.');
});

test('a late clipboard result cannot claim that the next project draft was copied', async () => {
  let finishCopy;
  navigator.clipboard.writeText.mockImplementation(() => new Promise(resolve => { finishCopy = resolve; }));
  await render(); await click('Prepare crew update'); await change('First project copy.'); await click('Copy update');
  props.project = { id: 'two', name: 'Second job' };
  props.report = { ...report, project: { id: 'two', name: 'Second job' } };
  await render(); await click('Prepare crew update'); await change('Second project draft.');
  await act(async () => finishCopy());
  expect(host.querySelector('textarea').value).toBe('Second project draft.');
  expect(host.textContent).not.toContain('Copied.');
  expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
});
