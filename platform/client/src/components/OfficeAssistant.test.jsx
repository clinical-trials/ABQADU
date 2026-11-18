import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OfficeAssistant from './OfficeAssistant';
let host, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; host=document.createElement('div'); document.body.appendChild(host); root=createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
test('isolates job follow-ups and never claims that opening a draft sent it', async () => {
 const action=jest.fn();
 const state={office_tasks:[{id:'a',project_id:'p',kind:'payment',due_date:'2020-01-01',message:'Check arrangements',status:'open'}, {id:'b',project_id:'other',kind:'inquiry',message:'Private other job',status:'open'}]};
 await act(async () => root.render(<OfficeAssistant project={{id:'p',client:'Test',client_phone:'5055550123'}} state={state} runAction={action}/>));
 expect(host.textContent).toContain('Check arrangements');
 expect(host.textContent).not.toContain('Private other job');
 expect(host.textContent).toContain('does not confirm delivery');
 expect(host.querySelector('a').getAttribute('href')).toContain('sms:+15055550123');
 expect(action).not.toHaveBeenCalled();
 await act(async () => [...host.querySelectorAll('button')].find(node => node.textContent==='Pause').click());
 expect(JSON.parse(action.mock.calls[0][1].body)).toEqual({id:'a',status:'paused'});
});
test('paused and completed tasks stay out of the open queue', async () => {
 await act(async () => root.render(<OfficeAssistant project={{id:'p'}} state={{office_tasks:[{id:'a',project_id:'p',kind:'payment',due_date:'2020-01-01',message:'Paused payment',status:'paused'}]}} runAction={jest.fn()}/>));
 expect(host.textContent).not.toContain('Paused payment');
 await act(async () => [...host.querySelectorAll('button')].find(node => node.textContent==='Show history').click());
 expect(host.textContent).toContain('Paused payment');
 expect(host.querySelector('a')).toBeNull();
});
