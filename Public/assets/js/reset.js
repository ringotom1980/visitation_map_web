/**
 * Path: Public/assets/js/reset.js
 * 說明: 忘記密碼 - 驗 OTP + 更新密碼
 */

document.addEventListener('DOMContentLoaded', () => {
  const form  = document.getElementById('resetForm');
  const msgEl = document.getElementById('resetMessage');

  const emailEl = document.getElementById('email');
  const otpEl   = document.getElementById('otp');
  const pwEl    = document.getElementById('new_password');
  const pw2El   = document.getElementById('new_password_confirm');

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
    const otp   = (otpEl ? otpEl.value : '').trim();
    const pw    = (pwEl ? pwEl.value : '');
    const pw2   = (pw2El ? pw2El.value : '');

    if (!email || !otp || !pw || !pw2) {
      showMsg('請完整填寫 Email、驗證碼與新密碼', 'error');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      showMsg('驗證碼格式不正確（需為 6 位數字）', 'error');
      return;
    }
    if (pw.length < 8) {
      showMsg('新密碼長度至少需 8 碼', 'error');
      return;
    }
    if (pw !== pw2) {
      showMsg('兩次輸入的新密碼不一致', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    showMsg('驗證中，請稍候…', 'info');

    try {
      const res = await apiRequest('/auth/forgot_verify', 'POST', {
        email,
        otp,
        new_password: pw,
        new_password_confirm: pw2
      });

      const redirect = (res && res.data && res.data.redirect) ? res.data.redirect : '/login?reset=1';

      showMsg('密碼已更新，將回登入頁…', 'success');
      setTimeout(() => {
        window.location.href = redirect;
      }, 900);

    } catch (err) {
      showMsg(err.message || '更新失敗，請稍後再試', 'error');
      if (btn) btn.disabled = false;
    }
  });
});
