// Path: Public/assets/js/device_verify.js
// 說明: 裝置驗證頁（DEVICE OTP）
// - 驗證：POST auth/device_otp_verify {code}
// - 重寄：POST auth/device_otp_request
// - 成功導回 data-return-to（預設 /app）

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function setMsg(text, isOk) {
    var el = $('dv-msg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('ok', 'error', 'info');
    if (!text) return;
    el.classList.add(isOk ? 'ok' : 'error');
  }

  function getReturnTo() {
    var shell = document.querySelector('.login-shell[data-return-to]');
    var rt = shell ? (shell.getAttribute('data-return-to') || '') : '';
    if (rt && rt.charAt(0) === '/' && rt.indexOf('//') !== 0) return rt;
    return '/app';
  }

  function normalizeCode(raw) {
    var s = String(raw || '').trim();
    s = s.replace(/[^\d]/g, '');
    if (s.length > 6) s = s.slice(0, 6);
    return s;
  }

  async function onVerify() {
    var codeEl = $('dv-code');
    var btn = $('dv-verify');

    var code = normalizeCode(codeEl ? codeEl.value : '');
    if (code.length !== 6) {
      setMsg('請輸入 6 位數驗證碼', false);
      return;
    }

    setMsg('', true);
    if (btn) btn.disabled = true;

    try {
      await apiRequest('auth/device_otp_verify', 'POST', { code: code });
      setMsg('驗證成功，正在跳轉…', true);

      window.location.href = getReturnTo();
    } catch (err) {
      setMsg(err && err.message ? err.message : '驗證失敗，請稍後再試。', false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function onResend() {
    var btn = $('dv-resend');
    setMsg('', true);
    if (btn) btn.disabled = true;

    try {
      await apiRequest('auth/device_otp_request', 'POST', {});
      setMsg('驗證碼已重新寄送（10 分鐘內有效）', true);
    } catch (err) {
      setMsg(err && err.message ? err.message : '寄送失敗，請稍後再試。', false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var codeEl = $('dv-code');
    var vBtn = $('dv-verify');
    var rBtn = $('dv-resend');

    if (vBtn) vBtn.addEventListener('click', onVerify);
    if (rBtn) rBtn.addEventListener('click', onResend);

    // Enter 送出
    if (codeEl) {
      codeEl.addEventListener('input', function () {
        codeEl.value = normalizeCode(codeEl.value);
      });
      codeEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onVerify();
        }
      });
      codeEl.focus();
    }
  });

})();
