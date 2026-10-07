'use strict';
document.getElementById('personal-form')?.addEventListener('submit',async e=>{
 e.preventDefault();const button=e.target.querySelector('button'),message=document.getElementById('personal-feedback');button.disabled=true;
 try {await apiRequest('/users/update','POST',Object.fromEntries(new FormData(e.target)));message.textContent='個人資料已儲存，不需管理者審核。';}
 catch(error){message.textContent=error.message;}finally{button.disabled=false;}
});
