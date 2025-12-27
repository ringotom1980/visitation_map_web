/**
 * Path: Public/assets/js/login.js
 * 說明: 登入頁表單送出行為（配合 api.js 回傳整包 JSON）
 * 定版：
 * - 不再送 device_id；登入回 need_device_verify 時導向 /device-verify
 * - ✅ 記住帳號：localStorage key = remembered_login（只存 email，不存密碼）
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  const msgEl = document.querySelector('#loginMessage, .login-message');
  const emailEl = document.querySelector('input[name="email"], input[type="email"]');
  const rememberEl = document.querySelector('input[name="remember"], input[type="checkbox"]');

  if (!form) return;

  const STORAGE_KEY = 'remembered_login';

  const setMsg = (text, cls) => {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.classList.remove('error', 'success');
    if (cls) msgEl.classList.add(cls);
  };

  // 初始化：回填帳號
  try {
    const remembered = localStorage.getItem(STORAGE_KEY);
    if (remembered && emailEl) {
      emailEl.value = remembered;
      if (rememberEl) rememberEl.checked = true;
    }
  } catch (e) {}

  function persistRememberedEmail(email) {
    try {
      if (rememberEl && rememberEl.checked) {
        localStorage.setItem(STORAGE_KEY, email || '');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {}
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('', null);

    const email = (emailEl?.value || '').trim();
    const password = (document.querySelector('input[type="password"]')?.value || '');

    if (!email || !password) {
      setMsg('請輸入帳號與密碼', 'error');
      return;
    }

    try {
      const json = await apiRequest('auth/login', 'POST', { email, password });
      const data = json?.data || null;

      persistRememberedEmail(email);

      if (data?.need_device_verify) {
        window.location.replace(data.redirect || '/device-verify');
        return;
      }

      let target = data?.redirect || (data?.role === 'ADMIN' ? '/admin' : '/app');
      window.location.replace(target);

    } catch (err) {
      setMsg(err?.message || '登入失敗', 'error');
    }
  });
});
