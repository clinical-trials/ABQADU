import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import ContractorDesk from './ContractorDesk';

let host, root, props;
const project = { id: 'site-one', client: 'Rivera project', address: 'Albuquerque, NM 87106', model: 'Altura', next_action: 'Confirm slab preparation.' };
const forecast = { provider:'weatherkit', source:'Apple Weather', location:'Albuquerque site', checked_at:'2026-09-21T19:00:00Z', window:{start_date:'2026-09-22',end_date:'2026-09-25',time_zone:'America/Denver'}, days:['22','23','24','25'].map((day,index)=>({date:`2026-09-${day}`,high_f:75,low_f:58,rain_chance:index===0?80:20,precip_inches:index===0?0.2:0,wind_mph:8,gust_mph:15,wind_coverage:'complete',description:'Cloudy',trade_guidance:{concrete:{level:index===0?'hold':'plan',label:index===0?'Hold & confirm':'Plan work',reasons:[index===0?'Rain can disrupt the pour.':'Review site conditions.'],message:'Confirm conditions with the contractor.'},roofing:{level:'review',label:'Check conditions',reasons:['Review roof conditions.'],message:'Confirm with the roofing lead.'}}})),attribution:{mark_url:'https://weatherkit.apple.com/assets/branding/en/Apple_Weather_blk_en_2X.png',legal_url:'https://developer.apple.com/weatherkit/data-source-attribution/'}};
beforeEach(()=>{
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-09-21T19:00:00Z'));
  global.IS_REACT_ACT_ENVIRONMENT=true;
  global.fetch=jest.fn(async()=>({ok:true,json:async()=>({inbound_configured:false,phone:null,missing:[]})}));
  props={project,state:{bid_requests:[],sms_inbox:[],weather_holds:[]},forecast:null,busy:false,onCheckWeather:jest.fn(),runAction:jest.fn(async()=>({projects:[project]})),onRefresh:jest.fn()};
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();jest.useRealTimers();});
const render=async()=>{await act(async()=>root.render(<ContractorDesk {...props}/>));};
const button=name=>[...host.querySelectorAll('button')].find(el=>el.textContent===name);
const change=async(label,value)=>{const input=host.querySelector(`[aria-label="${label}"]`);expect(input).not.toBeNull();await act(async()=>Simulate.change(input,{target:{value}}));};

test('shows four dated unknown weather cards without inventing a safe workday',async()=>{
  await render();
  expect(host.querySelectorAll('[data-weather-day]').length).toBe(4);
  expect(host.textContent).toContain('Forecast needed');
  expect(host.textContent).not.toContain('Plan work');
  await act(async()=>button('Update forecast').click());
  expect(props.onCheckWeather).toHaveBeenCalledTimes(1);
});
test('shows trade-specific guidance and only confirms a weather day off after an explicit action',async()=>{
  props.forecast=forecast;await render();
  expect(host.querySelectorAll('[data-weather-day]').length).toBe(4);
  expect(host.textContent).toContain('Rain can disrupt the pour.');
  expect(props.runAction).not.toHaveBeenCalled();
  await act(async()=>[...host.querySelectorAll('[data-weather-day] button')][0].click());
  expect(props.runAction).not.toHaveBeenCalled();
  await act(async()=>button('Confirm day off').click());
  const [url,options]=props.runAction.mock.calls[0];
  expect(url).toBe('/api/contractor-desk/weather-holds');
  expect(JSON.parse(options.body)).toMatchObject({project_id:'site-one',trade:'concrete',date:'2026-09-22'});
  expect(host.querySelector('img[alt="Apple Weather"]')).not.toBeNull();
});
test('saving a scoped bid request uses the selected project and never sends a message',async()=>{
  await render();
  await act(async()=>button('Request a bid').click());
  await change('Job title','Pour 600 sq ft slab');
  await change('Scope of work','Prepare forms, reinforce and pour the slab.');
  await change('Subcontractor name','Concrete team');
  await change('Subcontractor phone','5055550123');
  await act(async()=>Simulate.submit(host.querySelector('form[aria-label="New bid request"]')));
  const [url,options]=props.runAction.mock.calls[0];
  expect(url).toBe('/api/contractor-desk/bid-requests');
  expect(JSON.parse(options.body)).toMatchObject({project_id:'site-one',trade:'concrete',title:'Pour 600 sq ft slab',scope:'Prepare forms, reinforce and pour the slab.',contact_phone:'5055550123'});
  expect(props.runAction.mock.calls.some(([path])=>path.includes('/sms/send'))).toBe(false);
});
test('failed bid save retains the scope and shows no success or sent status',async()=>{
  props.runAction.mockResolvedValue(null);await render();
  await act(async()=>button('Request a bid').click());
  await change('Job title','Slab');await change('Scope of work','Keep this scope');
  await act(async()=>Simulate.submit(host.querySelector('form[aria-label="New bid request"]')));
  expect(host.querySelector('[aria-label="Scope of work"]').value).toBe('Keep this scope');
  expect(host.textContent).not.toContain('Bid request saved');
});
test('job inbox includes matching and unassigned texts but excludes another project',async()=>{
  props.state.sms_inbox=[{id:'one',project_id:'site-one',body:'Can quote the slab.',media_count:2,from:'+15055550123'},{id:'two',project_id:'another',body:'Other private job',from:'+15055550124'},{id:'three',project_id:null,body:'Need help assigning this quote',from:'+15055550125'}];
  await render();
  expect(host.textContent).toContain('Can quote the slab.');
  expect(host.textContent).toContain('2 attachments · review in Twilio');
  expect(host.textContent).toContain('Needs assignment');
  expect(host.textContent).not.toContain('Other private job');
});
test('an expired forecast closes the day off confirmation and requires a refresh',async()=>{
  props.forecast={...forecast,expires_at:'2026-09-21T19:01:00Z'};await render();
  await act(async()=>host.querySelector('[data-weather-day] button').click());
  expect(button('Confirm day off')).toBeDefined();
  await act(async()=>jest.advanceTimersByTime(61000));
  expect(button('Confirm day off')).toBeUndefined();
  expect(props.runAction).not.toHaveBeenCalled();
});
test('all weather reasons remain visible when coverage is partial',async()=>{
  props.forecast={...forecast,days:forecast.days.map(day=>({...day,wind_coverage:'partial',trade_guidance:{concrete:{level:'hold',label:'Weather hold candidate',reasons:['Wind data is incomplete.','Thunderstorms forecast.'],message:'Confirm a weather hold.'}}}))};await render();
  expect(host.querySelector('[data-weather-day]').textContent).toContain('Thunderstorms forecast.');
  expect(host.querySelector('[data-weather-day]').textContent).toContain('Wind data incomplete');
});
test('bid drafts stay with their project when switching jobs',async()=>{
  await render();await act(async()=>button('Request a bid').click());await change('Scope of work','First job only');
  props.project={...project,id:'second'};await render();
  expect(host.querySelector('[aria-label="Scope of work"]').value).toBe('');
  props.project=project;await render();
  expect(host.querySelector('[aria-label="Scope of work"]').value).toBe('First job only');
});
test('unassigned text requires an explicit review and older inbox records remain accessible',async()=>{
  props.state.sms_inbox=Array.from({length:13},(_,i)=>({id:`sms-${i}`,project_id:null,body:`Quote number ${i}`,from:'+15055550123'}));await render();
  expect(host.textContent).not.toContain('Quote number 12');
  await act(async()=>button('Show more texts (1 remaining)').click());
  expect(host.textContent).toContain('Quote number 12');
  await act(async()=>button('Assign to Rivera project & review').click());
  expect(props.runAction.mock.calls[0][0]).toBe('/api/contractor-desk/sms/sms-0/review');
  expect(JSON.parse(props.runAction.mock.calls[0][1].body)).toEqual({project_id:'site-one'});
});
test('today’s confirmed hold remains visible and cancelled hold instructions cannot be copied',async()=>{
  props.state.weather_holds=[{id:'today',project_id:'site-one',trade:'concrete',date:'2026-09-21',status:'Confirmed',note:'Rain hold today.'},{id:'cancelled',project_id:'site-one',trade:'concrete',date:'2026-09-22',status:'Cancelled',note:'Original decision.',message_body:'Outdated hold instruction.'}];await render();
  expect(host.textContent).toContain('Rain hold today.');
  expect(host.textContent).toContain('Day off removed');
  expect(host.textContent).not.toContain('Outdated hold instruction.');
  expect([...host.querySelectorAll('button')].filter(el=>el.textContent==='Copy crew note')).toHaveLength(1);
  await act(async()=>button('Remove day off').click());
  expect(props.runAction.mock.calls[0][0]).toBe('/api/contractor-desk/weather-holds/today/cancel');
});
