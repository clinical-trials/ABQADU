import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import ProjectWorkspace from './ProjectWorkspace';
import { setAuthSession } from '../utils/authFetch';

let root, container, navigate;
function Navigation() { navigate = useNavigate(); return null; }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const render = async (url = '/field') => {
  await act(async () => root.render(<MemoryRouter initialEntries={[url]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}>
    <Navigation />
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
  global.fetch = jest.fn(async url => url === '/api/portfolio' ? response([{id:2,name:'Actual project'}]) : {ok:false,status:404,json:async()=>({error:'Not found'})});
  await render('/field/99');
  expect(container.textContent).toContain('Project not found');
  expect(container.querySelector('[data-project]')).toBeNull();
  await act(async () => Simulate.change(container.querySelector('select'), {target:{value:'2'}}));
  expect(container.querySelector('[data-project]').dataset.project).toBe('2');
});

test('an inactive exact project opens with its status even when the active list is empty', async () => {
  global.fetch = jest.fn(async url => response(url === '/api/portfolio' ? [] : { project: { id: 17, name: 'Archived build', status: 'archived' }, activities: [], top_risks: [] }));
  await render('/field/17');
  expect(fetch).toHaveBeenCalledWith('/api/portfolio/17', expect.any(Object));
  expect(container.querySelector('[data-project]').dataset.project).toBe('17');
  expect(container.querySelector('select').value).toBe('17');
  expect(container.textContent).toContain('Project status: archived');
  expect(container.querySelector('form')).toBeNull();
});

test('a missing exact project with an empty portfolio never offers automatic project creation', async () => {
  global.fetch = jest.fn(async url => url === '/api/portfolio' ? response([]) : {ok:false,status:404,json:async()=>({error:'Not found'})});
  await render('/field/99');
  expect(container.textContent).toContain('Project not found');
  expect(container.querySelector('form')).toBeNull();
  expect(container.querySelector('[data-project]')).toBeNull();
});

test('a failed exact lookup stays unavailable and retries without substituting another project', async () => {
  global.fetch = jest.fn(async url => url === '/api/portfolio' ? response([{id:2,name:'Other project'}]) : {ok:false,status:503,json:async()=>({error:'Schedule storage unavailable'})});
  await render('/field/17');
  expect(container.textContent).toContain('Schedule storage unavailable');
  expect(container.querySelector('form')).toBeNull();
  expect(container.querySelector('[data-project]')).toBeNull();
  fetch.mockImplementation(async url => response(url === '/api/portfolio' ? [{id:2,name:'Other project'}] : {project:{id:17,name:'Recovered build',status:'completed'}}));
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Retry loading project').click());
  expect(container.querySelector('[data-project]').dataset.project).toBe('17');
});

test('a rapid route change aborts exact lookup and ignores a late response from the old project', async () => {
  let completeOld;
  global.fetch = jest.fn(async url => {
    if (url === '/api/portfolio') return response([{id:2,name:'Active project'}]);
    if (url === '/api/portfolio/17') return new Promise(resolve => { completeOld = resolve; });
    return response({project:{id:18,name:'Second archived build',status:'archived'}});
  });
  await render('/field/17');
  const oldSignal = fetch.mock.calls.find(([url]) => url === '/api/portfolio/17')[1].signal;
  expect(container.querySelector('form')).toBeNull();
  expect(container.querySelector('[data-project]')).toBeNull();
  await act(async () => navigate('/field/18'));
  expect(oldSignal.aborted).toBe(true);
  expect(container.querySelector('[data-project]').dataset.project).toBe('18');
  await act(async () => completeOld(response({project:{id:17,name:'Old private build',status:'archived'}})));
  expect(container.querySelector('[data-project]').dataset.project).toBe('18');
  expect(container.textContent).not.toContain('Old private build');
});

test('a mismatched exact response cannot open another project', async () => {
  global.fetch = jest.fn(async url => response(url === '/api/portfolio' ? [] : {project:{id:22,name:'Wrong project',status:'archived'}}));
  await render('/field/17');
  expect(container.querySelector('[data-project]')).toBeNull();
  expect(container.querySelector('form')).toBeNull();
  expect(container.textContent).not.toContain('Wrong project');
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

test('a changed auth session hides loaded project tools and ignores a late exact response', async () => {
  let complete;
  global.fetch = jest.fn(async url => url === '/api/portfolio' ? response([{id:2,name:'Old active project'}]) : new Promise(resolve => { complete = resolve; }));
  await render('/field/17');
  await act(async () => setAuthSession({userId:'other-staff',sessionId:'other-session',getToken:async()=>'other-token'}));
  await act(async () => complete(response({project:{id:17,name:'Old private project',status:'archived'}})));
  expect(container.querySelector('[data-project]')).toBeNull();
  expect(container.textContent).not.toContain('Old private project');
  expect(container.textContent).not.toContain('Old active project');
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
