import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Portfolio from './Portfolio';
import BidBuilder from './BidBuilder';
import { getAuthSession } from '../utils/authFetch';

let host, root;
const stopDocumentNavigation = event => event.preventDefault();
function Location() { return <output data-route>{useLocation().pathname}</output>; }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  document.addEventListener('click', stopDocumentNavigation);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  document.removeEventListener('click', stopDocumentNavigation);
  jest.restoreAllMocks();
});

test.each([
  [Portfolio, 'Schedule', '/schedule/7', true],
  [Portfolio, 'Field operations', '/field/7', true],
  [Portfolio, 'Risks', '/risks/7', true],
  [Portfolio, 'Create or manage a project', '/schedule', false],
  [BidBuilder, 'Cost estimator →', '/cost-estimator', false],
])('%p: %s navigates within the signed-in app to %s', async (Component, label, destination, populated) => {
  global.fetch = jest.fn(async url => ({ ok:true, status:200, json:async () => url === '/api/integrations/status' ? {} : url === '/api/portfolio' && populated ? [{id:7,name:'Example build',health:'on_schedule',pct_complete:0}] : [] }));
  const owner = getAuthSession();
  await act(async () => root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Component/><Location/></MemoryRouter>));
  await act(async () => [...host.querySelectorAll('a')].find(link => link.textContent === label).click());
  expect(host.querySelector('[data-route]').textContent).toBe(destination);
  expect(getAuthSession()).toBe(owner);
});
