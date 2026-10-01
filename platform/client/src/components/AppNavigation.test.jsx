import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AppNavigation from './AppNavigation';
jest.mock('./AuthBoundary', () => ({ WorkspaceSignOut: () => null }));
let root, container;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT=true; container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container); });
afterEach(async () => { await act(async()=>root.unmount()); container.remove(); jest.restoreAllMocks(); });
test('primary tabs follow the construction workflow and keep support tools separate',async()=>{
  await act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AppNavigation/></MemoryRouter>));
  const tabs=[...container.querySelectorAll('[aria-label="Job workflow"] a')];
  expect(tabs.map(a=>a.textContent.replace(/^\d+\s*/,''))).toEqual(['Intake','Site review','Estimate','Agreement','Build','Invoices']);
  expect(tabs[0].getAttribute('href')).toBe('/command-center#project-intake');
  expect(tabs[2].getAttribute('href')).toBe('/cost-estimator');
  expect(tabs[5].getAttribute('href')).toBe('/invoices');
  expect(container.querySelector('[aria-label="Quick tools"]').textContent).toContain('Messages');
});
test('a deep link opens its containing office section before scrolling',async()=>{
  const details=document.createElement('details');details.innerHTML='<div id="project-intake">Intake</div>';container.appendChild(details);
  const target=details.firstChild;target.scrollIntoView=jest.fn();
  const mount=document.createElement('div');container.appendChild(mount);const extra=createRoot(mount);
  await act(async()=>extra.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}} initialEntries={['/command-center#project-intake']}><AppNavigation/></MemoryRouter>));
  expect(details.open).toBe(true);expect(target.scrollIntoView).toHaveBeenCalled();
  await act(async()=>extra.unmount());
});
