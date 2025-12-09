/**
 * Path: Public/assets/js/register.js
 * 說明: 帳號申請頁前端行為（送出申請到 /api/applications/create）
 */

document.addEventListener('DOMContentLoaded', () => {
  const form  = document.getElementById('registerForm');
  const msgEl = document.getElementById('registerMessage');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEl.textContent = '';
    msgEl.classList.remove('error', 'success');

    const name   = document.getElementById('name').value.trim();
    const phone  = document.getElementById('phone').value.trim();
    const email  = document.getElementById('email').value.trim();
    const orgId  = document.getElementById('org_id').value;
    const title  = document.getElementById('title').value.trim();

    if (!name || !phone || !email || !orgId) {
      msgEl.textContent = '請完整填寫必填欄位（姓名、電話、Email、所屬單位）。';
      msgEl.classList.add('error');
      return;
    }

    // 很簡單的 email 格式檢查（避免完全錯誤的輸入）
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      msgEl.textContent = 'Email 格式看起來不正確，請再確認。';
      msgEl.classList.add('error');
      return;
    }

    const payload = {
      name,
      phone,
      email,
      org_id: orgId,
      title,
    };

    form.querySelector('button[type="submit"]').disabled = true;

    try {
      await apiRequest('/applications/create', 'POST', payload);
      msgEl.textContent = '申請已送出，待管理者審核通過後即可使用系統。';
      msgEl.classList.add('success');

      // 送出成功後，避免重複送單，可視需要清空表單
      form.reset();
    } catch (err) {
      msgEl.textContent = err.message || '申請失敗，請稍後再試。';
      msgEl.classList.add('error');
    } finally {
      form.querySelector('button[type="submit"]').disabled = false;
    }
  });
});
