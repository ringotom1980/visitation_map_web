/**
 * Path: Public/assets/js/login.js
 * 說明: 登入頁表單送出行為（配合 api.js 回傳整包 JSON）
 */

document.addEventListener('DOMContentLoaded', () => {
  const form  = document.getElementById('loginForm');
  const msgEl = document.getElementById('loginMessage');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (msgEl) {
      msgEl.textContent = '';
      msgEl.classList.remove('error', 'success');
    }

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      if (msgEl) {
        msgEl.textContent = '請輸入帳號與密碼';
        msgEl.classList.add('error');
      }
      return;
    }

    try {
      // ✅ apiRequest 回傳整包 JSON：{ success, data }
      const json = await apiRequest('/auth/login', 'POST', { email, password });
      const data = json && json.data ? json.data : null;

      if (msgEl) {
        msgEl.textContent = '登入成功，跳轉中…';
        msgEl.classList.add('success');
      }

      // 後端優先：若有帶 redirect，就用它
      let target = data && data.redirect ? data.redirect : '';

      // 沒帶 redirect 就看 role
      if (!target) {
        const role = data && data.role ? data.role : '';
        target = (role === 'ADMIN') ? '/admin' : '/app';
      }

      window.location.href = target;
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = (err && err.message) ? err.message : '登入失敗';
        msgEl.classList.add('error');
      }
    }
  });
});
