'use strict';
let selectedOrganization='overview';
let adminUsers=[],adminBusy=false,adminLoading=false;
const roleNames={ADMIN:'管理者',USER:'一般使用者'},statusNames={ACTIVE:'啟用',SUSPENDED:'停權'};
const $=id=>document.getElementById(id);
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function feedback(message,error=false){$('adminFeedback').hidden=!message;$('adminFeedback').textContent=message;$('adminFeedback').classList.toggle('is-error',error);}
document.addEventListener('DOMContentLoaded',()=>{
 $('btnLogout').addEventListener('click',async e=>{const b=e.currentTarget;if(b.disabled||!confirm('確定要登出系統嗎？'))return;b.disabled=true;try{await apiRequest('/auth/logout','POST',{});location.assign('/login');}catch(err){feedback('登出未完成：'+err.message,true);b.disabled=false;}});
 ['userSearch','roleFilter','statusFilter'].forEach(id=>$(id).addEventListener(id==='userSearch'?'input':'change',renderUsers));
 $('btnClearFilters').addEventListener('click',()=>{['userSearch','roleFilter','statusFilter'].forEach(id=>$(id).value='');renderUsers();$('userSearch').focus();});
 $('btnRefresh').addEventListener('click',refreshAdmin);
 $('usersContainer').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)changeAccount(b);if(e.target.closest('[data-retry]'))refreshAdmin();});
 $('allOrganizations').addEventListener('click',()=>{selectedOrganization=null;renderUsers();});
 $('userSearch').addEventListener('input',()=>{selectedOrganization=null;renderUsers();});
 if(new URLSearchParams(location.search).get('view')==='authorization') selectedOrganization=null;
 refreshAdmin();
});
async function refreshAdmin(){if(adminBusy||adminLoading)return;adminLoading=true;$('btnRefresh').disabled=true;await loadUsers();adminLoading=false;$('btnRefresh').disabled=false;}
async function loadUsers(){const c=$('usersContainer');c.setAttribute('aria-busy','true');c.innerHTML='<div class="empty-hint">正在載入帳戶資料…</div>';try{const json=await apiRequest('/admin/users/list','GET');if(!Array.isArray(json.data))throw new Error('帳戶資料格式不正確');adminUsers=json.data;renderOrganizations();renderUsers();}catch(err){$('usersCount').textContent='載入失敗';c.innerHTML=`<div class="empty-hint is-error">帳戶資料載入失敗：${escapeHtml(err.message)}<br><button type="button" class="btn-outline" data-retry>重新載入</button></div>`;}finally{c.setAttribute('aria-busy','false');}}
function renderUsers(){
 if(selectedOrganization==='overview'){ $('usersContainer').innerHTML='<p class="empty-hint">選擇上方單位卡片查看人員，或輸入關鍵字跨單位搜尋。</p>';$('usersCount').textContent=adminUsers.length+' 個帳戶';return; }
 const q=$('userSearch').value.trim().toLocaleLowerCase(),r=$('roleFilter').value,s=$('statusFilter').value;
 const rows=adminUsers.filter(u=>(selectedOrganization===null||Number(u.organization_id)===selectedOrganization)&&(!r||u.role===r)&&(!s||u.status===s)&&[u.name,u.email,u.organization_name,u.title,u.phone].some(v=>String(v||'').toLocaleLowerCase().includes(q)));
 $('usersCount').textContent=`${rows.length} / ${adminUsers.length} 個帳戶`;
 if(!rows.length){$('usersContainer').innerHTML=`<div class="empty-hint"><strong>${adminUsers.length?'找不到符合條件的帳戶':'尚無帳戶資料'}</strong><p>試著調整關鍵字或清除篩選條件。</p></div>`;return;}
 $('usersContainer').innerHTML=`<table class="admin-table"><caption class="sr-only">帳戶角色與狀態清單</caption><thead><tr>${['姓名 / 帳號','單位 / 職稱','聯絡電話','角色','狀態','帳戶操作'].map(t=>`<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${rows.map(u=>{
 const self=Number(u.id)===Number(document.body.dataset.currentUserId),disabled=self||adminBusy?'disabled':'',roleDisabled=!u.can_role||adminBusy?'disabled':'',statusDisabled=!u.can_status||adminBusy?'disabled':'';
 return `<tr><td data-label="姓名 / 帳號"><div><strong>${escapeHtml(u.name||'未填姓名')}</strong>${self?'<span class="self-tag">本人</span>':''}<span class="cell-secondary">${escapeHtml(u.email)}</span></div></td><td data-label="單位 / 職稱"><div>${escapeHtml(u.organization_name||'未指定單位')}<span class="cell-secondary">${escapeHtml(u.title||'未填職稱')}</span></div></td><td data-label="聯絡電話">${escapeHtml(u.phone||'未填寫')}</td><td data-label="角色"><span class="badge ${u.role==='ADMIN'?'badge-role-admin':'badge-role-user'}">${escapeHtml(u.is_owner?'系統管理員（受保護）':roleNames[u.role]||u.role)}</span></td><td data-label="狀態"><span class="badge ${u.status==='ACTIVE'?'badge-status-active':'badge-status-suspended'}">${escapeHtml(statusNames[u.status]||u.status)}</span></td><td data-label="帳戶操作"><div><div class="account-actions">${document.body.dataset.currentOwner==='1'&&!u.is_owner?`<button class="action-btn" type="button" data-id="${Number(u.id)}" data-action="role" ${roleDisabled} aria-label="${escapeHtml(u.name)}：變更角色">${u.role==='ADMIN'?'改為一般':'設為管理者'}</button>`:''}<button class="action-btn ${u.status==='ACTIVE'?'action-btn--danger':''}" type="button" data-id="${Number(u.id)}" data-action="status" ${statusDisabled} aria-label="${escapeHtml(u.name)}：變更狀態">${u.status==='ACTIVE'?'停權帳戶':'啟用帳戶'}</button></div>${self?'<span class="cell-secondary">本人帳戶不可降權或停權</span>':''}</div></td></tr>`;
 }).join('')}</tbody></table>`;
}
function confirmAccount(title,description){const d=$('confirmAction');$('confirmTitle').textContent=title;$('confirmDescription').textContent=description;d.returnValue='';return new Promise(resolve=>{d.addEventListener('close',()=>resolve(d.returnValue==='confirm'),{once:true});d.showModal();});}
async function changeAccount(button){
 if(adminBusy||adminLoading||button.disabled)return;const u=adminUsers.find(u=>Number(u.id)===Number(button.dataset.id));if(!u)return;
 const a=button.dataset.action,next=a==='role'?(u.role==='ADMIN'?'USER':'ADMIN'):(u.status==='ACTIVE'?'SUSPENDED':'ACTIVE'),label=a==='role'?roleNames[next]:statusNames[next];
 const consequence=next==='SUSPENDED'?'此帳戶將無法登入，既有登入狀態也會在下一次請求失效。':next==='USER'?'此帳戶將在下一次請求失去管理功能；一般服務權限依系統規則保留。':next==='ADMIN'?'此帳戶將具有全單位業務及異動審核權限，不能任免管理者或變更系統管理員。':'此帳戶將可重新登入系統。';
 adminBusy=true;
 try{if(!await confirmAccount(`將「${u.name}」${a==='role'?'改為':'設為'}${label}？`,`${u.email}\n${consequence}`))return;
 document.querySelectorAll('[data-action],#btnRefresh').forEach(b=>b.disabled=true);feedback(`正在更新「${u.name}」…`);
 await apiRequest(`/admin/users/set-${a}`,'POST',{user_id:Number(u.id),[a]:next});u[a]=next;feedback(`已將「${u.name}」${a==='role'?'改為':'設為'}${label}。`);await loadUsers();
 }catch(err){feedback(`變更未完成：${err.message}。可重新整理確認最新狀態。`,true);}finally{adminBusy=false;renderUsers();$('btnRefresh').disabled=false;document.querySelector(`[data-id="${Number(u.id)}"][data-action="${a}"]`)?.focus();}
}

function renderOrganizations(){
 const groups=new Map();for(const u of adminUsers){const id=Number(u.organization_id);if(!groups.has(id))groups.set(id,{name:u.organization_name||'未指定單位',users:[]});groups.get(id).users.push(u);}
 $('organizationCards').innerHTML=[...groups].map(([id,g])=>`<button type="button" class="stat-card organization-card" data-org="${id}"><strong>${escapeHtml(g.name)}</strong><div>${g.users.length} 人</div><span>管理者 ${g.users.filter(u=>u.role==='ADMIN').length} · 啟用 ${g.users.filter(u=>u.status==='ACTIVE').length} · 停權 ${g.users.filter(u=>u.status==='SUSPENDED').length}</span></button>`).join('');
 $('organizationCards').onclick=e=>{const b=e.target.closest('[data-org]');if(b){selectedOrganization=Number(b.dataset.org);renderUsers();$('usersContainer').scrollIntoView({behavior:'smooth',block:'start'});}};
}
