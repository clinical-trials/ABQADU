import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectWorkspace from './ProjectWorkspace';

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const render = async (url = '/field') => {
  await act(async () => root.render(<MemoryRouter initialEntries={[url]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}>
    <Routes><Route path="/field/:id?" element={<ProjectWorkspace section="field">{id => <div data-project={id}>Project tools</div>}</ProjectWorkspace>} /></Routes>
  </MemoryRouter>));
};
const response = data => ({ok:true,json:async()=>data});

test('empty database offers project creation and never opens a nonexistent project', async () => {
  global.fetch = jest.fn(async (url, options) => response(options?.method === 'POST' ? {id:42,name:'New build'} : []));
  await render();
  expect(container.querySelector('[data-project]')).toBeNull();
  await act(async () => Simulate.change(container.querySelector('input'), {target:{value:'New build'}}));
  await act(async () => Simulate.submit(container.querySelector('form')));
  expect(fetch).toHaveBeenCalledWith('/api/projects', expect.objectContaining({method:'POST', body:JSON.stringify({name:'New build'})}));
  expect(container.querySelector('[data-project]').dataset.project).toBe('42');
});

test('invalid project URL cannot silently edit another project', async () => {
  global.fetch = jest.fn(async () => response([{id:2,name:'Actual project'}]));
  await render('/field/99');
  expect(container.textContent).toContain('Project not found');
  expect(container.querySelector('[data-project]')).toBeNull();
  await act(async () => Simulate.change(container.querySelector('select'), {target:{value:'2'}}));
  expect(container.querySelector('[data-project]').dataset.project).toBe('2');
});

test('failed creation keeps the project name and allows retry', async () => {
  global.fetch = jest.fn(async (url, options) => options?.method === 'POST'
    ? {ok:false,status:503,json:async()=>({error:'Database unavailable'})} : response([]));
  await render();
  await act(async () => Simulate.change(container.querySelector('input'), {target:{value:'Keep my name'}}));
  await act(async () => Simulate.submit(container.querySelector('form')));
  expect(container.querySelector('input').value).toBe('Keep my name');
  expect(container.querySelector('[role="alert"]').textContent).toContain('Database unavailable');
  expect(container.querySelector('[data-project]')).toBeNull();
});
