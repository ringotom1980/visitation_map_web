// Actual Chrome + existing MapLibre renderer, local synthetic style/data only.
import fs from 'node:fs';
const action=process.argv[2];process.argv[2]='mobile-library';
const {call,evaluate,pause,navigate,screenshot,close,getBrowserErrors}=await import('./preview_browser.mjs');
const root=`${process.env.TEMP}/visitation-professional-preview`;
const results=[],metrics=[];
const check=(name,value)=>{if(!value)throw new Error(name);results.push({check:name,passed:true});console.log('PASS',name);};
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Timeout '+expression);}
async function click(selector){
 const box=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`);
 if(box.w<=0||box.h<=0)throw new Error('invisible '+selector);
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1});await pause(selector==='#btn-route-expand'?350:150);
}
async function input(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function dimensions(w,h){await call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<600});await pause(350);}
async function measure(label){const m=await evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};const map=rect('#map'),header=rect('.app-toolbar'),actions=rect('.map-top-actions');let bottom=map.bottom;for(const s of ['#sheet-route.bottom-sheet--open .bottom-sheet__inner','#route-compact:not([hidden])','#place-list-panel.is-open','.filter-panel.is-open .filter-panel__drawer']){const e=document.querySelector(s);if(e&&getComputedStyle(e).display!=='none')bottom=Math.min(bottom,e.getBoundingClientRect().top);}const top=Math.max(map.top,actions.bottom);return {viewport:[innerWidth,innerHeight],headerHeight:header.height,mapHeight:map.height,usableMapHeight:Math.max(0,bottom-top),usableMapPercent:Math.round(Math.max(0,bottom-top)/innerHeight*100),overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);metrics.push({label,...m});return m;}
const count=()=>evaluate(`document.querySelectorAll('#route-list .route-item').length-1`);
async function add(id){await evaluate(`MapModule._markersById.get(${id}).element.click()`);await pause(50);}
try{
 await call('Network.enable');await call('Network.clearBrowserCookies');
 // Fail test if anything attempts a provider request; local renderer and style are real.
 await call('Network.setBlockedURLs',{urls:['*maps.googleapis.com*','*api.maptiler.com*','*unpkg.com*']});
 await dimensions(390,844);await navigate('/login');
 await evaluate(`(async()=>{const csrf=document.querySelector('meta[name="csrf-token"]').content;return (await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email:'admin@example.invalid',password:'Preview-only-2026!'})})).json()})()`);
 await navigate('/app');
 await until(`typeof MapModule!=='undefined' && MapModule.getMap()?._raw?.isStyleLoaded() && MapModule._markersById.has(24)`);
 await evaluate(`MapModule.panToLatLng(25.14,121.76,14);window.qaMode='BROWSE';document.addEventListener('mode:changed',e=>window.qaMode=e.detail.mode)`);await pause(600);
 if(action==='before'){
   await screenshot('mobile-before-browse',390,844);await measure('before-browse');
   await click('#btn-route-mode');for(let id=1;id<=4;id++)await add(id);
   await screenshot('mobile-before-selected-4',390,844);await measure('before-selected-4');await add(5);
   await screenshot('mobile-before-selected-5',390,844);await measure('before-selected-5');
   for(let id=6;id<=20;id++)await add(id);
   await screenshot('mobile-before-selected-20',390,844);await measure('before-selected-20');
 }else{
  check('real MapLibre local synthetic style rendered',await evaluate(`!!document.querySelector('.maplibregl-canvas') && MapModule.getMap()._raw.isStyleLoaded()`));
  await screenshot('mobile-after-browse',390,844);check('compact portrait header <=110px',(await measure('after-browse')).headerHeight<=110);
  await click('.account-menu summary');check('account menu reveals admin and logout',await evaluate(`document.querySelector('.account-menu').open && document.querySelector('#btn-logout').getBoundingClientRect().height>=44`));await click('.account-menu summary');
  await click('#btn-route-mode');check('planning begins collapsed, map selectable',await evaluate(`qaMode==='ROUTE_PLANNING'&&!document.querySelector('#route-compact').hidden&&!document.querySelector('#sheet-route').classList.contains('bottom-sheet--open')`));
  check('zero selection finish disabled',await evaluate(`document.querySelector('#btn-route-compact-commit').disabled`));
  for(const n of [0,1,4,5,10,20]){
    let current=await count();while(current<n){await add(++current);}
    for(const [w,h,label] of [[390,844,'portrait'],[844,390,'landscape']]){
      await dimensions(w,h);await screenshot(`mobile-after-${label}-selected-${n}`,w,h);let m=await measure(`${label}-${n}-collapsed`);
      check(`${label} ${n}: map >=60% viewport and no overflow`,m.usableMapPercent>=60&&!m.overflow);
      check(`${label} ${n}: selection retained`,await count()===n);
      await click('#btn-route-expand');await screenshot(`mobile-after-${label}-list-${n}`,w,h);m=await measure(`${label}-${n}-expanded`);
      check(`${label} ${n}: expanded map remains visible`,m.usableMapHeight>=100&&!m.overflow);
      check(`${label} ${n}: route list internally scrollable`,await evaluate(`(()=>{const e=document.querySelector('#route-list');return e.clientHeight>0&&getComputedStyle(e).overflowY==='auto'&&(${n}<5||e.scrollHeight>e.clientHeight)})()`));
      await click('#btn-route-close');check(`${label} ${n}: collapse retains planning and selection`,await evaluate(`qaMode==='ROUTE_PLANNING'`) && await count()===n);
    }
  }
  await dimensions(390,844);await click('#btn-route-expand');
  const oldOrder=await evaluate(`Array.from(document.querySelectorAll('#route-list .route-item')).map(e=>e.dataset.id)`);
  await click('#route-list .route-item[data-id="2"] .route-item__up');
  check('touch reorder moves second destination ahead of first',await evaluate(`document.querySelectorAll('#route-list .route-item')[1].dataset.id==='2'`));
  await click('#route-list .route-item[data-id="2"] .route-item__remove');check('remove only removes intended destination',await count()===19);
  await click('#route-list .route-item[data-id="20"] .route-item__content');await pause(600);
  check('view location collapses without removing selection',await count()===19&&await evaluate(`!document.querySelector('#sheet-route').classList.contains('bottom-sheet--open')&&qaMode==='ROUTE_PLANNING'`));
  check('view location camera focuses on selected coordinate',await evaluate(`Math.abs(MapModule.getMap().getCenter().lng()-MapModule._markersById.get(20).data.lng)<.005`));
  // Actual touch drag on exposed map.
  const before=await evaluate('MapModule.getMap().getCenter().lng()');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:170,y:380}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230,y:390}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(300);
  check('collapsed planning map supports touch pan',Math.abs(await evaluate('MapModule.getMap().getCenter().lng()')-before)>.00001);
  await evaluate(`document.dispatchEvent(new CustomEvent('map:blankClick'))`);check('blank map click retains planning and selection',await count()===19&&await evaluate(`qaMode==='ROUTE_PLANNING'`));
  await click('#btn-place-list');await click('.place-list-item[data-place-id="2"]');check('list can continue adding while planning',await count()===20);
  await click('.place-list-item[data-place-id="3"]');check('list toggles selected item without leaving planning',await count()===19&&await evaluate(`qaMode==='ROUTE_PLANNING'&&document.querySelector('#place-list-panel').classList.contains('is-open')`));
  await screenshot('mobile-after-list-selection',390,844);await measure('list-selection');
  await click('#btn-place-list-close');await click('#btn-filter');await until(`document.querySelector('#filter-reside-town input')`);
  await click('#filter-over65 input[value="Y"]');await screenshot('mobile-after-filter',390,844);let f=await measure('filter');check('filter bounded and exposed map >=100px',f.usableMapHeight>=100);
  await click('#btn-filter-clear');await click('#btn-filter-close');check('filter close preserves route',await count()===19);
  // Smaller viewport approximates the visible browser area above an on-screen keyboard.
  await dimensions(390,480);await click('#btn-place-list');await click('#place-list-search');await input('#place-list-search','長姓名');await screenshot('mobile-after-keyboard-area',390,480);
  check('keyboard-sized viewport search has scrollable results',await evaluate(`document.querySelector('#place-list-items').clientHeight>44&&document.querySelectorAll('.place-list-item').length===1`));await click('#btn-place-list-close');
  await dimensions(390,844);await click('#btn-place-list');await click('#place-list-search');
  await evaluate(`document.documentElement.style.setProperty('--visual-height','360px');document.documentElement.style.setProperty('--keyboard-offset','484px');document.body.classList.add('is-keyboard-open')`);await pause(300);
  check('Safari visual viewport simulation keeps search results above keyboard',await evaluate(`document.querySelector('#place-list-panel').getBoundingClientRect().bottom<=361&&document.querySelector('#place-list-items').clientHeight>44`));
  await evaluate(`const keyboard=document.createElement('div');keyboard.id='qa-keyboard';keyboard.style='position:fixed;bottom:0;left:0;right:0;height:484px;background:#e5e9ec;z-index:20000;text-align:center;padding-top:24px;color:#536778;box-sizing:border-box';keyboard.textContent='模擬鍵盤區域（非實機）';document.body.appendChild(keyboard)`);
  await screenshot('mobile-after-safari-keyboard-simulation',390,844);await evaluate(`document.querySelector('#qa-keyboard').remove()`);await dimensions(391,844);await dimensions(390,844);await click('#btn-place-list-close');
  await dimensions(390,844);await evaluate(`document.documentElement.style.setProperty('--safe-bottom','34px')`);await screenshot('mobile-after-safe-area',390,844);check('compact route clears simulated safe area',await evaluate(`document.querySelector('#route-compact').getBoundingClientRect().height>=44&&document.querySelector('#route-compact').getBoundingClientRect().bottom<=innerHeight-34`));
  await click('#btn-route-expand');await evaluate('window.confirm=()=>false');await click('#btn-route-clear');check('cancel clear retains 19 destinations',await count()===19);
  await evaluate('window.confirm=()=>true');await click('#btn-route-clear');check('confirmed clear retains only start and disables finish',await count()===0&&await evaluate(`document.querySelector('#btn-route-commit').disabled`));
  await click('#btn-route-close');await evaluate(`const marker=MapModule._markersById.get(1);marker.element.dataset.qaPlaceId='1';MapModule.panToLatLng(marker.data.lat,marker.data.lng,16);`);await pause(500);
  await click('.ml-marker[data-qa-place-id="1"] .ml-marker__dot');check('visible map marker click adds destination',await count()===1);
  await add(2);await input('#map-search-input','合成測試地點24');await click('#btn-search-go');check('search adds existing place while keeping planning',await count()===3&&await evaluate(`qaMode==='ROUTE_PLANNING'`));
  await input('#map-search-input','合成測試地點24');await click('#btn-search-go');check('repeat search does not duplicate selected place',await count()===3);await add(24);
  await click('#btn-route-expand');await click('#btn-route-exit');check('exit preserves destinations and returns browse',await count()===2&&await evaluate(`qaMode==='BROWSE'&&document.querySelector('#route-compact').hidden`));
  await click('#btn-route-mode');await click('#btn-route-compact-commit');check('finish enters ready mode',await evaluate(`qaMode==='ROUTE_READY'&&document.querySelector('#route-actions').getAttribute('aria-hidden')==='false'`));await screenshot('mobile-after-complete',390,844);
  await click('#btn-route-replan');check('replan retains selections, starts collapsed',await count()===2&&await evaluate(`qaMode==='ROUTE_PLANNING'&&!document.querySelector('#route-compact').hidden`));
  await dimensions(320,568);for(let id=3;id<=20;id++)await add(id);await screenshot('mobile-after-small-phone',320,568);check('320px 20-selection controls do not wrap or overflow',await evaluate(`document.documentElement.scrollWidth<=innerWidth&&Array.from(document.querySelectorAll('.map-action-btn')).every(e=>e.getBoundingClientRect().height===44&&e.scrollWidth<=e.clientWidth+1)`));
  await dimensions(1440,1000);await click('#btn-route-expand');await screenshot('mobile-after-desktop',1440,1000);check('desktop preserves map and route list',!(await measure('desktop')).overflow);
  await dimensions(390,844);await click('#btn-route-close');await click('.account-menu summary');await click('#btn-logout');await until(`location.pathname==='/login'`);check('account menu logout works through visible control',true);
  await until(`document.readyState==='complete' && !!document.querySelector('#loginForm button[type=submit]:not(:disabled)')`);await input('#email','admin@example.invalid');await input('#password','Preview-only-2026!');await click('button[type="submit"]');await until(`location.pathname==='/admin'`);check('logout then login works',true);
  check('no browser runtime exceptions',getBrowserErrors().length===0);
 }
 fs.writeFileSync(`${root}/mobile-${action}-results.json`,JSON.stringify({results,metrics},null,2));console.log('MOBILE QA',results.length,'checks passed',JSON.stringify(metrics));
}catch(e){const diagnostic=await evaluate(`({url:location.href,ready:document.readyState,text:document.body.innerText.slice(0,1200),scripts:Array.from(document.scripts).map(s=>s.src),resources:performance.getEntriesByType('resource').map(e=>[e.name,e.duration])})`);console.error(e,diagnostic);await screenshot('mobile-qa-failure',390,844);fs.writeFileSync(`${root}/mobile-${action}-results.json`,JSON.stringify({results,metrics,error:String(e),diagnostic},null,2));process.exitCode=1;}
finally{await call('Browser.close');close();}
