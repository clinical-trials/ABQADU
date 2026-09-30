import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import Preconstruction from './Preconstruction';
import { requestJson, requestPdfBlob } from '../utils/api';
import { setAuthSession } from '../utils/authFetch';

jest.mock('../utils/api', () => ({ requestJson:jest.fn(),requestPdfBlob:jest.fn() }));
const base = '/api/preconstruction';
const version1 = '11111111-1111-4111-8111-111111111111', version2 = '22222222-2222-4222-8222-222222222222';
const project = {id:'first',client:'First homeowner',address:'Example site',model:'Altura'};
const defaults = {
  contractor_name:'',contractor_address:'',contractor_phone:'',contractor_email:'',license_number:'',license_classification:'',
  owner_name:'First homeowner',owner_email:'',owner_phone:'',property_address:'Example site',project_description:'Proposed ADU',
  fee:'10000.00',construction_estimate:'185000.00',fee_credit:'unconfirmed',tax_treatment:'unconfirmed',tax_amount:'',
  scope:'Proposed site review and concept planning.',exclusions:'Construction is excluded.',schedule:'',payment_terms:'',termination_terms:'',estimate_assumptions:'Subject to site review.',third_party_costs:'',notice_review:'unconfirmed',notice_details:'',
};
const record = (terms = defaults, version = version1, revision = 1, id = 'first') => ({
  id:'agreement-first',project_id:id,version,revision,saved_at:'2026-09-30T18:00:00.000Z',terms:{...terms},
  totals:{currency:'USD',fee_cents:Math.round(Number(terms.fee)*100),construction_estimate_cents:terms.construction_estimate ? Math.round(Number(terms.construction_estimate)*100) : null,tax_cents:terms.tax_treatment==='unconfirmed' || !terms.tax_amount ? null : Math.round(Number(terms.tax_amount)*100),
    invoice_total_cents:terms.tax_treatment==='included' ? Math.round(Number(terms.fee)*100) : terms.tax_treatment==='additional' && terms.tax_amount ? Math.round((Number(terms.fee)+Number(terms.tax_amount))*100) : null},
  review_items:['Confirm the contractor legal name and license.','Final business and legal review is required.'],
});
let host, root, saved, history, popup, saveOverride, loadOverride, originalUuid;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saved = null; history = []; saveOverride = null; loadOverride = null;
  requestJson.mockReset().mockImplementation(async (url, options = {}) => {
    if (url === base) return {projects:[project,{id:'second',client:'Second homeowner',address:'Second site',model:'Altura'}]};
    if (options.method === 'PUT') {
      if (saveOverride) return saveOverride(url,options);
      const body = JSON.parse(options.body);
      saved = record(body.terms,version2,(saved?.revision || 0)+1);
      return {agreement:saved,replayed:false};
    }
    if (loadOverride) return loadOverride(url,options);
    return {project,defaults:{...defaults},agreement:saved,history};
  });
  requestPdfBlob.mockReset().mockResolvedValue(new Blob(['%PDF-1.7 example'],{type:'application/pdf'}));
  popup = {opener:window,closed:false,document:document.implementation.createHTMLDocument(),location:{replace:jest.fn()},close:jest.fn()};
  jest.spyOn(window,'open').mockReturnValue(popup);
  URL.createObjectURL = jest.fn(() => 'blob:preconstruction');
  URL.revokeObjectURL = jest.fn();
  originalUuid = Object.getOwnPropertyDescriptor(global,'crypto');
  Object.defineProperty(global,'crypto',{configurable:true,value:{randomUUID:jest.fn(() => '33333333-3333-4333-8333-333333333333')}});
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks();
  if (originalUuid) Object.defineProperty(global,'crypto',originalUuid); else delete global.crypto;
});
const mount = (path = '/preconstruction?project=first') => act(async () => root.render(<MemoryRouter initialEntries={[path]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Preconstruction/></MemoryRouter>));
const button = label => [...host.querySelectorAll('button')].find(item => item.textContent === label);
const change = (name,value) => act(async () => Simulate.change(host.querySelector(`#precon-${name}`),{target:{value}}));
const click = label => act(async () => button(label).click());
const save = () => act(async () => Simulate.submit(host.querySelector('form')));

test('requires choosing a saved job and never creates a draft just by opening the tool',async () => {
  await mount('/preconstruction');
  expect(requestJson).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('Choose the job.');
  await change('job','first');
  expect(host.querySelector('#precon-owner_name').value).toBe('First homeowner');
  expect(button('Open draft PDF').disabled).toBe(true);
  expect(requestJson.mock.calls.some(([,options]) => options?.method === 'PUT')).toBe(false);
  expect(requestPdfBlob).not.toHaveBeenCalled();
});
test('unconfirmed tax remains unknown and the construction estimate is separate from the draft invoice',async () => {
  await mount();
  const summary = host.querySelector('[aria-label="Packet summary"]');
  expect(summary.textContent).toContain('$10,000.00');
  expect(summary.textContent).toContain('$185,000.00');
  expect(summary.querySelector('.precon-total').textContent).toContain('To be confirmed');
  expect(host.textContent).toContain('Draft · no payment due');
  expect(host.querySelector('#precon-contractor_name').value).toBe('');
});
test('saves a versioned draft with an exact decimal fee and never calls the invoice ledger',async () => {
  await mount(); await change('fee','10000.12'); await change('scope',' Confirmed services ');
  await save();
  const [url,options] = requestJson.mock.calls.find(([,options]) => options?.method === 'PUT');
  expect(url).toBe(`${base}/projects/first`);
  expect(JSON.parse(options.body)).toMatchObject({expected_version:null,request_id:expect.any(String),terms:{fee:'10000.12',scope:'Confirmed services'}});
  expect(button('Open draft PDF').disabled).toBe(false);
  expect(host.textContent).toContain('Draft revision 1 saved');
  expect(requestJson.mock.calls.every(([url]) => url.startsWith(base))).toBe(true);
  expect(requestPdfBlob).not.toHaveBeenCalled();
});
test('included tax does not add tax twice; additional tax is kept out of the construction estimate',async () => {
  await mount(); await change('fee','10000.12'); await change('tax_treatment','included');
  expect(host.querySelector('.precon-total').textContent).toContain('$10,000.12');
  expect(host.textContent).toContain('Not itemized');
  await change('tax_amount','725.13'); await change('tax_treatment','additional');
  expect(host.querySelector('.precon-total').textContent).toContain('$10,725.25');
  expect(host.querySelector('.precon-estimate').textContent).toContain('$185,000.00');
  await save(); expect(button('Open draft PDF').disabled).toBe(false);
});
test('switching back to unconfirmed tax hides a retained tax amount and keeps the saved draft readable',async () => {
  await mount(); await change('tax_treatment','additional'); await change('tax_amount','500');
  await change('tax_treatment','unconfirmed'); await save();
  expect(saved.terms.tax_amount).toBe('500'); expect(saved.totals.tax_cents).toBeNull();
  expect(host.querySelector('.precon-total').textContent).toContain('To be confirmed');
  expect(button('Open draft PDF').disabled).toBe(false);
});
test.each(['1e4','-5','10000.001','100000000.01','0'])('rejects an invalid fee %s before any save',async value => {
  await mount(); await change('fee',value); await save();
  expect(requestJson.mock.calls.some(([,options]) => options?.method === 'PUT')).toBe(false);
  expect(host.textContent).toContain('Use valid dollar amounts');
});
test('a lost save response retries the same immutable request instead of creating a second revision',async () => {
  let attempts = 0;
  saveOverride = async (_,options) => { if (++attempts === 1) throw new Error('Connection lost'); return {agreement:record(JSON.parse(options.body).terms),replayed:true}; };
  await mount(); await change('scope','Only these services'); await save();
  expect(host.textContent).toContain('Connection lost'); expect(host.querySelector('#precon-scope').value).toBe('Only these services');
  await save();
  const writes = requestJson.mock.calls.filter(([,options]) => options?.method === 'PUT');
  expect(writes[0][1].body).toBe(writes[1][1].body);
  expect(button('Open draft PDF').disabled).toBe(false);
});
test('conflicting saves preserve typed terms and require explicit reload before another save or print',async () => {
  saved = record(); history = [{version:version1,revision:1,saved_at:saved.saved_at}];
  saveOverride = () => { throw Object.assign(new Error('This agreement changed. Reload first.'),{status:409}); };
  await mount(); await change('scope','Keep my unsaved scope'); await save();
  expect(host.querySelector('#precon-scope').value).toBe('Keep my unsaved scope');
  expect(button('Save draft').disabled).toBe(true); expect(button('Open draft PDF').disabled).toBe(true);
  saved = record({...defaults,scope:'Other staff revision'},version2,2);
  await click('Discard edits and reload saved version');
  expect(host.querySelector('#precon-scope').value).toBe('Other staff revision');
  expect(button('Open draft PDF').disabled).toBe(false);
});
test('a save acknowledgement returning another project cannot unlock printing',async () => {
  saveOverride = () => ({agreement:record(defaults,version1,1,'second'),replayed:false});
  await mount(); await save();
  expect(host.textContent).toContain('version could not be verified');
  expect(button('Open draft PDF').disabled).toBe(true);
});
test('a corrupted saved amount cannot be displayed as a verified packet',async () => {
  saved = record({...defaults,tax_treatment:'included'}); saved.totals.invoice_total_cents = 10;
  await mount(); expect(host.textContent).toContain('amounts could not be verified');
  expect(button('Open draft PDF')).toBeUndefined();
});
test('opens a tab within the click gesture and fetches only the saved version with authenticated transport',async () => {
  saved = record(); let finish;
  requestPdfBlob.mockImplementation(() => new Promise(resolve => {finish=resolve;}));
  await mount(); await click('Open draft PDF');
  expect(window.open).toHaveBeenCalledWith('about:blank','_blank'); expect(popup.opener).toBeNull();
  expect(requestPdfBlob).toHaveBeenCalledWith(`${base}/projects/first/versions/${version1}/packet.pdf`,expect.objectContaining({authSession:expect.objectContaining({userId:'test-staff'}),signal:expect.any(AbortSignal)}));
  expect(popup.location.replace).not.toHaveBeenCalled();
  await act(async () => finish(new Blob(['%PDF-1.7'],{type:'application/pdf'})));
  expect(popup.location.replace).toHaveBeenCalledWith('blob:preconstruction');
});
test('blocked popups provide open and download links for the same saved PDF',async () => {
  saved = record(); window.open.mockReturnValue(null); await mount(); await click('Open draft PDF');
  expect(host.textContent).toContain('PDF tab was blocked or closed');
  expect(host.querySelector('a[download]').getAttribute('download')).toBe('ABQ-ADU-preconstruction-first-r1.pdf');
});
test('PDF failure closes the reserved tab and lets the contractor retry',async () => {
  saved = record(); requestPdfBlob.mockRejectedValue(new Error('PDF service unavailable'));
  await mount(); await click('Open draft PDF');
  expect(popup.close).toHaveBeenCalled(); expect(host.textContent).toContain('PDF service unavailable');
  expect(button('Open draft PDF').disabled).toBe(false);
});
test('editing after printing revokes the old PDF and requires saving before another print',async () => {
  saved = record(); await mount(); await click('Open draft PDF'); await change('fee','12000');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preconstruction'); expect(popup.close).toHaveBeenCalled();
  expect(button('Open draft PDF').disabled).toBe(true); expect(host.querySelector('a[download]')).toBeNull();
  expect(host.querySelector('#precon-job').disabled).toBe(true);
});
test('saved history prints its exact earlier revision',async () => {
  saved = record(defaults,version2,2);
  history = [{version:version2,revision:2,saved_at:saved.saved_at},{version:version1,revision:1,saved_at:saved.saved_at}];
  await mount(); await act(async () => host.querySelector('[aria-label="Open PDF for revision 1"]').click());
  expect(requestPdfBlob.mock.calls[0][0]).toContain(`/versions/${version1}/packet.pdf`);
});
test('switching to another saved job releases the prior project PDF',async () => {
  saved = record(); await mount(); await click('Open draft PDF');
  loadOverride = () => ({project:{...project,id:'second',client:'Second homeowner'},defaults:{...defaults,owner_name:'Second homeowner'},agreement:null,history:[]});
  await change('job','second');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preconstruction'); expect(popup.close).toHaveBeenCalled();
  expect(host.querySelector('#precon-owner_name').value).toBe('Second homeowner'); expect(button('Open draft PDF').disabled).toBe(true);
});
test('changing the staff session hides all private terms and ignores late PDF responses',async () => {
  saved = record(); let finish;
  requestPdfBlob.mockImplementation(() => new Promise(resolve => {finish=resolve;}));
  await mount(); await click('Open draft PDF');
  const signal = requestPdfBlob.mock.calls[0][1].signal;
  await act(async () => setAuthSession({userId:'other-staff',sessionId:'another-session',getToken:async () => 'new-token'}));
  await act(async () => finish(new Blob(['%PDF-late'])));
  expect(signal.aborted).toBe(true); expect(host.textContent).toBe(''); expect(popup.close).toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test('unsaved edits survive internal navigation for the current session',async () => {
  await mount(); await change('scope','Keep this draft in this tab');
  await act(async () => root.render(<div>Another workspace page</div>));
  await mount(); expect(host.querySelector('#precon-scope').value).toBe('Keep this draft in this tab');
  expect(host.textContent).toContain('unsaved draft was restored');
});
test('restoring an unsaved draft detects a newer server revision without overwriting it',async () => {
  saved = record(); await mount(); await change('scope','Keep local wording');
  await act(async () => root.render(<div>Another workspace page</div>));
  saved = record({...defaults,scope:'Newer server wording'},version2,2);
  await mount(); expect(host.querySelector('#precon-scope').value).toBe('Keep local wording');
  expect(host.textContent).toContain('newer draft was saved'); expect(button('Save draft').disabled).toBe(true);
  await click('Discard edits and reload saved version');
  expect(host.querySelector('#precon-scope').value).toBe('Newer server wording');
  await act(async () => root.render(<div>Another workspace page</div>));
  await mount(); expect(host.querySelector('#precon-scope').value).toBe('Newer server wording');
});
