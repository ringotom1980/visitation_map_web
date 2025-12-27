/**
 * Path: Public/assets/js/login.js
 * 說明: 登入頁表單送出行為（配合 api.js 回傳整包 JSON）
 * 定版：
 * - 不再送 device_id；登入回 need_device_verify 時導向 /device-verify
 * - ✅ 記住帳號：localStorage key = remembered_login（只存 email，不存密碼）
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msgEl = document.getElementById('loginMessage');
  const emailEl = document.getElementById('email');
  const rememberEl = document.getElementById('rememberEmail');

  if (!form) return;

  const STORAGE_KEY = 'remembered_login';

  const setMsg = (text, cls) => {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.classList.remove('error', 'success');
    if (cls) msgEl.classList.add(cls);
  };

  // ✅ 初始化：若有記住的帳號 → 自動回填 + 勾選
  try {
    const remembered = localStorage.getItem(STORAGE_KEY);
    if (remembered && emailEl) {
      emailEl.value = remembered;
      if (rememberEl) rememberEl.checked = true;
    }
  } catch (e) {
    // ignore
  }

  function persistRememberedEmail(email) {
    try {
      if (rememberEl && rememberEl.checked) {
        localStorage.setItem(STORAGE_KEY, email || '');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      // ignore
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('', null);

    const email = (emailEl?.value || '').trim();
    const password = (document.getElementById('password')?.value || '');

    if (!email || !password) {
      setMsg('請輸入帳號與密碼', 'error');
      return;
    }

    try {
      const json = await apiRequest('auth/login', 'POST', { email, password });
      const data = json && json.data ? json.data : null;

      // ✅ 只要登入成功（含需要裝置驗證）就寫入/清除記住帳號
      persistRememberedEmail(email);

      // ✅ 若需要裝置驗證 → 直接導向 device-verify（不要進 app/admin）
      if (data && data.need_device_verify) {
        const target = data.redirect || '/device-verify';
        setMsg('需要裝置驗證，跳轉中…', 'success');
        window.location.replace(target);
        return;
      }

      setMsg('登入成功，跳轉中…', 'success');

      let target = (data && data.redirect) ? data.redirect : '';
      if (!target) {
        const role = data && data.role ? data.role : '';
        target = (role === 'ADMIN') ? '/admin' : '/app';
      }

      window.location.replace(target);

    } catch (err) {
      // 登入失敗：不改記住帳號（避免輸錯密碼就把舊記住的覆蓋掉）
      setMsg((err && err.message) ? err.message : '登入失敗', 'error');
    }
  });
});
