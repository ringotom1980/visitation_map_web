/**
 * Path: Public/assets/js/device_verify.js
 * 說明: 裝置驗證頁前端控制器（E2 DEVICE OTP）
 *
 * 功能：
 * - 送出裝置驗證碼（DEVICE OTP verify）
 * - 重新寄送驗證碼（DEVICE OTP request）
 * - 驗證成功後導回 /app
 *
 * 相依：
 * - api.js（apiRequest 封裝）
 *
 * 注意：
 * - apiRequest(path, method, data) 第二參數必須是 HTTP method 字串
 * - 本檔僅處理 UI 與流程，不處理任何風控或驗證邏輯
 */

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var btnVerify = $('dv-verify');
  var btnResend = $('dv-resend');
  var inputCode = $('dv-code');
  var msg = $('dv-msg');

  function setMsg(t) {
    if (msg) msg.textContent = t || '';
  }

  async function resend() {
    try {
      setMsg('寄送中…');

      await apiRequest('auth/device_otp_request', 'POST', {});

      setMsg('已重新寄送');
    } catch (err) {
      setMsg(err && err.message ? err.message : '寄送失敗');
    }
  }

  async function verify() {
    var code = (inputCode.value || '').trim();

    if (!/^\d{6}$/.test(code)) {
      setMsg('請輸入 6 位數字');
      return;
    }

    try {
      setMsg('驗證中…');

      await apiRequest('auth/device_otp_verify', 'POST', {
        code: code
      });

      // 驗證成功 → 進入主系統
      window.location.href = '/app';
    } catch (err) {
      setMsg(err && err.message ? err.message : '驗證失敗');
    }
  }

  if (btnResend) btnResend.addEventListener('click', resend);
  if (btnVerify) btnVerify.addEventListener('click', verify);
})();
