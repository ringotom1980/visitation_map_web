/**
 * Path: Public/assets/js/login.js
 * 說明: 登入頁表單送出行為（配合 api.js 回傳整包 JSON）
 */

document.addEventListener('DOMContentLoaded', () => {
  const form  = document.getElementById('loginForm');
  const msgEl = document.getElementById('loginMessage');
  if (!form) return;

  const setMsg = (text, cls) => {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.classList.remove('error', 'success');
    if (cls) msgEl.classList.add(cls);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('', null);

    const email = (document.getElementById('email')?.value || '').trim();
    const password = (document.getElementById('password')?.value || '');

    if (!email || !password) {
      setMsg('請輸入帳號與密碼', 'error');
      return;
    }

    try {
      // ✅ 直接打 API 實體路徑，避免被前端路由 rewrite
      const json = await apiRequest('auth/login', 'POST', { email, password });
      const data = json && json.data ? json.data : null;

      setMsg('登入成功，跳轉中…', 'success');

      let target = (data && data.redirect) ? data.redirect : '';
      if (!target) {
        const role = data && data.role ? data.role : '';
        target = (role === 'ADMIN') ? '/admin' : '/app';
      }

      window.location.href = target;

    } catch (err) {
      setMsg((err && err.message) ? err.message : '登入失敗', 'error');
    }
  });
});
