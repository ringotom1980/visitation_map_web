/**
 * Path: Public/assets/js/login.js
 * 說明: 登入頁表單送出行為
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
      // apiRequest 會回傳 json.data，也就是 login.php 裡 json_success 的內容
      const data = await apiRequest('/auth/login', 'POST', { email, password });

      if (msgEl) {
        msgEl.textContent = '登入成功，跳轉中…';
        msgEl.classList.add('success');
      }

      // 後端優先：若有帶 redirect，就用它
      let target = data.redirect;

      // 沒帶 redirect（理論上不會），就退而求其次看 role
      if (!target) {
        if (data.role === 'ADMIN') {
          target = '/admin';
        } else {
          target = '/app';
        }
      }

      window.location.href = target;
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err.message || '登入失敗';
        msgEl.classList.add('error');
      }
    }
  });
});
