/**
 * Path: Public/assets/js/register.js
 * 說明: 帳號申請頁前端行為（送出申請到 /api/applications/create）
 */

document.addEventListener('DOMContentLoaded', () => {
  const form  = document.getElementById('registerForm');
  const msgEl = document.getElementById('registerMessage');

  if (!form) return;

  // 從 <meta name="api-base" content="/api"> 讀取 API base
  const apiBaseMeta = document.querySelector('meta[name="api-base"]');
  const apiBase = apiBaseMeta ? apiBaseMeta.content : '/api';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (msgEl) {
      msgEl.textContent = '';
      msgEl.classList.remove('error', 'success');
    }

    const name   = document.getElementById('name').value.trim();
    const phone  = document.getElementById('phone').value.trim();
    const email  = document.getElementById('email').value.trim();
    const orgId  = document.getElementById('org_id').value;
    const title  = document.getElementById('title').value.trim();

    if (!name || !phone || !email || !orgId) {
      if (msgEl) {
        msgEl.textContent = '請完整填寫必填欄位（姓名、手機、Email、所屬單位）。';
        msgEl.classList.add('error');
      }
      return;
    }

    // 簡單 Email 格式檢查
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      if (msgEl) {
        msgEl.textContent = 'Email 格式看起來不正確，請再確認。';
        msgEl.classList.add('error');
      }
      return;
    }

    const payload = {
      name,
      phone,
      email,
      org_id: orgId,  // 後端會轉成 organization_id
      title,
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
    }
    if (msgEl) {
      msgEl.textContent = '送出中，請稍候…';
      msgEl.classList.add('info');
    }

    try {
      const res = await fetch(apiBase + '/applications/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        const errMsg =
          (data && (data.error || data.message)) ||
          '申請失敗，請稍後再試。';
        if (msgEl) {
          msgEl.textContent = errMsg;
          msgEl.classList.remove('info');
          msgEl.classList.add('error');
        }
        return;
      }

      if (msgEl) {
        msgEl.textContent = '申請已送出，待管理者審核通過後即可使用系統。';
        msgEl.classList.remove('info');
        msgEl.classList.add('success');
      }

      form.reset();
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err && err.message
          ? '發生錯誤：' + err.message
          : '申請失敗，請稍後再試。';
        msgEl.classList.remove('info');
        msgEl.classList.add('error');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  });
});
