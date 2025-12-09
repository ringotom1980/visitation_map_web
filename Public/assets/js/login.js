// Public/assets/js/login.js

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msgEl = document.getElementById('loginMessage');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEl.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      msgEl.textContent = '請輸入帳號與密碼';
      msgEl.classList.add('error');
      return;
    }

    try {
      const data = await apiRequest('./api/auth/login.php', 'POST', { email, password });
      msgEl.classList.remove('error');
      msgEl.classList.add('success');
      msgEl.textContent = '登入成功，跳轉中…';

      // 登入成功導到主地圖
      window.location.href = './app.php';
    } catch (err) {
      msgEl.classList.remove('success');
      msgEl.classList.add('error');
      msgEl.textContent = err.message || '登入失敗';
    }
  });
});
