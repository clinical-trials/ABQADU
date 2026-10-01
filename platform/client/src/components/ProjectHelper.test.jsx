import React, { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import ProjectHelper from './ProjectHelper';
import { requestJson } from '../utils/api';

jest.mock('../utils/api', () => ({ requestJson: jest.fn() }));
jest.mock('./ScheduleConnection',()=>({onSaved,onReload,refreshKey})=><div data-schedule-refresh={refreshKey}><button onClick={()=>onSaved()}>Mock save schedule connection</button><button onClick={onReload}>Mock reload connection</button></div>);
jest.mock('./CrewWeatherBrief',()=>()=>null);
let host, root;
const report = {
  generated_at:'2026-09-30T16:00:00Z', project:{id:'one',name:'First job'},
  headline:'Review Thursday before the pour.', narration:'First job. Rain may delay concrete. Confirm with the crew.',
  next_actions:[{id:'rain',priority:'high',title:'Check the pour',detail:'Confirm a dry window with the concrete crew.'}],
  weather:{status:'partial',message:'Wind observations are incomplete.',forecast:{provider:'nws',source:'National Weather Service',days:[{date:'2026-10-01',high_f:73,low_f:49,rain_chance:80,wind_mph:null}]},planning:[{date:'2026-10-01',level:'hold',label:'Weather hold candidate',reasons:['Rain can affect exposed work.']}]},
  schedule:{status:'unlinked',critical:[],late:[],upcoming:[],recommendations:[]},risks:{status:'unlinked',open_count:null,items:[]},
  controls:{readiness:[],invoices:{draft_count:2,payment_status:'unknown'}}
};
beforeEach(()=>{
  jest.useFakeTimers('modern');jest.setSystemTime(new Date('2026-09-30T16:00:00Z'));
  global.IS_REACT_ACT_ENVIRONMENT=true;
  requestJson.mockReset().mockResolvedValue(report);
  window.speechSynthesis={speak:jest.fn(),cancel:jest.fn(),pause:jest.fn(),resume:jest.fn()};
  window.SpeechSynthesisUtterance=function(text){this.text=text;};
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();jest.useRealTimers();});
const render=async(props={})=>act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><ProjectHelper project={{id:'one',client:'First job'}} {...props}/></MemoryRouter>));
const button=name=>[...host.querySelectorAll('button')].find(el=>el.textContent===name);

test('shows weather warnings and unknown numbers without declaring payments or safe work',async()=>{
  await render();expect(host.textContent).toContain('Review Thursday before the pour.');
  expect(host.textContent).toContain('Wind unknown');expect(host.textContent).toContain('Weather hold candidate');
  expect(host.textContent).toContain('Connect this job');expect(host.textContent).toContain('Payment status is not included');
  expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  expect(host.querySelector('a[href="https://www.weather.gov/abq/"]')).not.toBeNull();
});
test('plays only on request, supports pause/resume and cancels on project change',async()=>{
  await render();await act(async()=>button('Listen to briefing').click());
  expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);expect(window.speechSynthesis.speak.mock.calls[0][0].text).toContain('First job.');
  await act(async()=>button('Pause').click());expect(window.speechSynthesis.pause).toHaveBeenCalled();
  await act(async()=>button('Resume').click());expect(window.speechSynthesis.resume).toHaveBeenCalled();
  const before=window.speechSynthesis.cancel.mock.calls.length;
  requestJson.mockResolvedValue({...report,project:{id:'two',name:'Second job'},narration:'Second job only.'});
  await render({project:{id:'two',client:'Second job'}});expect(window.speechSynthesis.cancel.mock.calls.length).toBeGreaterThan(before);
});
test('uses the saved schedule and selected trade, refreshing only after a confirmed link save',async()=>{
  const onScheduleSaved=jest.fn();await render({onScheduleSaved});
  expect(requestJson.mock.calls.at(-1)[0]).toBe('/api/project-helper/projects/one/briefing?trade=concrete');
  await act(async()=>button('Mock save schedule connection').click());expect(onScheduleSaved).toHaveBeenCalledTimes(1);
  expect(requestJson).toHaveBeenCalledTimes(2);
  await act(async()=>Simulate.change(host.querySelector('[aria-label="Trade for briefing"]'),{target:{value:'roofing'}}));expect(requestJson.mock.calls.at(-1)[0]).toContain('trade=roofing');
});
test('refreshing either the briefing or its saved connection refreshes both views',async()=>{
 await render();expect(host.querySelector('[data-schedule-refresh]').dataset.scheduleRefresh).toBe('0');
 await act(async()=>button('Refresh briefing').click());
 expect(host.querySelector('[data-schedule-refresh]').dataset.scheduleRefresh).toBe('1');expect(requestJson).toHaveBeenCalledTimes(2);
 await act(async()=>button('Mock reload connection').click());
 expect(host.querySelector('[data-schedule-refresh]').dataset.scheduleRefresh).toBe('2');expect(requestJson).toHaveBeenCalledTimes(3);
});
test('late response from an old project cannot replace or share the new forecast',async()=>{
  const onForecast=jest.fn();let finish;requestJson.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  await render({onForecast});
  requestJson.mockResolvedValue({...report,project:{id:'two',name:'Second job'},headline:'Second job forecast',weather:{...report.weather,zip:'87106'}});
  await render({project:{id:'two',client:'Second job'},onForecast});const count=onForecast.mock.calls.length;
  await act(async()=>finish(report));expect(onForecast.mock.calls.length).toBe(count);
  expect(onForecast.mock.calls.at(-1)[0]).toMatchObject({project_id:'two',zip:'87106',forecast:{provider:'nws'}});
  expect(host.textContent).toContain('Second job forecast');expect(host.textContent).not.toContain('Review Thursday before the pour.');
});
test('failure removes old guidance and offers retry without changing a schedule',async()=>{
  await render();requestJson.mockRejectedValueOnce(new Error('Forecast request failed'));
  await act(async()=>button('Refresh briefing').click());expect(host.textContent).toContain('Forecast request failed');
  expect(host.textContent).not.toContain('Weather hold candidate');expect(requestJson.mock.calls.every(([,options])=>!options.method||options.method==='GET')).toBe(true);
});
test('unsupported audio still presents a readable briefing',async()=>{
  delete window.speechSynthesis;delete window.SpeechSynthesisUtterance;await render();
  expect(host.textContent).toContain('Read the briefing');expect(button('Listen to briefing')).toBeUndefined();
});
test('exposure is labeled a scenario, never an automatic changed date',async()=>{
  requestJson.mockResolvedValue({...report,schedule:{...report.schedule,status:'available',project_name:'Concrete schedule',weather_exposure:[{activity_id:1,name:'Slab preparation',is_critical:true,dates:['2026-10-01'],candidate_hold_day_count:1,scenario_days_beyond_float:1}],weather_exposure_basis:'Potential exposure only; verify working calendars. This is not a forecast delay.'}});
  await render();expect(host.textContent).toContain('Slab preparation');expect(host.textContent).toContain('1 days beyond recorded float in this scenario');expect(host.textContent).toContain('This is not a forecast delay.');
});
test('audio chunking preserves decimals, amounts and abbreviations',async()=>{
  const narration='Project 3.5 acre lot. Estimated margin $14,123.45. At 123 N.E. Main St. '+ 'Review the job before scheduling crews. '.repeat(12);
  requestJson.mockResolvedValue({...report,narration});await render();await act(async()=>button('Listen to briefing').click());
  let read=0;while(read<window.speechSynthesis.speak.mock.calls.length){const speech=window.speechSynthesis.speak.mock.calls[read++][0];await act(async()=>speech.onend());}
  expect(window.speechSynthesis.speak.mock.calls.map(([item])=>item.text).join(' ')).toBe(narration.trim());expect(button('Listen to briefing')).toBeDefined();
});
test('expiry withdraws guidance and stops old audio until refreshed',async()=>{
  const onForecast=jest.fn();requestJson.mockResolvedValue({...report,weather:{...report.weather,forecast:{...report.weather.forecast,expires_at:'2026-09-30T16:01:00Z'}}});
  await render({onForecast});await act(async()=>button('Listen to briefing').click());const before=window.speechSynthesis.cancel.mock.calls.length;
  await act(async()=>jest.advanceTimersByTime(60000));expect(host.textContent).toContain('The weather in this briefing has expired');expect(host.textContent).not.toContain('Weather hold candidate');expect(button('Listen to briefing')).toBeUndefined();
  expect(window.speechSynthesis.cancel.mock.calls.length).toBeGreaterThan(before);expect(onForecast.mock.calls.at(-1)[0]).toMatchObject({project_id:'one',forecast:null});
});
test('Albuquerque midnight withdraws a prior window even before expiry',async()=>{
  jest.setSystemTime(new Date('2026-10-01T05:59:00Z'));
  requestJson.mockResolvedValue({...report,weather:{...report.weather,forecast:{...report.weather.forecast,expires_at:'2026-10-01T07:00:00Z',window:{start_date:'2026-10-01'}}}});
  await render();expect(button('Listen to briefing')).toBeDefined();await act(async()=>jest.advanceTimersByTime(120000));expect(host.textContent).toContain('The weather in this briefing has expired');
});
