import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import IntegrationSetup from './IntegrationSetup';

let root, container;
const services = ['clerk', 'invoiceshelf', 'stripe', 'twilio', 'ocr'];
const configuration = configured => Object.fromEntries(services.map(name => [name, {configured}]));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = async props => act(async () => root.render(<IntegrationSetup onRefresh={() => {}} {...props} />));

test('adding credentials never claims a verified connection or completed login', async () => {
  await render({integrations:configuration(true)});
  expect(container.querySelectorAll('[data-setup-status="configured"]')).toHaveLength(5);
  expect(container.textContent).not.toMatch(/\bConnected\b/);
  expect(container.textContent).toContain('Credentials added · untested');
  expect(container.textContent).toContain('verified Clerk session and an approved staff account');
});

test('missing credentials show useful next steps and working alternatives for all five services', async () => {
  await render({integrations:configuration(false)});
  expect(container.querySelectorAll('details')).toHaveLength(5);
  expect(container.textContent).toContain('Use your phone’s text app');
  expect(container.textContent).toContain('Pasted receipt text works now');
  expect(container.textContent).toContain('confirm the invoice balance updates once');
  expect(container.querySelectorAll('[data-setup-status="missing"]')).toHaveLength(5);
});

test('failed status checks do not display stale credentials as usable', async () => {
  await render({integrations:configuration(true),error:'Unable to reach the server.'});
  expect(container.querySelector('[role="alert"]').textContent).toContain('Unable to reach the server');
  expect(container.querySelectorAll('[data-setup-status="unavailable"]')).toHaveLength(5);
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
