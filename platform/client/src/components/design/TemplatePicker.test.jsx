import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TemplatePicker from './TemplatePicker';

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const button = text => [...container.querySelectorAll('button')].find(item => item.textContent.includes(text));
const mount = async onSelect => act(async () => root.render(<TemplatePicker onSelect={onSelect} onClose={() => {}} />));

test('template load error is visible and retry recovers the list', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ok:false,status:503,json:async()=>({error:'Database unavailable'})})
    .mockResolvedValueOnce({ok:true,json:async()=>[{id:8,name:'Courtyard',sqft:500}]});
  await mount(jest.fn());
  expect(container.querySelector('[role="alert"]').textContent).toContain('Database unavailable');
  await act(async () => button('Retry templates').click());
  expect(button('Courtyard')).toBeDefined();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test('failed template selection keeps the picker open without replacing canvas with empty rooms', async () => {
  const onSelect = jest.fn();
  global.fetch = jest.fn().mockResolvedValueOnce({ok:true,json:async()=>[{id:8,name:'Courtyard',sqft:500}]})
    .mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await mount(onSelect);
  await act(async () => button('Courtyard').click());
  expect(onSelect).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]').textContent).toContain('Unable to reach the server');
  expect(button('Courtyard').disabled).toBe(false);
});

test.each(['blank', 'close'])('a dismissed template cannot overwrite the canvas after choosing %s', async action => {
  let finish;
  const onSelect = jest.fn();
  global.fetch = jest.fn().mockResolvedValueOnce({ok:true,json:async()=>[{id:8,name:'Courtyard'}]})
    .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await mount(onSelect);
  await act(async () => button('Courtyard').click());
  await act(async () => (action === 'blank' ? button('Start with blank') : container.querySelector('[aria-label="Close templates"]')).click());
  await act(async () => finish({ok:true,json:async()=>({design:{rooms:[{id:'old'}]}})}));
  expect(onSelect).toHaveBeenCalledTimes(action === 'blank' ? 1 : 0);
  if (action === 'blank') expect(onSelect).toHaveBeenCalledWith([], null);
});
