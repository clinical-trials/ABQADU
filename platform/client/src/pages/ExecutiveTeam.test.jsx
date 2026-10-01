import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ExecutiveTeam from './ExecutiveTeam';
import { requestJson } from '../utils/api';
import { setAuthSession } from '../utils/authFetch';

jest.mock('../utils/api',()=>({requestJson:jest.fn()}));
jest.mock('../components/CfoCashScenario',()=>()=> <section id="cash-scenario">Cash scenario calculator</section>);
jest.mock('../components/PreconstructionScorecard',()=>({onSaved})=> <section id="preconstruction-cycle"><button onClick={onSaved}>Record cycle milestone</button></section>);
const fixture = {
  generated_at:'2026-09-30T18:00:00.000Z',as_of:'2026-09-30',currency:'USD',
  sources:{jobs:{status:'available',message:'Saved estimates',updated_at:null},ledger:{status:'available',message:'Invoice ledger'}},
  cash:{status:'unknown',message:'Bank balance is not connected.'},
  ledger:{status:'available',invoice_count:2,issued_count:1,draft_count:1,issued_balance_cents:120050,overdue_balance_cents:120050,draft_total_cents:500000,recorded_payments_cents:45000,known_test_payments_cents:0,needs_review_count:0,due_date_missing_count:0,
    overdue_invoices:[{id:1,number:'INV-1',client:'Recorded client',due_date:'2026-09-01',balance_cents:120050,days_overdue:29}],aging:[{id:'late',label:'1–30 days',balance_cents:120050,count:1}],message:'Ledger payments do not establish bank cash.'},
  jobs:{status:'available',count:1,priced_count:1,bid_total_cents:20000000,profit_low_cents:4000000,profit_high_cents:6000000,items:[{id:'one',name:'Saved job',status:'estimated',bid_total_cents:20000000,cogs_low_cents:14000000,cogs_high_cents:16000000,profit_low_cents:4000000,profit_high_cents:6000000,margin_low_pct:20,draft_count:0,issues:[]}],message:'Estimates before overhead and tax.'},
  decisions:[{id:'collect',priority:'high',title:'Review the overdue invoice',detail:'Confirm the recorded balance.',href:'/invoices'}],
  data_gaps:[{id:'bank',title:'Confirm available bank cash',detail:'No bank balance is recorded.',href:'/executive#cash-scenario'}],
  narration:'Company briefing. Review the overdue invoice. Bank cash is unknown.'
};
let host,root;
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;
 requestJson.mockReset().mockResolvedValue(fixture);
 window.speechSynthesis={speak:jest.fn(),cancel:jest.fn(),pause:jest.fn(),resume:jest.fn()};window.SpeechSynthesisUtterance=function(text){this.text=text;};
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();});
const render=()=>act(async()=>root.render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><ExecutiveTeam/></MemoryRouter>));
const button=label=>[...host.querySelectorAll('button')].find(el=>el.textContent===label);

test('presents recorded receivables separately from unknown cash and estimated profit',async()=>{
 await render();expect(requestJson.mock.calls[0][0]).toBe('/api/executive/cfo/briefing');
 expect(host.textContent).toContain('$1,200.50');expect(host.textContent).toContain('Bank balance is not connected.');
 expect(host.textContent).toContain('Estimated gross profit');expect(host.textContent).toContain('Estimates before overhead and tax.');
 expect(host.textContent).toContain('INV-1');expect(host.querySelector('a[href="/invoices"]')).not.toBeNull();
 expect(host.querySelector('#cash-scenario')).not.toBeNull();expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
});
test('recording a preconstruction milestone refreshes the CFO briefing',async()=>{
 await render();
 expect(host.querySelector('#preconstruction-cycle')).not.toBeNull();
 await act(async()=>button('Record cycle milestone').click());
 expect(requestJson).toHaveBeenCalledTimes(2);
 expect(requestJson.mock.calls[1][0]).toBe('/api/executive/cfo/briefing');
});
test('an unavailable ledger shows unknown amounts while available job estimates still appear',async()=>{
 requestJson.mockResolvedValue({...fixture,sources:{...fixture.sources,ledger:{status:'unavailable',message:'Invoice data is unavailable.'}},ledger:{...fixture.ledger,status:'unavailable',invoice_count:null,issued_count:null,draft_count:null,needs_review_count:null,due_date_missing_count:null,issued_balance_cents:null,overdue_balance_cents:null,recorded_payments_cents:null,draft_total_cents:null,known_test_payments_cents:null,overdue_invoices:[],aging:[],message:'Invoice data is unavailable.'}});
 await render();expect(host.textContent).toContain('Invoice data is unavailable.');expect(host.textContent).toContain('Saved job');
 expect(host.textContent).not.toContain('$0.00');expect(host.textContent).not.toContain('No overdue invoices');
});
test('a failed refresh removes old amounts and cancels spoken financial guidance',async()=>{
 await render();await act(async()=>button('Listen to briefing').click());expect(window.speechSynthesis.speak).toHaveBeenCalled();
 const before=window.speechSynthesis.cancel.mock.calls.length;requestJson.mockRejectedValue(new Error('Could not reach the finance report'));
 await act(async()=>button('Refresh financial review').click());
 expect(host.textContent).toContain('Could not reach the finance report');expect(host.textContent).not.toContain('$1,200.50');
 expect(window.speechSynthesis.cancel.mock.calls.length).toBeGreaterThan(before);expect(host.querySelector('#cash-scenario')).not.toBeNull();
});
test.each([
 {...fixture,currency:'EUR'},
 {...fixture,ledger:{...fixture.ledger,issued_balance_cents:'120050'}},
 {...fixture,decisions:[{...fixture.decisions[0],href:'https://untrusted.example'}]},
 {...fixture,jobs:{...fixture.jobs,items:[{...fixture.jobs.items[0],profit_low_cents:NaN}]}},
 {...fixture,ledger:{...fixture.ledger,status:'unavailable'}},
 {...fixture,sources:{...fixture.sources,ledger:{status:'unavailable',message:'Offline'}},ledger:{...fixture.ledger,status:'unavailable'}},
 {...fixture,ledger:{...fixture.ledger,issued_balance_cents:-100}},
 {...fixture,as_of:'2026-09-31'},
 {...fixture,as_of:'2026-10-01'},
 {...fixture,sources:{...fixture.sources,jobs:{status:'unavailable',message:'Offline'}},jobs:{...fixture.jobs,status:'unavailable'}},
])('an incomplete or mismatched report cannot display financial guidance',async payload=>{
 requestJson.mockResolvedValue(payload);await render();expect(host.textContent).toContain('could not be verified');
 expect(host.textContent).not.toContain('INV-1');expect(button('Listen to briefing')).toBeUndefined();
});
test('test-payment review remains visible and other executive roles open existing tools',async()=>{
 requestJson.mockResolvedValue({...fixture,ledger:{...fixture.ledger,known_test_payments_cents:10000,needs_review_count:1}});
 await render();expect(host.textContent).toContain('Known test payments');expect(host.textContent).toContain('$100.00');
 expect(host.querySelector('a[href="/command-center#project-helper"]')).not.toBeNull();expect(host.querySelector('a[href="/bids"]')).not.toBeNull();
});
test('unmount aborts the report request and late completion has no effect',async()=>{
 let finish;requestJson.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await render();
 const signal=requestJson.mock.calls[0][1].signal;await act(async()=>root.render(<div>Closed</div>));
 await act(async()=>finish(fixture));expect(signal.aborted).toBe(true);expect(host.textContent).toBe('Closed');
});
test('a changed staff session hides the financial report and stops its audio',async()=>{
 await render();await act(async()=>button('Listen to briefing').click());
 const before=window.speechSynthesis.cancel.mock.calls.length;
 await act(async()=>setAuthSession({userId:'different-staff',sessionId:'new-session',getToken:async()=> 'new-token'}));
 expect(host.textContent).toBe('');expect(window.speechSynthesis.cancel.mock.calls.length).toBeGreaterThan(before);
 expect(requestJson).toHaveBeenCalledTimes(1);
});
