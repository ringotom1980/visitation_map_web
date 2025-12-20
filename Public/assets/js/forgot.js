/**
 * Path: Public/assets/js/forgot.js
 * 說明: 忘記密碼（寄送 OTP）
 */

document.addEventListener('DOMContentLoaded', () => {
  const form  = document.getElementById('forgotForm');
  const msgEl = document.getElementById('forgotMessage');
  const emailEl = document.getElementById('email');

  function showMsg(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.classList.remove('error', 'success', 'info');
    if (type) msgEl.classList.add(type);
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (emailEl ? emailEl.value : '').trim();
    if (!email) {
      showMsg('請輸入 Email', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    showMsg('寄送中，請稍候…', 'info');

    try {
      const res = await apiRequest('/auth/forgot_request', 'POST', { email });

      // 後端採「不洩漏帳號存在與否」策略；前端一律導到 reset
      showMsg('驗證碼已寄送（若該 Email 存在且已啟用）。即將前往輸入驗證碼…', 'success');

      const target = '/reset?email=' + encodeURIComponent(email);
      setTimeout(() => {
        window.location.href = target;
      }, 800);

    } catch (err) {
      showMsg(err.message || '寄送失敗，請稍後再試', 'error');
      if (btn) btn.disabled = false;
    }
  });
});
