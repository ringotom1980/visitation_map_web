/**
 * Path: Public/assets/js/device_verify.js
 * 說明: 裝置驗證頁前端控制器（E2 DEVICE OTP）- 嚴格模式 B
 *
 * 定版改動：
 * - 不再產生/送出 device_id（已全面改用 device_fingerprint）
 * - 驗證成功後導回 window.__DV_RETURN_TO__（由 device_verify.php 提供，預設 /app）
 */

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var btnVerify = $('dv-verify');
  var btnResend = $('dv-resend');
  var inputCode = $('dv-code');
  var msg = $('dv-msg');

  // ===== 狀態 =====
  var verified = false;        // 一旦驗證成功就放行，不再攔截離開
  var leaving = false;         // 避免重入
  var lockBack = true;         // 未驗證前鎖住上一頁

  // returnTo（由 PHP 注入，預設 /app）
  var returnTo = (typeof window.__DV_RETURN_TO__ === 'string' && window.__DV_RETURN_TO__)
    ? window.__DV_RETURN_TO__
    : '/app';

  function setMsg(t) {
    if (msg) msg.textContent = t || '';
  }

  function normalizeErr(err, fallback) {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    return fallback;
  }

  // ===== 登出 + 導回 login（一定用 replace，避免回上一頁又回來）=====
  async function forceLogoutToLogin() {
    if (leaving) return;
    leaving = true;

    try {
      await apiRequest('auth/logout', 'POST', {});
    } catch (e) {
      // ignore
    } finally {
      window.location.replace('/login');
    }
  }

  // ===== 鎖住上一頁：history trap + popstate =====
  function armBackTrap() {
    try {
      history.replaceState({ dv: 1 }, document.title, location.href);
      history.pushState({ dv: 2 }, document.title, location.href);
    } catch (e) {}

    window.addEventListener('popstate', function () {
      if (verified) return;
      if (!lockBack) return;

      try { history.pushState({ dv: 2 }, document.title, location.href); } catch (e) {}

      var ok = window.confirm('尚未完成新裝置驗證，將自動登出。是否確定？');
      if (ok) {
        forceLogoutToLogin();
      }
    });
  }

  // ===== 其他離開情境：beforeunload（只能原生提示，無法保證登出 API）=====
  function armBeforeUnload() {
    window.addEventListener('beforeunload', function (e) {
      if (verified) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
  }

  async function resend() {
    try {
      setMsg('寄送中…');
      await apiRequest('auth/device_otp_request', 'POST', {});
      setMsg('已重新寄送');
    } catch (err) {
      setMsg(normalizeErr(err, '寄送失敗'));
    }
  }

  async function verify() {
    var code = (inputCode && inputCode.value ? inputCode.value : '').trim();

    if (!/^\d{6}$/.test(code)) {
      setMsg('請輸入 6 位數字');
      return;
    }

    try {
      setMsg('驗證中…');

      // ✅ 不再送 device_id（後端改用 UA fingerprint）
      await apiRequest('auth/device_otp_verify', 'POST', { code: code });

      // ✅ 成功：解除鎖定 + 放行離開
      verified = true;
      lockBack = false;

      setMsg('驗證成功，正在進入系統…');

      // 用 replace 避免返回 device_verify
      window.location.replace(returnTo);
    } catch (err) {
      setMsg(normalizeErr(err, '驗證失敗'));
    }
  }

  // ===== init =====
  armBackTrap();
  armBeforeUnload();

  if (btnResend) btnResend.addEventListener('click', resend);
  if (btnVerify) btnVerify.addEventListener('click', verify);
})();
