// Run only against the verified loopback synthetic preview. Uses an existing Playwright installation.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.VISITATION_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright');
const root=`${process.env.TEMP}/visitation-professional-preview`;
if(!JSON.parse(fs.readFileSync(`${root}/isolation.json`)).isolated_datadir_verified)throw new Error('Isolation not verified');
const before=process.argv[2]==='before',prefix=before?'recovery-before':'recovery-after';
const results=[],errors=[];
const browser=await chromium.launch({executablePath:process.env.VISITATION_CHROME || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
page.on('pageerror',e=>errors.push(String(e)));
await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:43417/')?r.continue():r.abort());
const fail=r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:{message:'合成測試連線中斷'}})});
const check=(name,passed)=>{results.push({check:name,passed});if(!passed&&!before)throw new Error(name);};
const screen=name=>page.screenshot({path:`${root}/${prefix}-${name}.png`});
try{
 await page.goto('http://127.0.0.1:43417/login');await page.locator('#email').fill('admin@example.invalid');await page.locator('#password').fill('Preview-only-2026!');await page.locator('form button[type=submit]').click();await page.waitForURL('**/admin');
 await context.route('**/api/places/list',fail);await page.goto('http://127.0.0.1:43417/app');await page.waitForTimeout(600);await page.locator('#btn-place-list').click();await screen('list-error');
 check('open list preserves failure and retry',await page.locator('[data-place-list-retry]').count()===1);
 await page.locator('#place-list-search').fill('合成');check('search preserves failure state',await page.locator('#place-list-count').innerText()==='載入失敗');
 await page.locator('#btn-place-list-close').click();await page.locator('#btn-place-list').click();check('close and reopen preserves retry',await page.locator('[data-place-list-retry]').count()===1);
 if(!before){
  await context.unroute('**/api/places/list');let reads=0;await context.route('**/api/places/list',async r=>{reads++;await new Promise(resolve=>setTimeout(resolve,700));await r.continue();});
  await page.evaluate(()=>{const b=document.querySelector('[data-place-list-retry]');b.click();b.click();});await page.locator('#place-list-search').fill('甲');
  check('slow retry is busy rather than empty',await page.locator('#place-list-count').innerText()==='載入中…'&&await page.locator('#place-list-items').getAttribute('aria-busy')==='true');
  await page.waitForFunction(()=>document.querySelector('#place-list-count').textContent==='1 筆');check('duplicate retry sends one request',reads===1);check('recovery retains search query',await page.locator('.place-list-item').count()===1);
  await page.locator('#place-list-search').fill('不存在的合成名單');check('successful empty search has no retry',await page.locator('.place-list-empty').innerText()==='沒有符合條件的名單'&&await page.locator('[data-place-list-retry]').count()===0);await context.unroute('**/api/places/list');
 }
 if(!before){
  await context.route('**/api/places/list',r=>r.fulfill({contentType:'application/json',body:'{"success":true,"data":{}}'}));await page.goto('http://127.0.0.1:43417/app');await page.waitForTimeout(500);await page.locator('#btn-place-list').click();check('malformed place list stays retryable',await page.locator('[data-place-list-retry]').count()===1);await context.unroute('**/api/places/list');
  await context.route('**/api/places/list',r=>r.fulfill({contentType:'application/json',body:'{"success":true,"data":[]}'}));await page.goto('http://127.0.0.1:43417/app');await page.waitForTimeout(500);await page.locator('#btn-place-list').click();check('successful empty database shows real empty state',await page.locator('#place-list-count').innerText()==='0 筆'&&await page.locator('[data-place-list-retry]').count()===0);await context.unroute('**/api/places/list');
 }
 await context.unroute('**/api/places/list');await page.goto('http://127.0.0.1:43417/app');await page.waitForFunction(()=>window.MapModule?._markersById?.size>0);
 let towns=0;await context.route('**/api/managed_towns/list',r=>{towns++;return towns===1?fail(r):r.continue();});
 await page.evaluate(()=>PlaceForm.openForCreate({lat:25.14,lng:121.76},'合成地址'));await screen('town-error');
 const retry=page.getByRole('button',{name:'重新載入鄉鎮市區',exact:true});check('failed town lookup offers visible retry',await retry.count()===1&&await retry.isVisible());
 if(!before){
  await page.locator('#place-note').fill('合成未儲存筆記');await retry.click();await page.waitForFunction(()=>document.querySelector('#place-managed-district-select').options.length===3);
  check('town retry retains entered values',await page.locator('#place-note').inputValue()==='合成未儲存筆記');check('town retry hides after success',!await retry.isVisible());check('town retry remains in open editor',await page.locator('#modal-place-form').getAttribute('aria-hidden')==='false');await screen('town-recovered');
 }
 await page.evaluate(()=>PlaceForm.closeModal('modal-place-form'));await page.evaluate(()=>PlaceForm.openForCreate({lat:25.14,lng:121.76},'合成地址'));check('reopening can recover failed lookup',await page.locator('#place-managed-district-select option').count()===3&&towns===2);
 await page.evaluate(()=>PlaceForm.closeModal('modal-place-form'));
 if(!before){
  await page.evaluate(()=>{PlaceForm._townOptionsLoaded=false;});await context.unroute('**/api/managed_towns/list');let calls=0;await context.route('**/api/managed_towns/list',async r=>{calls++;await new Promise(resolve=>setTimeout(resolve,500));await r.continue();});
  await page.evaluate(()=>Promise.all([PlaceForm.openForCreate({lat:25.14,lng:121.76},'合成地址'),PlaceForm.openForCreate({lat:25.14,lng:121.76},'合成地址')]));check('concurrent town loads share one request',calls===1);await page.evaluate(()=>PlaceForm.closeModal('modal-place-form'));
  await context.unroute('**/api/managed_towns/list');await page.evaluate(()=>{PlaceForm._townOptionsLoaded=false;});await context.route('**/api/managed_towns/list',r=>r.fulfill({contentType:'application/json',body:'{"success":false}'}));await page.evaluate(()=>PlaceForm.openForCreate({lat:25.14,lng:121.76},'合成地址'));check('malformed town response stays retryable',await retry.isVisible());await page.evaluate(()=>PlaceForm.closeModal('modal-place-form'));await context.unroute('**/api/managed_towns/list');
  await page.evaluate(()=>MapModule._markersById.get(1).element.click());await page.locator('#btn-place-edit').click();await page.waitForSelector('.modal--open');await page.locator('#place-category').selectOption('因公死亡');await page.locator('#place-note').fill('合成慢回應重複儲存測試');let writes=0;await context.route('**/api/places/update',async r=>{writes++;await new Promise(resolve=>setTimeout(resolve,500));await r.continue();});
  await page.evaluate(()=>{document.querySelector('#btn-place-save').click();document.querySelector('#btn-place-save').click();});check('save disables during slow response',await page.locator('#btn-place-save').isDisabled());await page.keyboard.press('Escape');check('Escape during save retains modal',await page.locator('#modal-place-form').getAttribute('aria-hidden')==='false');await page.waitForFunction(()=>document.querySelector('#modal-place-form').getAttribute('aria-hidden')==='true');check('slow double save writes once',writes===1);await context.unroute('**/api/places/update');
  await page.locator('#btn-place-list').click();await page.locator('#place-list-search').fill('合成慢回應重複儲存測試');await page.waitForFunction(()=>document.querySelectorAll('.place-list-item').length===1);check('saved data refreshes searchable list',true);await screen('list-recovered');
  for(const [w,h] of [[320,568],[844,390],[1440,1000]]){await page.setViewportSize({width:w,height:h});await screen(`${w}x${h}`);check(`${w}px recovered list has no document overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  check('no browser runtime exceptions',errors.length===0);
 }
}finally{fs.writeFileSync(`${root}/${prefix}-results.json`,JSON.stringify({syntheticOnly:true,results,errors},null,2));console.log(JSON.stringify({prefix,results,errors},null,2));await browser.close();}
