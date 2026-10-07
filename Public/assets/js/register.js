/**
 * Path: Public/assets/js/register.js
 * 說明: 註冊流程（Email OTP 版）
 * Flow:
 *   1) 填資料 → POST /api/auth/register_request
 *   2) 顯示 OTP 區 → POST /api/auth/register_verify
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const msgEl = document.getElementById('registerMessage');

  const otpSection = document.getElementById('otpSection');
  const otpInput = document.getElementById('otp');
  const btnVerifyOtp = document.getElementById('btnVerifyOtp');

  if (!form) return;

  function showMsg(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = 'login-message ' + (type || '');
  }

  // === 第一階段：送出註冊資料 ===
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    showMsg('', '');

    const payload = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      organization_id: form.org_id.value,
      title: form.title.value.trim(),
      password: form.password.value,
    };

    try {
      showMsg('驗證碼寄送中，請稍候…', 'info');

      const res = await apiRequest('/auth/register_request', 'POST', payload);

      // 成功 → 顯示 OTP 區塊
      otpSection.hidden = false;
      form.querySelector('button[type="submit"]').disabled = true;

      showMsg('驗證碼已寄送至 Email，請於 10 分鐘內輸入。', 'success');

    } catch (err) {
      showMsg(err.message || '註冊失敗', 'error');
    }
  });

  // === 第二階段：驗證 OTP ===
  btnVerifyOtp.addEventListener('click', async () => {
    const otp = otpInput.value.trim();

    if (!/^\d{6}$/.test(otp)) {
      showMsg('請輸入 6 位數驗證碼', 'error');
      return;
    }

    try {
      showMsg('驗證中，請稍候…', 'info');

      const res = await apiRequest('/auth/register_verify', 'POST', {
        email: form.email.value.trim(),
        otp: otp,
      });

      showMsg('註冊成功，將返回登入頁…', 'success');

      setTimeout(() => {
        window.location.href = '/login?applied=1';
      }, 1500);

    } catch (err) {
      showMsg(err.message || '驗證失敗', 'error');
    }
  });
});
