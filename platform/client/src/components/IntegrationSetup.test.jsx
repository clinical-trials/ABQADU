import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import IntegrationSetup from './IntegrationSetup';

let root, container;
const services = ['clerk', 'invoiceshelf', 'stripe', 'twilio', 'ocr', 'weather'];
const configuration = configured => Object.fromEntries(services.map(name => [name, {configured}]));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = async props => act(async () => root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><IntegrationSetup onRefresh={() => {}} {...props} /></MemoryRouter>));

test('adding provider settings never claims a verified connection or completed login', async () => {
  await render({integrations:{...configuration(true),workspaceAuth:{mode:'clerk',configured:true}}});
  expect(container.querySelectorAll('[data-setup-status="configured"]')).toHaveLength(6);
  expect(container.textContent).not.toMatch(/\bConnected\b/);
  expect(container.textContent).toContain('Credentials added · untested');
  expect(container.querySelector('[data-auth-mode="clerk"]').textContent).toContain('test sign-in');
});

test('missing credentials show useful next steps when optional Apple Weather is selected', async () => {
  await render({integrations:{...configuration(false),weather:{configured:false,provider:'weatherkit'}}});
  expect(container.querySelectorAll('.integration-setup__service')).toHaveLength(6);
  expect(container.textContent).toContain('Use your phone’s text app');
  expect(container.textContent).toContain('Browser photo scanning does not need an OCR.space account');
  expect(container.textContent).toContain('confirm the invoice balance updates once');
  expect(container.textContent).toContain('Apple Weather');
  expect(container.textContent).toContain('Map each project ZIP');
  expect(container.querySelectorAll('[data-setup-status="missing"]')).toHaveLength(6);
});

test('default NWS weather works without credentials and does not claim a verified provider connection', async () => {
  await render({ integrations: { ...configuration(false), weather: { configured: true, provider: 'nws', source: 'National Weather Service', required_env: [], missing: [] } } });
  const weather = [...container.querySelectorAll('.integration-setup__service')].find(item => item.textContent.includes('National Weather Service'));
  expect(weather).toBeDefined();
  expect(weather.textContent).toContain('No credentials required');
  expect(weather.textContent).toContain('Update forecast');
  expect(weather.textContent).not.toContain('Apple Developer');
  expect(weather.textContent).not.toContain('Credentials added');
});

test('failed status checks do not display stale credentials as usable', async () => {
  await render({integrations:configuration(true),error:'Unable to reach the server.'});
  expect(container.querySelector('[role="alert"]').textContent).toContain('Unable to reach the server');
  expect(container.querySelectorAll('[data-setup-status="unavailable"]')).toHaveLength(6);
  expect(container.textContent).not.toContain('Credentials added · untested');
});

test('refresh only requests configuration and is disabled while checking', async () => {
  const onRefresh = jest.fn();
  await render({onRefresh,loading:false});
  await act(async () => container.querySelector('button').click());
  expect(onRefresh).toHaveBeenCalledTimes(1);
  await render({onRefresh,loading:true});
  expect(container.querySelector('button').disabled).toBe(true);
});

test('built-in check, phone and browser receipt tools remain visible with optional services unconfigured', async () => {
  await render({integrations:{...configuration(false),workspaceAuth:{mode:'admin',configured:true}},receiptScannerAvailable:true});
  const builtIn = container.querySelector('[aria-label="Built-in workflows"]');
  expect(builtIn.textContent).toContain('Check tracking');
  expect(builtIn.textContent).toContain('Phone text drafts');
  expect(builtIn.textContent).toContain('Receipt photo scan');
  expect(builtIn.textContent).not.toContain('Setup needed');
  expect(container.querySelector('[data-auth-mode="admin"]').textContent).toContain('Admin password');
  expect(container.querySelector('.integration-setup__optional').open).toBe(false);
  expect(container.textContent).not.toContain('Verify sign-in first');
  expect(container.textContent).toContain('Stripe is not needed for checks');
});

test('local mode is clearly limited to this computer and does not require Clerk setup', async () => {
  await render({integrations:{...configuration(false),workspaceAuth:{mode:'local',configured:true}}});
  const access = container.querySelector('[data-auth-mode="local"]');
  expect(access.textContent).toContain('This computer only');
  expect(access.textContent).not.toContain('Clerk setup');
  expect(container.querySelector('[aria-label="Built-in workflows"]').textContent).not.toContain('Receipt photo scan');
});

test('failed and loading checks suppress previously configured workspace access status', async () => {
  const integrations = {...configuration(true),workspaceAuth:{mode:'admin',configured:true}};
  await render({integrations,error:'Server unavailable'});
  expect(container.querySelector('[data-auth-mode]').getAttribute('data-auth-mode')).toBe('unknown');
  await render({integrations,loading:true});
  expect(container.querySelector('[data-auth-mode]').getAttribute('data-auth-mode')).toBe('unknown');
  expect(container.querySelector('[data-auth-mode]').textContent).toContain('Checking');
});
