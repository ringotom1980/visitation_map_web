import fs from 'node:fs';
process.argv[2]='permissions-library';
const {call,evaluate,pause,navigate,screenshot,close,getBrowserErrors}=await import('./preview_browser.mjs');
const root=`${process.env.TEMP}/visitation-professional-preview`,results=[];
function check(name,value){if(!value)throw Error(name);results.push({check:name,passed:true});console.log('PASS',name);}
async function until(expr){for(let i=0;i<80;i++){if(await evaluate(expr))return;await pause(100);}throw Error('Timeout '+expr);}
async function login(email){await navigate('/login');check('login '+email,await evaluate(`(async()=>{const csrf=document.querySelector('meta[name="csrf-token"]').content;const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email:${JSON.stringify(email)},password:'Preview-only-2026!'})});return r.ok})()`));}
async function fits(name,width,height){await screenshot(name,width,height);check(name+' no horizontal overflow',await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));}
try {
 await login('admin@example.invalid');await navigate('/admin');check('OWNER four dashboard entrances',await evaluate('document.querySelectorAll(".dashboard-cards a").length===4'));
 await fits('permissions-owner-dashboard',1440,1000);await fits('permissions-owner-dashboard-mobile',390,844);
 await navigate('/admin/accounts.php');await until('document.querySelectorAll("[data-org]").length>0');check('unit overview before personnel',await evaluate('!document.querySelector(".admin-table")'));
 await fits('permissions-unit-cards-mobile',390,844);await evaluate('document.querySelector("[data-org]").click()');await until('!!document.querySelector(".admin-table")');check('OWNER row protected',await evaluate('Array.from(document.querySelectorAll("tr")).find(r=>r.textContent.includes("admin@example.invalid")).querySelectorAll("button:not(:disabled)").length===0'));
 await fits('permissions-personnel-mobile',390,844);await fits('permissions-personnel-desktop',1440,1000);
 await evaluate('document.querySelector("#userSearch").value="other@example.invalid";document.querySelector("#userSearch").dispatchEvent(new Event("input"))');check('cross-unit search finds another unit',await evaluate('document.querySelector(".admin-table").textContent.includes("other@example.invalid")'));
 await login('target@example.invalid');await navigate('/admin');check('ADMIN has three entrances',await evaluate('document.querySelectorAll(".dashboard-cards a").length===3'));
 await navigate('/admin/accounts.php');await until('document.querySelectorAll("[data-org]").length>0');await evaluate('document.querySelector("#allOrganizations").click()');check('ADMIN cannot use appointment buttons',await evaluate('Array.from(document.querySelectorAll("[data-action=role]")).every(b=>b.disabled)'));
 await fits('permissions-admin-personnel-mobile',390,844);
 await login('user@example.invalid');await navigate('/admin');check('USER redirected to map',await evaluate('location.pathname==="/app"'));await evaluate('document.querySelector(".account-menu").open=true');check('USER menu shows unit, personal details, application and email',await evaluate('document.querySelector(".account-menu").textContent.includes("目前單位：")&&document.querySelector(".account-menu").textContent.includes("個人資料")&&document.querySelector(".account-menu").textContent.includes("單位異動申請 / 進度")&&document.querySelector(".account-menu").textContent.includes("user@example.invalid")&&!Array.from(document.querySelectorAll(".account-menu a")).some(a=>a.getAttribute("href")==="/admin")'));
 await fits('permissions-user-account-menu',390,844);await navigate('/profile');check('personal form has only four basic fields',await evaluate('document.querySelectorAll("#personal-form input").length===4'));await fits('permissions-personal-mobile',390,844);await fits('permissions-personal-small',320,740);
 await evaluate('document.querySelector("#personal-form input[name=phone]").value="0123456789";document.querySelector("#personal-form").requestSubmit()');await until('document.querySelector("#personal-feedback").textContent.includes("已儲存")');check('basic profile saves immediately',true);
 check('no uncaught browser exceptions',getBrowserErrors().length===0);fs.writeFileSync(`${root}/permissions-ui-results.json`,JSON.stringify(results,null,2));
}catch(e){console.error(e);await screenshot('permissions-qa-failure',390,844);process.exitCode=1;}
finally{await call('Browser.close');close();}
