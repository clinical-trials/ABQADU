// Layout-only review: fictional API responses, no real sign-in, no provider calls or writes.
const fs=require('fs'), path=require('path'), vm=require('vm');
const root=path.resolve(__dirname,'..');
const output=process.env.MOBILE_REVIEW_OUTPUT || fs.mkdtempSync(path.join(require('os').tmpdir(),'abqadu-mobile-review-'));
fs.mkdirSync(output,{recursive:true});
const express=require(root+'/platform/server/node_modules/express');
const puppeteer=require(root+'/platform/server/node_modules/puppeteer');
const state=require(root+'/platform/server/src/services/commandCenterStore').starterState();
state.projects=[{...state.projects[0],id:'review-job',client:'Review homeowner',address:'100 Example Lane',client_phone:'5055550123',client_email:'review@example.com'}];
state.office_tasks=[{id:'review-task',project_id:'review-job',kind:'estimate',due_date:'2026-11-18',message:'Please review your estimate and let us know if you have any questions.',status:'open',history:[]}];
const client={id:1,name:'Review homeowner with a long name',email:'homeowner@example.com',phone:'5055550123',address:'100 Example Lane',status:'lead'};
const project={id:1,name:'Review ADU project',health:'on_schedule',project_start:'2026-11-01',planned_finish:'2027-03-01',total_activities:1,pct_complete:10};
const bid={id:1,title:'Review estimate',status:'draft',bid_number:'REVIEW',markup_pct:60,tax_rate:0,items:[{id:1,category:'General',description:'Sample construction work',qty:1,unit:'ea',unit_cost:100}]};
const invoice={id:1,invoice_number:'REVIEW-1',client_name:client.name,amount:10000,paid:1000,balance:9000,status:'sent'};
const activity={id:1,name:'Review foundation work',activity_code:'A100',planned_start:'2026-11-18',planned_finish:'2026-11-24',duration:5,pct_complete:10,is_critical:true,wbs_name:'Site work'};
const cfoText=fs.readFileSync(root+'/platform/client/src/pages/ExecutiveTeam.test.jsx','utf8').split('const fixture = ')[1].split('\nlet host,root;')[0];
const cfo=vm.runInNewContext('('+cfoText.replace(/;\s*$/,'')+')');
const reportText=fs.readFileSync(root+'/platform/client/src/components/ProjectHelper.test.jsx','utf8').split('const report = ')[1].split('\nbeforeEach')[0];
const report=vm.runInNewContext('('+reportText.replace(/;\s*$/,'')+')');report.project={id:'review-job',name:'Review homeowner'};
const ownerText=fs.readFileSync(root+'/platform/client/src/components/OwnerGoals.test.jsx','utf8').split('function fixture() {')[1].split('\nconst reply')[0];
const owner=vm.runInNewContext('(function(){'+ownerText+')()');
let authMode='local'; const unknown=new Set();
function api(url){const p=url.pathname;
 if(p==='/api/auth/config')return {mode:authMode,configured:true};
 if(p==='/api/auth/local-session')return {token:'x'.repeat(43),userId:'local-owner',sessionId:'review'};
 if(p==='/api/auth/session')return {userId:'local-owner'};
 if(p==='/api/command-center')return state;
 if(p==='/api/clients')return [client];
 if(p==='/api/bids')return [bid];
 if(p==='/api/bids/1')return bid;
 if(p==='/api/invoices')return [invoice];
 if(p==='/api/portfolio')return [project];
 if(p==='/api/portfolio/1')return {project};
 if(p==='/api/activities/1')return [activity];
 if(p==='/api/dependencies/1')return [];
 if(p==='/api/field-tasks/1')return [{id:1,title:'Review site access',status:'todo'}];
 if(p==='/api/risks/1')return [{id:1,title:'Review weather delay',category:'schedule',status:'open',probability:3,impact:4,risk_score:12}];
 if(p==='/api/preconstruction/demo')return require(root+'/platform/server/src/services/preconstructionDemo').createPreconstructionDemoService().getDemo();
 if(p==='/api/executive/cfo/briefing')return cfo;
 if(p==='/api/designs/templates')return [];
 if(p.endsWith('/gis-review'))return {project:state.projects[0],review:null,stale:false};
 if(p.endsWith('/schedule-link'))return {link:null};
 if(p.endsWith('/briefing') && p.includes('/project-helper/'))return report;
 if(p.endsWith('/activity'))return {events:[],next_cursor:null};
 if(p==='/api/contractor-desk/status')return {};
 if(p==='/api/executive/owner-plan')return owner;
 if(p==='/api/executive/preconstruction-cycle')return require(root+'/platform/server/src/services/preconstructionCycle').summarizePreconstructionCycle(state,new Date('2026-11-18T18:00:00Z'));
 if(p==='/api/integrations/status')return {integrations:{}};
 unknown.add(p);return null;
}
const publicFiles=fs.mkdtempSync(path.join(require('os').tmpdir(),'abqadu-mobile-public-'));
require(root+'/scripts/build-public-site').buildPublicSite(root,publicFiles);
const app=express();app.use('/home',express.static(publicFiles));app.use(express.static(root+'/platform/client/build'));app.get('*',(_req,res)=>res.sendFile(root+'/platform/client/build/index.html'));
const clickText=async(page,text)=>page.evaluate(t=>{const e=[...document.querySelectorAll('button,[role=button],summary')].find(e=>e.textContent.trim()===t);if(!e)throw Error('Missing control: '+t);e.click();},text);
const scenarios=[
 {name:'home',route:'/home/index.html',ready:'.nav-hamburger'},
 {name:'contractor-entry',route:'/home/platform.html',ready:'main'},
 {name:'home-menu',route:'/home/index.html',ready:'.nav-hamburger',action:async p=>{if(await p.$eval('#hamburger',e=>getComputedStyle(e).display!=='none'))await p.click('#hamburger');}},
 {name:'home-design',route:'/home/index.html',ready:'.nav-hamburger',action:p=>p.evaluate(()=>document.querySelector('footer a[onclick*="alt"]').click())},
 {name:'home-contact',route:'/home/index.html',ready:'#assessment-form',action:async p=>{await p.type('#assessment-first-name','Review');await p.type('#assessment-phone','5055550123');await p.evaluate(()=>document.querySelector('#assessment-form').requestSubmit());}},
 {name:'sign-in',route:'/command-center',mode:'admin',ready:'input[name=username]'},
 {name:'command-center',route:'/command-center',ready:'#office-assistant',action:p=>p.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true))},
 {name:'office-menu',route:'/command-center',ready:'.app-menu-button',action:p=>p.click('.app-menu-button')},
 {name:'trade-bid',route:'/command-center',ready:'#trade-bids',action:p=>clickText(p,'New bid request')},
 {name:'estimate',route:'/cost-estimator',ready:'.app-navigation'},
 {name:'indoor-estimate',route:'/cost-estimator?mode=indoor',ready:'.app-navigation'},
 {name:'clients',route:'/clients',ready:'.app-navigation',action:p=>clickText(p,'+ Add Client')},
 {name:'bid-editor',route:'/bids',ready:'.app-navigation',action:p=>p.evaluate(()=>[...document.querySelectorAll('div')].find(e=>e.textContent==='Review estimate').click())},
 {name:'invoices',route:'/invoices',ready:'.invoice-table'},
 {name:'record-check',route:'/invoices',ready:'.invoice-table',action:p=>clickText(p,'Record check')},
 {name:'portfolio',route:'/portfolio',ready:'.app-portfolio-row'},
 {name:'schedule',route:'/schedule/1',ready:'.app-gantt-layout'},
 {name:'field',route:'/field/1',ready:'.app-field-columns',action:p=>clickText(p,'+ Task')},
 {name:'risks',route:'/risks/1',ready:'.app-split-layout',action:p=>clickText(p,'+ Add Risk')},
 {name:'agreement',route:'/preconstruction?demo=1',ready:'.precon-workbar'},
 {name:'executive',route:'/executive',ready:'#cash-scenario'},
 {name:'designer',route:'/design',ready:'.app-design-page',action:p=>p.evaluate(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='×');if(e)e.click();})},
 {name:'project-picker',route:'/schedule',ready:'.app-navigation'},
 {name:'payment-return',route:'/payment-return',ready:'.auth-card'},
];
for (let step=1;step<=6;step++) scenarios.push({name:'home-design-step-'+step,route:'/home/index.html',ready:'.nav-hamburger',action:async p=>{await p.evaluate(()=>document.querySelector('footer a[onclick*="alt"]').click());for(let i=0;i<step;i++)await p.click('#adu-wizard-next');}});
scenarios.push({name:'lightbox',route:'/home/index.html',ready:'.nav-hamburger',action:p=>p.evaluate(()=>document.querySelector('.sheet-btn').click())});
scenarios.push({name:'schedule-edit',route:'/schedule/1',ready:'.app-gantt-layout',action:async p=>{await p.click('[aria-label="Edit Review foundation work"]');await p.waitForSelector('[aria-label="Close activity editor"]');}});
scenarios.push({name:'drawing-touch',route:'/design',ready:'.app-design-page',action:async p=>{
 await p.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='×')?.click());
 await clickText(p,'Bedroom');
 await p.evaluate(()=>document.querySelector('.konvajs-content').scrollIntoView({block:'center'}));
 const point=await p.evaluate(()=>{const r=document.querySelector('.konvajs-content').getBoundingClientRect();const nav=document.querySelector('.app-navigation').getBoundingClientRect();return {x:r.left+r.width/2,y:Math.min(innerHeight-20,Math.max(nav.bottom+25,r.top+100))};});
 await p.touchscreen.tap(point.x,point.y);await p.waitForSelector('.app-room-properties input',{timeout:6000});
 const before=await p.$eval('.app-room-properties',e=>e.textContent);
 await clickText(p,'Zoom in');await clickText(p,'Zoom out');await clickText(p,'Fit plan');await clickText(p,'Move view');await clickText(p,'Move view');
 const after=await p.$eval('.app-room-properties',e=>e.textContent);if(before!==after)throw Error('View controls changed room measurements');
}});
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await puppeteer.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':puppeteer.executablePath()),headless:true});const page=await browser.newPage();await page.setRequestInterception(true);
 page.on('request',req=>{const u=new URL(req.url());if(u.pathname.startsWith('/api/')){const data=api(u);return req.respond({status:data===null?503:200,contentType:'application/json',body:JSON.stringify(data??{error:'Unavailable in layout review'})});}if(u.origin!==base && !u.protocol.startsWith('data'))return req.abort();return req.continue();});
 let errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[];
 const widths=process.env.WIDTHS?process.env.WIDTHS.split(',').map(Number):[320,375,390,430,768,1024,1440,844];
 for(const width of widths){await page.setViewport({width,height:width===844?390:844,hasTouch:true,isMobile:width<768});
 for(const scene of scenarios.filter(s=>!process.env.SCENES || process.env.SCENES.split(',').includes(s.name))){authMode=scene.mode||'local';errors=[];let failure=null;try{await page.goto(base+scene.route,{waitUntil:'domcontentloaded'});await page.waitForSelector(scene.ready,{timeout:6000});await new Promise(r=>setTimeout(r,120));if(scene.action)await scene.action(page);await new Promise(r=>setTimeout(r,100));}catch(e){failure=e.message;}
 const metrics=await page.evaluate(()=>{const visible=e=>e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true}) && e.getBoundingClientRect().width>0;const label=e=>(e.getAttribute('aria-label')||e.placeholder||e.textContent).trim().slice(0,75);const controls=[...document.querySelectorAll('button,input:not([type=checkbox]):not([type=radio]),select,textarea,summary')].filter(visible);return {width:innerWidth,scroll:document.documentElement.scrollWidth,small:controls.filter(e=>{const r=e.getBoundingClientRect();return r.height<43 || (e.tagName==='BUTTON' && r.width<43)}).map(e=>({label:label(e),tag:e.tagName,w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)})),tinyInputs:controls.filter(e=>e.matches('input,select,textarea')&&parseFloat(getComputedStyle(e).fontSize)<16).map(label),overflow:[...document.querySelectorAll('body *')].filter(e=>visible(e)&&e.getBoundingClientRect().right>innerWidth+2).slice(0,8).map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'svg',text:label(e),right:Math.round(e.getBoundingClientRect().right)}))};});
 const item={scene:scene.name,viewport:width,...metrics,failure,errors};results.push(item);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,unknown:[...unknown]},null,2));
 if(width===390){if(scene.name==='designer')await page.evaluate(()=>document.querySelector('.design-canvas-controls')?.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(output,scene.name+'.png'),fullPage:false});}
 }
 console.log('Completed width '+width);
 }
 console.log(JSON.stringify(results.filter(r=>r.failure||r.errors.length||r.scroll>r.width+2).map(r=>({scene:r.scene,width:r.viewport,scroll:r.scroll,failure:r.failure,errors:r.errors,overflow:r.overflow})),null,2));
 await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(publicFiles,{recursive:true,force:true});
 const failed=results.filter(r=>r.failure||r.errors.length||r.scroll>r.width+2||r.small.length||r.tinyInputs.length);
 console.log(JSON.stringify({reviewed:results.length,failed:failed.map(r=>({scene:r.scene,viewport:r.viewport,small:r.small,tinyInputs:r.tinyInputs})),unmocked:[...unknown],output},null,2));
 if(failed.length || unknown.size)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
