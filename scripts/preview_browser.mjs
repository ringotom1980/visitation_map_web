// Uses installed Chrome and built-in Node WebSocket; no package installation.
import fs from 'node:fs';
const root = `${process.env.TEMP}/visitation-professional-preview`;
const tabs = await (await fetch(`http://127.0.0.1:${process.env.VISITATION_CDP_PORT || 43420}/json`)).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, {once:true}));
let seq = 0; const pending = new Map();
const browserErrors=[];
const network=[];
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if(message.method==='Runtime.exceptionThrown')browserErrors.push(message.params.exceptionDetails);
  if(message.method==='Network.requestWillBeSent' && message.params.request.url.includes('/api/'))network.push({event:'request',id:message.params.requestId,url:message.params.request.url});
  if(message.method==='Network.responseReceived' && message.params.response.url.includes('/api/'))network.push({event:'response',id:message.params.requestId,status:message.params.response.status,url:message.params.response.url});
  if (message.id) { const [resolve,reject] = pending.get(message.id) || [];pending.delete(message.id);if(message.error)reject(message.error);else resolve(message.result); }
});
export async function call(method, params={}) {
  const id=++seq; const promise=new Promise((resolve,reject)=>pending.set(id,[resolve,reject]));
  ws.send(JSON.stringify({id,method,params}));return promise;
}
export async function evaluate(expression) {
  const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;
}
export async function pause(ms=500){await new Promise(r=>setTimeout(r,ms));}
export async function navigate(path){await call('Page.navigate',{url:'http://127.0.0.1:43417'+path});await pause(1000);}
export async function screenshot(name,width=1440,height=1000){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await pause();
  const image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(`${root}/${name}.png`,Buffer.from(image.data,'base64'));
}
await call('Page.enable');
await call('Runtime.enable');
if(process.argv[2]==='before'){
  await navigate('/login');await screenshot('before-login');
  const login=await evaluate(`(async()=>{const csrf=document.querySelector('meta[name="csrf-token"]').content;return await (await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email:'admin@example.invalid',password:'Preview-only-2026!'})})).json()})()`);
  console.log('Login',login.success);
  await navigate('/admin');await screenshot('before-admin');await screenshot('before-admin-mobile',390,844);
  await navigate('/app');await screenshot('before-app');
  console.log(await evaluate('document.body.innerText.slice(0,1100)'));
  ws.close();
}
export function close(){ws.close();}
export function getBrowserErrors(){return browserErrors;}
if(process.argv[2]==='verify'){
 const results=[];
 const check=(name,value)=>{if(!value)throw new Error('UI check failed: '+name);results.push({check:name,passed:true});console.log('PASS',name);};
 async function until(expression){for(let i=0;i<60;i++){if(await evaluate(expression))return;await pause(150);}console.log(await evaluate(`({text:document.body.innerText.slice(-1400),loading:typeof adminLoading==='undefined'?null:adminLoading})`));throw new Error('Timeout: '+expression);}
 async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await pause(150);}
 async function input(selector,value,event='input'){await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);}
 async function overflow(name){check(name,await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));}
 try{
  await call('Network.enable');
  await call('Network.setBlockedURLs',{urls:['*maps.googleapis.com*','*unpkg.com*']});
  await call('Network.clearBrowserCookies');
  await navigate('/login');await screenshot('after-login');await screenshot('after-login-mobile',390,844);await overflow('login mobile no horizontal overflow');
  await input('#email','admin@example.invalid');await input('#password','Preview-only-2026!');
  await evaluate(`window.loginRequests=0;window.realFetch=fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/auth/login')){loginRequests++;}return realFetch(...args)};document.querySelector('form').requestSubmit();document.querySelector('form').requestSubmit();`);
  await until(`location.pathname==='/admin' && document.querySelectorAll('.admin-table tbody tr').length===4`);
  // Successful navigation discards page variables; measure duplicate prevention before navigation separately below.
  await screenshot('after-admin',1440,1000);await overflow('admin desktop no horizontal overflow');
  await input('#userSearch','沒有這個帳戶');check('search empty state',await evaluate(`document.querySelector('#usersContainer').textContent.includes('找不到符合條件')`));
  await click('#btnClearFilters');await input('#roleFilter','ADMIN','change');check('role filter',await evaluate(`document.querySelectorAll('.admin-table tbody tr').length===2`));
  await input('#statusFilter','SUSPENDED','change');check('combined filter empty',await evaluate(`document.querySelectorAll('.admin-table tbody tr').length===0`));await click('#btnClearFilters');
  check('self actions disabled',await evaluate(`Array.from(document.querySelectorAll('[data-id="1"][data-action]')).every(b=>b.disabled)`));
  await click('[data-id="2"][data-action="status"]');check('named confirmation',await evaluate(`document.querySelector('#confirmAction').open && document.querySelector('#confirmTitle').textContent.includes('示範承辦人')`));
  await screenshot('after-confirmation',390,844);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause();
  check('Escape cancels without write',await evaluate(`!document.querySelector('#confirmAction').open && adminUsers.find(u=>u.id==2).status==='ACTIVE'`));
  await evaluate(`window.statusRequests=0;window.originalFetch=fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/set-status')){statusRequests++;}return originalFetch(...args)};`);
  await click('[data-id="2"][data-action="status"]');await evaluate(`document.querySelector('#confirmSubmit').click();document.querySelector('#confirmSubmit').click();`);
  await until(`!adminBusy`);check('double confirmation writes once',await evaluate('statusRequests===1'));check('successful feedback',await evaluate(`document.querySelector('#adminFeedback').textContent.includes('已將')`));
  await click('[data-id="2"][data-action="status"]');await click('#confirmSubmit');await until('!adminBusy');check('restore account through UI',await evaluate(`adminUsers.find(u=>u.id==2).status==='ACTIVE'`));
  await evaluate('window.scrollTo(0,0)');await screenshot('after-admin-mobile',390,844);await overflow('admin mobile no horizontal overflow');
  await evaluate(`document.querySelector('#usersContainer').scrollIntoView({block:'start'});`);await screenshot('after-accounts-mobile',390,844);
  check('mobile account actions 44px',await evaluate(`Array.from(document.querySelectorAll('.action-btn')).every(b=>b.getBoundingClientRect().height>=44)`));
  // Explicit failed read and recovery use the real error UI; no production requests.
  await evaluate(`window.fetch=async(...args)=>{if(String(args[0]).includes('/admin/users/list'))throw new Error('測試連線中斷');return originalFetch(...args)};`);
  await click('#btnRefresh');await until('!adminLoading');check('error state includes retry',await evaluate(`!!document.querySelector('[data-retry]')`));
  await evaluate('window.fetch=originalFetch');await click('[data-retry]');await until(`document.querySelectorAll('.admin-table tbody tr').length===4`);check('retry restores list',true);
  await navigate('/admin/security');await until(`document.querySelector('#wrapThrottles').textContent.trim().length>0`);
  check('security center inactive panel hidden',await evaluate(`getComputedStyle(document.querySelector('#tab-events')).display==='none'`));
  await click('[data-tab="events"]');await until(`document.querySelector('#wrapEvents table')`);check('security center tab switch works',await evaluate(`getComputedStyle(document.querySelector('#tab-throttles')).display==='none'`));
  await screenshot('after-security-mobile',390,844);await overflow('security mobile no document overflow');
  await navigate('/app');await until(`document.querySelector('#nav-user-name')?.textContent.includes('示範管理者')`);
  check('provider outage has visible explanation',await evaluate(`!document.querySelector('#map-service-status').hidden`));
  await screenshot('after-app',1440,1000);await click('#btn-place-list');await until(`document.querySelectorAll('.place-list-item').length===2`);
  await screenshot('after-app-mobile',390,844);await overflow('app mobile no horizontal overflow');
  await input('#place-list-search','甲');check('place search filters',await evaluate(`document.querySelectorAll('.place-list-item').length===1`));
  await click('.place-list-item');await click('#btn-place-edit');await until(`document.querySelector('#modal-place-form').classList.contains('modal--open')`);
  await screenshot('after-place-form-mobile',390,844);
  await click('[data-modal-close="modal-place-form"]');check('cancel closes form',await evaluate(`!document.querySelector('#modal-place-form').classList.contains('modal--open')`));check('cancel restores body scroll',await evaluate(`!document.body.classList.contains('is-modal-open')`));
  await click('#btn-place-edit');await until(`document.querySelector('#modal-place-form').classList.contains('modal--open')`);
  await input('#place-serviceman-name','');await click('#btn-place-save');check('required field keeps form open',await evaluate(`document.querySelector('#modal-place-form').classList.contains('modal--open')`));
  await input('#place-serviceman-name','示範官兵甲');
  await input('#place-category','因公死亡','change');
  await evaluate(`window.placeRequests=0;window.placeFetch=fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/places/update')){placeRequests++;}return placeFetch(...args)};document.querySelector('#btn-place-save').click();document.querySelector('#btn-place-save').click();`);
  await until(`!PlaceForm._submitting`);check('place double save single request',await evaluate('placeRequests===1'));check('successful save closes modal',await evaluate(`!document.querySelector('#modal-place-form').classList.contains('modal--open')`));
  await evaluate('window.confirm=()=>false');
  await click('#btn-route-mode');check('enter route planning with compact map controls',await evaluate(`!document.querySelector('#route-compact').hidden`));await click('#btn-route-expand');await click('#btn-route-exit');check('exit route planning returns browse',await evaluate(`!document.querySelector('#sheet-route').className.includes('open') && document.querySelector('#route-compact').hidden`));
  await evaluate('window.confirm=()=>true');await click('#btn-logout');await until(`location.pathname==='/login' && document.readyState==='complete' && document.querySelector('button[type="submit"]') && !document.querySelector('button[type="submit"]').disabled`);
  check('logout returns login',true);
  await input('#email','admin@example.invalid');await input('#password','Preview-only-2026!');await click('button[type="submit"]');await until(`location.pathname==='/admin'`);check('logout then login works',true);
  fs.writeFileSync(`${root}/ui-results.json`,JSON.stringify(results,null,2));console.log('UI regression:',results.length,'checks passed');
 }catch(error){console.log(await evaluate('({url:location.href,body:document.body.innerText.slice(0,1600)})'));await screenshot('qa-failure',390,844);fs.writeFileSync(`${root}/ui-results.json`,JSON.stringify({results,error:String(error),browserErrors,network},null,2));console.error(error);console.error(JSON.stringify(browserErrors.map(e=>e.exception?.description||e.text)));process.exitCode=1;}
 finally{await call('Browser.close');close();}
}
