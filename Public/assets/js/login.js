/**
 * Path: Public/assets/js/login.js
 * 說明: 登入頁表單送出行為
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msgEl = document.getElementById('loginMessage');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEl.textContent = '';
    msgEl.classList.remove('error', 'success');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      msgEl.textContent = '請輸入帳號與密碼';
      msgEl.classList.add('error');
      return;
    }

    try {
      const data = await apiRequest('/auth/login', 'POST', { email, password });
      msgEl.textContent = '登入成功，跳轉中…';
      msgEl.classList.add('success');

      // 導向 /app
      window.location.href = '/app';
    } catch (err) {
      msgEl.textContent = err.message || '登入失敗';
      msgEl.classList.add('error');
    }
  });
});
