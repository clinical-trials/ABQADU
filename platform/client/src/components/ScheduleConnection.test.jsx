import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import ScheduleConnection from './ScheduleConnection';
import { requestJson, requestList } from '../utils/api';
jest.mock('../utils/api',()=>({requestJson:jest.fn(),requestList:jest.fn()}));
let host,root,onSaved;
const version='2e402faf-cd17-48c2-994e-ab869a9a65a0';
const nextVersion='e9841597-7bd4-4f71-8a09-2ac3a6da69d1';
const linked={project_id:'job-a',schedule_project_id:7,version,schedule_name:'Construction plan',status:'available'};
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;onSaved=jest.fn();
 Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>require('crypto').randomUUID()}});
 requestJson.mockReset().mockResolvedValue({link:null});requestList.mockReset().mockResolvedValue([{id:7,name:'Construction plan'},{id:8,name:'Different plan'}]);
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();});
const render=async(props={})=>act(async()=>root.render(<ScheduleConnection projectId="job-a" onSaved={onSaved} {...props}/>));
const btn=name=>[...host.querySelectorAll('button')].find(el=>el.textContent===name);
const choose=async value=>act(async()=>Simulate.change(host.querySelector('select'),{target:{value}}));
test('loads and directly opens the saved schedule without a write',async()=>{
 requestJson.mockResolvedValue({link:linked});await render();
 expect(host.querySelector('select').value).toBe('7');expect(host.querySelector('a[href="/schedule/7"]')).not.toBeNull();
 expect(requestJson.mock.calls.every(([,options])=>!options.method)).toBe(true);
});
test('selection needs explicit save and uses the verified receipt',async()=>{
 await render();await choose('7');expect(requestJson.mock.calls.length).toBe(1);
 requestJson.mockResolvedValue({link:linked,replayed:false});await act(async()=>btn('Save connection').click());
 expect(JSON.parse(requestJson.mock.calls.at(-1)[1].body)).toMatchObject({schedule_project_id:7,expected_version:null,request_id:expect.any(String)});
 expect(onSaved).toHaveBeenCalledWith(linked);expect(host.textContent).toContain('Schedule connection saved');
});
test('an uncertain save retries the exact request, while changing selection starts another request',async()=>{
 await render();await choose('7');requestJson.mockRejectedValue(new Error('Connection interrupted'));
 await act(async()=>btn('Save connection').click());const first=requestJson.mock.calls.at(-1)[1].body;
 await act(async()=>btn('Save connection').click());expect(requestJson.mock.calls.at(-1)[1].body).toBe(first);
 await choose('8');await act(async()=>btn('Save connection').click());expect(JSON.parse(requestJson.mock.calls.at(-1)[1].body).request_id).not.toBe(JSON.parse(first).request_id);
 expect(host.querySelector('select').value).toBe('8');expect(onSaved).not.toHaveBeenCalled();
});
test('a replay that returns a newer link never claims the older target was saved',async()=>{
 await render();await choose('7');requestJson.mockResolvedValue({link:{...linked,schedule_project_id:8,schedule_name:'Different plan'},replayed:true});
 await act(async()=>btn('Save connection').click());expect(host.textContent).toContain('The connection has changed since that request');
 expect(host.querySelector('a[href="/schedule/8"]')).not.toBeNull();expect(host.textContent).not.toContain('Schedule connection saved');
});
test('unlink keeps the current version and never deletes a schedule',async()=>{
 requestJson.mockResolvedValue({link:linked});await render();await choose('');
 requestJson.mockResolvedValue({link:{...linked,version:nextVersion,schedule_project_id:null,schedule_name:null},replayed:false});
 await act(async()=>btn('Disconnect schedule').click());
 const options=requestJson.mock.calls.at(-1)[1];expect(options.method).toBe('PUT');expect(JSON.parse(options.body)).toMatchObject({schedule_project_id:null,expected_version:version});
 expect(host.textContent).toContain('Schedule disconnected');
});
test('unavailable saved schedules remain visible and can be disconnected',async()=>{
 requestJson.mockResolvedValue({link:{...linked,status:'missing'}});requestList.mockResolvedValue([]);await render();
 expect(host.textContent).toContain('The saved schedule could not be found');expect(host.querySelector('select').value).toBe('7');
 await choose('');expect(btn('Disconnect schedule').disabled).toBe(false);
});
test('late responses cannot cross projects, and unconfirmed responses cannot claim success',async()=>{
 let resolve;requestJson.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));await render();
 requestJson.mockResolvedValue({link:null});await render({projectId:'job-b'});await act(async()=>resolve({link:linked}));
 expect(host.textContent).not.toContain('Connected to Construction plan');
 await choose('7');requestJson.mockResolvedValue({link:linked,replayed:false});await act(async()=>btn('Save connection').click());
 expect(host.textContent).toContain('could not be verified');expect(onSaved).not.toHaveBeenCalled();
});
test('a briefing refresh updates a clean saved connection and its direct link',async()=>{
 requestJson.mockResolvedValue({link:linked});await render({refreshKey:0});
 requestJson.mockResolvedValue({link:{...linked,version:nextVersion,schedule_project_id:8,schedule_name:'Different plan'}});
 await render({refreshKey:1});
 expect(host.querySelector('select').value).toBe('8');expect(host.querySelector('a[href="/schedule/8"]')).not.toBeNull();
 expect(host.querySelector('a[href="/schedule/7"]')).toBeNull();expect(onSaved).not.toHaveBeenCalled();
});
test('a briefing refresh preserves an unsaved choice and its original conflict version',async()=>{
 requestJson.mockResolvedValue({link:linked});await render({refreshKey:0});await choose('8');
 await render({refreshKey:1});expect(requestJson).toHaveBeenCalledTimes(1);
 expect(host.querySelector('select').value).toBe('8');expect(host.textContent).toContain('unsaved schedule choice');
 requestJson.mockRejectedValue(new Error('The saved connection changed. Reload it.'));
 await act(async()=>btn('Save connection').click());
 expect(JSON.parse(requestJson.mock.calls.at(-1)[1].body).expected_version).toBe(version);
});
test('explicit reload replaces an unsaved choice and refreshes its briefing',async()=>{
 const onReload=jest.fn();requestJson.mockResolvedValue({link:linked});await render({onReload});await choose('8');
 requestJson.mockResolvedValue({link:{...linked,version:nextVersion,schedule_project_id:null,schedule_name:null}});
 await act(async()=>btn('Reload saved connection').click());
 expect(host.querySelector('select').value).toBe('');expect(onReload).toHaveBeenCalledTimes(1);
 expect(btn('Save connection').disabled).toBe(true);
});
test('refresh during a pending save keeps its choice and waits for the verified receipt',async()=>{
 requestJson.mockResolvedValue({link:linked});await render({refreshKey:0});await choose('8');
 let resolve;requestJson.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 await act(async()=>btn('Save connection').click());await render({refreshKey:1});
 expect(requestJson).toHaveBeenCalledTimes(2);expect(host.querySelector('select').value).toBe('8');
 expect(btn('Reload saved connection').disabled).toBe(true);expect(onSaved).not.toHaveBeenCalled();
 await act(async()=>resolve({link:{...linked,version:nextVersion,schedule_project_id:8,schedule_name:'Different plan'},replayed:false}));
 expect(host.querySelector('a[href="/schedule/8"]')).not.toBeNull();expect(onSaved).toHaveBeenCalledTimes(1);
});
test.each([
 ['missing versioned link',{link:null,replayed:false}],
 ['different target',{link:{...linked,version:nextVersion,schedule_project_id:8},replayed:false}],
 ['unchanged version',{link:{...linked,schedule_project_id:null},replayed:false}],
])('an invalid save receipt (%s) preserves the choice and the same retry',async(label,receipt)=>{
 requestJson.mockResolvedValue({link:linked});await render();await choose('');
 requestJson.mockResolvedValue(receipt);await act(async()=>btn('Disconnect schedule').click());
 const first=requestJson.mock.calls.at(-1)[1].body;
 expect(host.textContent).toContain('could not be verified');expect(host.textContent).not.toContain('Schedule disconnected');
 expect(host.querySelector('select').value).toBe('');expect(onSaved).not.toHaveBeenCalled();
 await act(async()=>btn('Disconnect schedule').click());expect(requestJson.mock.calls.at(-1)[1].body).toBe(first);
});
