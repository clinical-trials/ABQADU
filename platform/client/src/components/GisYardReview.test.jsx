import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import GisYardReview from './GisYardReview';
import { requestJson } from '../utils/api';
import { setAuthSession } from '../utils/authFetch';

jest.mock('../utils/api', () => ({ requestJson: jest.fn() }));
const version = '11111111-1111-4111-8111-111111111111';
const nextVersion = '22222222-2222-4222-8222-222222222222';
const first = { id: 'yard-one', client: 'Fixture owner', address: '100 Fixture Ave #2 & Rear, Albuquerque, NM' };
const second = { id: 'yard-two', client: 'Second fixture', address: '200 Other Fixture Lane, Albuquerque, NM' };
const empty = () => ({ status: 'queued', jurisdiction: 'unknown', parcel_id: '', width_ft: '', depth_ft: '', notes: '', checks: { parcel: false, zoning: false, access: false, easements: false, utilities: false }, utility_reviews:unknownUtilities(),size_review:emptySize() });
const record = (patch = {}, project = first) => ({ project_id: project.id, version, address_snapshot: project.address, updated_at: '2026-09-30T18:00:00.000Z', ...empty(), ...patch });
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const endpoint = id => `/api/project-helper/projects/${encodeURIComponent(id)}/gis-review`;
const unknownUtilities = () => Object.fromEntries(['water','electric','sewer'].map(key=>[key,{status:'unknown',notes:''}]));
const emptySize = () => ({primary_house_sqft:'',adu_sqft:''});
let host, root, saveChanges, onSaved, projects, records, staleProjects, loadOverride, saveOverride, originalCrypto;
const response = id => ({ project: projects[id], review: records[id] || null, stale: staleProjects.has(id) });
const writes = () => requestJson.mock.calls.filter(([, options]) => options?.method === 'PUT');
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === text);
const field = label => [...host.querySelectorAll('label')].find(item => item.textContent.trim().startsWith(label))?.querySelector('input,select,textarea');
const render = (props = {}) => act(async () => root.render(<GisYardReview project={first} revision={0} saveChanges={saveChanges} onSaved={onSaved} {...props} />));
const change = (label, value) => act(async () => Simulate.change(field(label), { target: { value } }));
const check = (label, checked) => act(async () => Simulate.change(field(label), { target: { checked } }));
const click = label => act(async () => button(label).click());

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  projects = { [first.id]: { ...first }, [second.id]: { ...second } };
  records = {}; staleProjects = new Set(); loadOverride = null; saveOverride = null;
  saveChanges = jest.fn(async () => ({ projects: Object.values(projects) }));
  onSaved = jest.fn();
  requestJson.mockReset().mockImplementation(async (url, options = {}) => {
    const id = decodeURIComponent(url.split('/')[4]);
    if (options.method === 'PUT') {
      if (saveOverride) return saveOverride(url, options);
      const body = JSON.parse(options.body);
      records[id] = record({ ...body.review, version: require('crypto').randomUUID() }, projects[id]);
      staleProjects.delete(id);
      return { ...response(id), replayed: false };
    }
    return loadOverride ? loadOverride(url, options) : response(id);
  });
  originalCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => require('crypto').randomUUID() } });
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
  jest.spyOn(window, 'open').mockImplementation(() => null);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks();
  if (originalCrypto) Object.defineProperty(window, 'crypto', originalCrypto);
  else delete window.crypto;
});

test('mount reads only the private review and prepares encoded current-address links without opening external services', async () => {
  await render();
  expect(requestJson).toHaveBeenCalledTimes(1);
  expect(requestJson.mock.calls[0][0]).toBe(endpoint(first.id));
  expect(writes()).toHaveLength(0); expect(saveChanges).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled(); expect(window.open).not.toHaveBeenCalled();
  const city = host.querySelector('a[href*="webappviewer"]');
  expect(city.getAttribute('href')).toContain(`&find=${encodeURIComponent(first.address)}`);
  expect(new URL(city.href).searchParams.get('find')).toBe(first.address);
  expect(city.target).toBe('_blank'); expect(city.rel).toContain('noopener');
  expect(host.querySelector('a[href*="geocortexweb"]').href).not.toContain('find=');
  expect(host.querySelector('input[aria-label="Address for GIS review"]').value).toBe(first.address);
  expect(host.textContent).toContain('Not queued');
});

test('legacy utility checkbox never confirms water, electric or sewer independently', async () => {
  records[first.id] = record({checks:{...empty().checks,utilities:true}});
  delete records[first.id].utility_reviews;
  await render();
  for (const label of ['Water','Electric','Sewer']) expect(field(`${label} status`)?.value).toBe('unknown');
  const overview=host.querySelector('[aria-label="Water, electric and sewer priorities"]');
  expect(overview?.textContent).toContain('Water');
  expect(overview?.textContent).toContain('Electric');
  expect(overview?.textContent).toContain('Sewer');
  expect(overview?.textContent.match(/Not checked/g)).toHaveLength(3);
  expect(writes()).toHaveLength(0);
});

test('house-to-ADU comparison uses entered floor areas without imposing an unverified two-to-one rule', async () => {
  await render();
  expect(field('Main house gross floor area (sq ft)')).toBeDefined();
  expect(host.querySelector('[aria-label="House to ADU area ratio"]').textContent).toContain('Not measured');
  await change('Main house gross floor area (sq ft)','1500'); await change('Proposed ADU gross floor area (sq ft)','750');
  expect(host.querySelector('[aria-label="House to ADU area ratio"]').textContent).toContain('2:1');
  await change('Main house gross floor area (sq ft)','1000');
  expect(host.querySelector('[aria-label="House to ADU area ratio"]').textContent).toContain('1.33:1');
  expect(host.textContent).not.toMatch(/meets.*zoning|2:1 required|maximum allowed ADU: 500/i);
  await click('Queue GIS review');
  expect(JSON.parse(writes()[0][1].body).review.size_review).toEqual({primary_house_sqft:'1000.00',adu_sqft:'750.00'});
});

test('City cap guidance follows the chosen jurisdiction and does not approve a parcel', async () => {
  await render(); expect(field('Proposed ADU gross floor area (sq ft)')).toBeDefined();
  await change('Proposed ADU gross floor area (sq ft)','751');
  const guide=()=>host.querySelector('[aria-label="Jurisdiction size reference"]');
  expect(guide().textContent).toContain('Confirm the jurisdiction');
  await change('Property jurisdiction','albuquerque');
  expect(guide().textContent).toContain('Exceeds the general 750 sq ft cap');
  await change('Proposed ADU gross floor area (sq ft)','750');
  expect(guide().textContent).toContain('At or below the general 750 sq ft cap');
  expect(guide().textContent).toContain('650');
  expect(guide().textContent).toContain('not zoning approval');
  await change('Property jurisdiction','bernalillo_county');
  expect(guide().textContent).not.toContain('At or below');
  expect(guide().textContent).not.toContain('Exceeds');
});

test('legacy records keep unknown areas until the contractor explicitly reuses the job size', async () => {
  records[first.id]=record(); delete records[first.id].size_review;
  await render({project:{...first,sqft:750}});
  expect(field('Main house gross floor area (sq ft)').value).toBe('');
  expect(field('Proposed ADU gross floor area (sq ft)').value).toBe('');
  expect(writes()).toHaveLength(0);
  await click('Use job’s 750 sq ft for ADU');
  expect(field('Proposed ADU gross floor area (sq ft)').value).toBe('750.00');
  expect(field('Main house gross floor area (sq ft)').value).toBe('');
  expect(writes()).toHaveLength(0);
  await click('Save GIS review');
  expect(JSON.parse(writes()[0][1].body).review.size_review).toEqual({primary_house_sqft:'',adu_sqft:'750.00'});
});

test('a receipt with different sizes preserves the entered areas and exact retry', async () => {
  await render();
  await change('Main house gross floor area (sq ft)','1500'); await change('Proposed ADU gross floor area (sq ft)','750');
  saveOverride=async()=>({...response(first.id),review:record({version:nextVersion,size_review:{primary_house_sqft:'1500.00',adu_sqft:'650.00'}}),replayed:false});
  await click('Queue GIS review');
  expect(host.textContent).toContain('could not be verified');
  expect(field('Proposed ADU gross floor area (sq ft)').value).toBe('750');
  const original=writes()[0][1].body;
  saveOverride=null; await click('Queue GIS review');
  expect(writes()[1][1].body).toBe(original);
  expect(field('Proposed ADU gross floor area (sq ft)').value).toBe('750.00');
});

test('size-only drafts survive project switching, remain copyable when stale, and clear on restart', async () => {
  await render(); expect(field('Main house gross floor area (sq ft)')).toBeDefined();
  await change('Main house gross floor area (sq ft)','1500'); await change('Proposed ADU gross floor area (sq ft)','750');
  await render({project:second}); await render();
  expect(field('Main house gross floor area (sq ft)').value).toBe('1500');
  await render({project:{...first,address:'Different address'}});
  expect(field('Unsaved GIS findings').value).toContain('1500');
  await render({project:second});
  records[first.id]=record({address_snapshot:'Old address',size_review:{primary_house_sqft:'1800.00',adu_sqft:'750.00'}});
  staleProjects.add(first.id); await render();
  await click('Discard GIS edits and reload'); await click('Start review for updated address');
  expect(JSON.parse(writes()[0][1].body).review.size_review).toEqual(emptySize());
});

test.each(['0','-1','1e3','1000000.01','100.001'])('invalid floor area %s cannot be saved or calculated', async value => {
  await render(); expect(field('Main house gross floor area (sq ft)')).toBeDefined();
  await change('Main house gross floor area (sq ft)',value); await change('Proposed ADU gross floor area (sq ft)','750');
  expect(host.querySelector('[aria-label="House to ADU area ratio"]').textContent).toContain('Not measured');
  await click('Queue GIS review'); expect(writes()).toHaveLength(0);
  expect(host.textContent).toContain('Enter positive floor areas');
});

test('separate utility findings require evidence for confirmation and round-trip independently', async () => {
  await render();
  expect(field('Water status')).toBeDefined();
  await change('Water status','confirmed'); await click('Queue GIS review');
  expect(writes()).toHaveLength(0); expect(host.textContent).toContain('Water needs findings');
  await change('Water findings','  Builder checked service records on Sep 30; meter location recorded.  ');
  await change('Electric status','needs_work'); await change('Electric findings','Ask the electrician to assess panel capacity.');
  await click('Queue GIS review');
  expect(JSON.parse(writes()[0][1].body).review.utility_reviews).toEqual({
    water:{status:'confirmed',notes:'Builder checked service records on Sep 30; meter location recorded.'},
    electric:{status:'needs_work',notes:'Ask the electrician to assess panel capacity.'},
    sewer:{status:'unknown',notes:''},
  });
  expect(field('Water status').value).toBe('confirmed');
  expect(field('Sewer status').value).toBe('unknown');
  expect(button('Save GIS review').disabled).toBe(true);
});

test('utility-only drafts survive navigation and remain copyable when a new address makes the review stale', async () => {
  await render(); expect(field('Sewer findings')).toBeDefined();
  await change('Sewer findings','Locate the connection and check depth before deciding on a gravity route.');
  await change('Sewer status','in_review');
  await render({project:second}); await render();
  expect(field('Sewer findings').value).toContain('check depth');
  await render({project:{...first,address:'Changed site'}});
  const recovered=field('Unsaved GIS findings');
  expect(recovered?.value).toContain('Sewer');
  expect(recovered?.value).toContain('check depth');
  expect(recovered.disabled).toBe(false);
  expect(host.querySelector('[aria-label="Water, electric and sewer priorities"]').textContent).not.toContain('Confirmed');
});

test('stale restart clears utility findings and refuses a receipt that carries old confirmation forward', async () => {
  records[first.id]=record({address_snapshot:'Old property',utility_reviews:{...unknownUtilities(),water:{status:'confirmed',notes:'Previously confirmed for the old site.'}}});
  staleProjects.add(first.id);
  await render(); await click('Start review for updated address');
  expect(JSON.parse(writes()[0][1].body).review.utility_reviews).toEqual(unknownUtilities());
  expect(field('Water status')?.value).toBe('unknown');
  expect(field('Water findings')?.value).toBe('');
  await change('Water findings','Current property needs service review.');
  saveOverride=async()=>({...response(first.id),review:record({version:nextVersion,utility_reviews:{...unknownUtilities(),water:{status:'confirmed',notes:'Old data.'}}}),replayed:false});
  await click('Save GIS review');
  expect(host.textContent).toContain('could not be verified');
  expect(field('Water findings').value).toBe('Current property needs service review.');
});

test('explicit queue flushes saved intake, sends CAS metadata and accepts only the verified receipt', async () => {
  await render(); await click('Queue GIS review');
  expect(saveChanges).toHaveBeenCalledTimes(1);
  const [url, options] = writes()[0], body = JSON.parse(options.body);
  expect(url).toBe(endpoint(first.id));
  expect(body).toEqual({ request_id: expect.stringMatching(/^[\da-f-]{36}$/), expected_version: null, expected_address: first.address, review: empty() });
  expect(options.authSession.userId).toBe('test-staff');
  expect(host.textContent).toContain('GIS yard review queued for this address. No message was sent.');
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(button('Save GIS review').disabled).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

test('unknown dimensions stay unknown, while two valid measurements show an approximate rectangle', async () => {
  await render();
  const area = () => host.querySelector('[aria-label="Approximate measured rectangle"]');
  expect(area().textContent).toContain('Not measured');
  await change('Yard width (ft)', '25.5');
  expect(area().textContent).toContain('Not measured');
  await change('Yard depth (ft)', '40');
  expect(area().textContent).toContain('1,020 sq ft');
  expect(area().textContent).toContain('Not a buildable-area determination');
  await click('Queue GIS review');
  expect(JSON.parse(writes()[0][1].body).review).toMatchObject({ width_ft: '25.50', depth_ft: '40.00' });
  await change('Yard depth (ft)', '');
  expect(area().textContent).toContain('Not measured');
});

test.each(['0', '-1', '1e3', '10000.01', '1.001'])('invalid yard measurement %s is rejected before any write', async value => {
  await render(); await change('Yard width (ft)', value); await click('Queue GIS review');
  expect(host.textContent).toContain('Enter positive measurements');
  expect(writes()).toHaveLength(0); expect(saveChanges).not.toHaveBeenCalled();
});

test('reviewed requires a matched parcel and substantive notes, but unknown dimensions are allowed', async () => {
  await render(); await change('Review status', 'reviewed'); await click('Queue GIS review');
  expect(writes()).toHaveLength(0);
  expect(host.textContent).toContain('Match the address and parcel');
  await check('Address and parcel matched', true); await change('Findings and site-visit checks', 'ok'); await click('Queue GIS review');
  expect(writes()).toHaveLength(0);
  await change('Findings and site-visit checks', '  Parcel matched; field measurements remain unknown.  '); await click('Queue GIS review');
  expect(JSON.parse(writes()[0][1].body).review).toMatchObject({ status: 'reviewed', notes: 'Parcel matched; field measurements remain unknown.', width_ft: '', depth_ft: '', checks: { parcel: true } });
  expect(host.textContent).toContain('not site or permit approval');
});

test('a changed intake address hides the old editor and requires saving and refreshing before another review', async () => {
  records[first.id] = record({ status: 'in_review', notes: 'Saved old address findings.' });
  await render(); await change('Findings and site-visit checks', 'My unsaved findings.');
  const updated = { ...first, address: '999 New Fixture Road' };
  await render({ project: updated });
  expect(host.textContent).toContain('Address needs a fresh review');
  expect(button('Save GIS review')).toBeUndefined();
  expect(button('Start review for updated address')).toBeUndefined();
  expect(writes()).toHaveLength(0);
  expect(new URL(host.querySelector('a[href*="webappviewer"]').href).searchParams.get('find')).toBe(updated.address);
});

test('an address change keeps unsaved GIS findings visible and selectable for recovery', async () => {
  records[first.id] = record({ notes: 'Previously saved findings.' });
  await render(); await change('Findings and site-visit checks', 'Keep my unsaved utility observations.');
  await render({ project: { ...first, address: '999 Changed Fixture Street' } });
  const recovered = host.querySelector('textarea[aria-label="Unsaved GIS findings"]') || field('Unsaved GIS findings');
  expect(recovered).toBeDefined(); expect(recovered).not.toBeNull();
  expect(recovered.value).toBe('Keep my unsaved utility observations.');
  expect(recovered.readOnly).toBe(true); expect(recovered.disabled).toBe(false);
  recovered.focus(); recovered.select();
  expect(document.activeElement).toBe(recovered); expect(recovered.selectionEnd).toBe(recovered.value.length);
  expect(writes()).toHaveLength(0);
});

test('a stale review discovered after navigation preserves the cached findings in the recovery field', async () => {
  records[first.id] = record();
  await render(); await change('Findings and site-visit checks', 'Copy these first-project observations before restarting.');
  await render({ project: second });
  projects[first.id] = { ...first, address: 'New address saved while away' };
  records[first.id] = record({ version: nextVersion, notes: 'Prior saved findings.' });
  staleProjects.add(first.id);
  await render({ project: projects[first.id] });
  const recovered = host.querySelector('textarea[aria-label="Unsaved GIS findings"]') || field('Unsaved GIS findings');
  expect(recovered?.value).toBe('Copy these first-project observations before restarting.');
  expect(recovered.readOnly).toBe(true); expect(recovered.disabled).toBe(false);
  expect(host.textContent).toContain('The saved review or intake address changed.');
  expect(button('Start review for updated address').disabled).toBe(true);
  expect(writes()).toHaveLength(0);
});

test('an address changed during intake flushing stops the GIS write and keeps the draft', async () => {
  await render(); await change('Findings and site-visit checks', 'Keep these observations.');
  saveChanges.mockResolvedValue({ projects: [{ ...first, address: 'Different saved site' }] });
  await click('Queue GIS review');
  expect(writes()).toHaveLength(0); expect(onSaved).not.toHaveBeenCalled();
  expect(host.textContent).toContain('The intake address changed.');
  expect(field('Findings and site-visit checks').value).toBe('Keep these observations.');
});

test('stale reviews remain reference-only and restart with an empty queued record for the current address', async () => {
  records[first.id] = record({ status: 'reviewed', address_snapshot: 'Former fixture site', notes: 'Old site findings.', parcel_id: 'old-parcel', width_ft: '20.00', depth_ft: '30.00', jurisdiction: 'albuquerque', checks: { ...empty().checks, parcel: true } });
  staleProjects.add(first.id); await render();
  expect(field('Review status')).toBeUndefined();
  expect(host.textContent).toContain('Old site findings.');
  expect(host.textContent).toContain('Changing an address back does not reactivate an old review.');
  await click('Start review for updated address');
  expect(JSON.parse(writes()[0][1].body)).toMatchObject({ expected_version: version, expected_address: first.address, review: empty() });
  expect(field('Findings and site-visit checks').value).toBe('');
  expect(host.textContent).not.toContain('Address needs a fresh review');
});

test('uncertain saves reuse the exact request across retries and changing notes creates a new intent', async () => {
  saveOverride = async () => { throw new Error('Connection interrupted'); };
  await render(); await change('Findings and site-visit checks', 'Keep the first observation.'); await click('Queue GIS review');
  const original = writes()[0][1].body;
  expect(field('Findings and site-visit checks').value).toBe('Keep the first observation.');
  await click('Queue GIS review'); expect(writes()[1][1].body).toBe(original);
  await change('Findings and site-visit checks', 'A different observation.'); await click('Queue GIS review');
  expect(JSON.parse(writes()[2][1].body).request_id).not.toBe(JSON.parse(original).request_id);
  expect(onSaved).not.toHaveBeenCalled();
});

test('project navigation preserves separate drafts and the exact uncertain save attempt', async () => {
  saveOverride = async () => { throw new Error('Receipt unavailable'); };
  await render(); await change('Findings and site-visit checks', 'First project findings.'); await click('Queue GIS review');
  const original = writes()[0][1].body;
  await render({ project: second }); expect(field('Findings and site-visit checks').value).toBe('');
  await change('Findings and site-visit checks', 'Second project findings.');
  await render(); expect(field('Findings and site-visit checks').value).toBe('First project findings.');
  saveOverride = null; await click('Queue GIS review');
  expect(writes()[1][1].body).toBe(original);
  await render({ project: second }); expect(field('Findings and site-visit checks').value).toBe('Second project findings.');
  expect(writes()).toHaveLength(2);
});

test('409 conflicts preserve typed findings and block saves until explicit discard and reload', async () => {
  records[first.id] = record();
  saveOverride = async () => { throw Object.assign(new Error('The GIS review changed. Reload it.'), { status: 409 }); };
  await render(); await change('Findings and site-visit checks', 'Keep my local findings.'); await click('Save GIS review');
  expect(field('Findings and site-visit checks').value).toBe('Keep my local findings.');
  expect(button('Save GIS review').disabled).toBe(true); expect(host.querySelector('fieldset').disabled).toBe(true);
  const recovered = field('Unsaved GIS findings');
  expect(recovered.value).toBe('Keep my local findings.');
  expect(recovered.readOnly).toBe(true); expect(recovered.closest('fieldset')).toBeNull();
  recovered.focus(); recovered.select();
  expect(document.activeElement).toBe(recovered); expect(recovered.selectionEnd).toBe(recovered.value.length);
  records[first.id] = record({ version: nextVersion, notes: 'Other staff findings.' });
  await click('Discard GIS edits and reload');
  expect(field('Findings and site-visit checks').value).toBe('Other staff findings.');
  expect(host.querySelector('fieldset').disabled).toBe(false);
  expect(writes()).toHaveLength(1); expect(onSaved).not.toHaveBeenCalled();
});

test('refresh locks synchronously against duplicate refresh/save and a failed intake flush preserves findings', async () => {
  records[first.id] = record();
  await render(); await change('Findings and site-visit checks', 'Keep my notes if the intake save fails.');
  const pending = deferred(); saveChanges.mockImplementation(() => pending.promise);
  const reload = button('Discard GIS edits and reload'), save = button('Save GIS review');
  await act(async () => { reload.click(); reload.click(); save.click(); });
  expect(saveChanges).toHaveBeenCalledTimes(1); expect(writes()).toHaveLength(0);
  expect(host.querySelector('fieldset').disabled).toBe(true);
  expect(reload.disabled).toBe(true); expect(save.disabled).toBe(true);
  expect(field('Findings and site-visit checks').value).toBe('Keep my notes if the intake save fails.');
  await act(async () => pending.reject(new Error('Intake save unavailable')));
  expect(host.textContent).toContain('Intake save unavailable');
  expect(field('Findings and site-visit checks').value).toBe('Keep my notes if the intake save fails.');
  expect(host.querySelector('fieldset').disabled).toBe(false);
  expect(button('Save GIS review').disabled).toBe(false);
  expect(requestJson).toHaveBeenCalledTimes(1);
  await render({ project: second }); await render();
  expect(field('Findings and site-visit checks').value).toBe('Keep my notes if the intake save fails.');
});

test.each(['wrong project', 'wrong form', 'same version', 'missing replay flag'])('an invalid receipt (%s) preserves the form and exact retry', async kind => {
  records[first.id] = record();
  saveOverride = async (_url, options) => {
    const body = JSON.parse(options.body);
    const result = { ...response(first.id), review: record({ ...body.review, version: nextVersion }), replayed: false };
    if (kind === 'wrong project') result.review.project_id = second.id;
    if (kind === 'wrong form') result.review.notes = 'Unexpected findings.';
    if (kind === 'same version') result.review.version = version;
    if (kind === 'missing replay flag') delete result.replayed;
    return result;
  };
  await render(); await change('Findings and site-visit checks', 'My exact observations.'); await click('Save GIS review');
  expect(host.textContent).toContain('could not be verified');
  expect(field('Findings and site-visit checks').value).toBe('My exact observations.');
  expect(onSaved).not.toHaveBeenCalled();
  await click('Save GIS review'); expect(writes()[1][1].body).toBe(writes()[0][1].body);
});

test('an exact retry returning a later stale record never claims the submitted findings were saved', async () => {
  saveOverride = async () => ({ project: first, review: record({ version: nextVersion, notes: 'Later saved findings.', address_snapshot: 'Old saved address' }), stale: true, replayed: true });
  await render(); await change('Findings and site-visit checks', 'My earlier findings.'); await click('Queue GIS review');
  expect(host.textContent).toContain('A later address change requires another review.');
  expect(host.textContent).toContain('Later saved findings.');
  expect(host.textContent).not.toContain('GIS review notes saved.');
  expect(button('Start review for updated address')).toBeDefined();
});

test('late loads cannot display a previous project’s private findings', async () => {
  const pending = deferred();
  loadOverride = url => url === endpoint(first.id) ? pending.promise : response(second.id);
  await render(); const signal = requestJson.mock.calls[0][1].signal;
  await render({ project: second }); expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ project: first, review: record({ notes: 'Private first-site findings.' }), stale: false }));
  expect(host.textContent).not.toContain('Private first-site findings.');
  expect(field('Findings and site-visit checks').value).toBe('');
});

test('late save receipts cannot clear the new project’s draft or report success', async () => {
  const pending = deferred(); saveOverride = () => pending.promise;
  await render(); await change('Findings and site-visit checks', 'Pending first-site findings.'); await click('Queue GIS review');
  const options = writes()[0][1], body = JSON.parse(options.body);
  await render({ project: second }); await change('Findings and site-visit checks', 'Keep second-site findings.');
  expect(options.signal.aborted).toBe(true);
  await act(async () => pending.resolve({ project: first, review: record(body.review), stale: false, replayed: false }));
  expect(field('Findings and site-visit checks').value).toBe('Keep second-site findings.');
  expect(onSaved).not.toHaveBeenCalled();
});

test('a changed staff session hides private review content, ignores late receipts and clears retained drafts', async () => {
  const pending = deferred(); saveOverride = () => pending.promise;
  await render(); await change('Findings and site-visit checks', 'Private old-user findings.'); await click('Queue GIS review');
  const body = JSON.parse(writes()[0][1].body);
  await act(async () => setAuthSession({ userId: 'other-staff', sessionId: 'other-session', getToken: async () => 'other-token' }));
  expect(host.textContent).toBe('');
  await act(async () => pending.resolve({ project: first, review: record(body.review), stale: false, replayed: false }));
  expect(host.textContent).toBe(''); expect(onSaved).not.toHaveBeenCalled();
  await act(async () => root.render(<div>Session boundary</div>));
  saveOverride = null; await render();
  expect(field('Findings and site-visit checks').value).toBe('');
  expect(host.textContent).not.toContain('Private old-user findings.');
});
