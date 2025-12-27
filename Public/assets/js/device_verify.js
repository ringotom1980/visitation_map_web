/**
 * Path: Public/assets/js/device_verify.js
 * 說明: 裝置驗證頁前端控制器（E2 DEVICE OTP）- 嚴格模式 B
 *
 * 定版重點：
 * - returnTo 從 DOM data-return-to 取得（由 PHP 提供），不依賴 inline script
 * - 未驗證前鎖上一頁（history trap + popstate）+ beforeunload 原生提示
 * - 訊息使用 login.css 的 .login-message + .info/.success/.error（置中一致）
 * - UX：Enter 送出、只允許數字、避免重入、鎖按鈕、自動 focus
 */

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var btnVerify = $('dv-verify');
  var btnResend = $('dv-resend');
  var inputCode = $('dv-code');
  var msg = $('dv-msg');

  // ===== 狀態 =====
  var verified = false;     // 驗證成功後放行
  var leaving = false;      // 避免登出重入
  var lockBack = true;      // 未驗證前鎖上一頁
  var busy = false;         // resend/verify 避免重入

  // returnTo：從 .login-shell[data-return-to] 取得（由 PHP 提供）
  var shell = document.querySelector('.login-shell');
  var returnTo = (shell && shell.getAttribute('data-return-to')) ? shell.getAttribute('data-return-to') : '/app';
  if (!returnTo || returnTo.charAt(0) !== '/' || returnTo.indexOf('//') === 0) {
    returnTo = '/app';
  }

  function setMsg(t, cls) {
    if (!msg) return;
    msg.textContent = t || '';
    // 永遠清掉舊狀態，避免 success 留在下一次錯誤上
    msg.classList.remove('error', 'success', 'info');
    if (cls) msg.classList.add(cls);
  }

  function normalizeErr(err, fallback) {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    return fallback;
  }

  function setBusy(on) {
    busy = !!on;
    if (btnVerify) btnVerify.disabled = busy;
    if (btnResend) btnResend.disabled = busy;
    // disabled 時視覺（login.css 沒做 disabled，這裡用屬性即可）
    if (btnVerify) btnVerify.setAttribute('aria-busy', busy ? 'true' : 'false');
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
    } catch (e) { /* ignore */ }

    window.addEventListener('popstate', function () {
      if (verified) return;
      if (!lockBack) return;

      var ok = window.confirm('尚未完成新裝置驗證，將自動登出。是否確定？');
      if (ok) {
        forceLogoutToLogin();
      } else {
        // 使用者取消：把自己留在本頁（恢復一筆 state）
        try { history.replaceState({ dv: 1 }, document.title, location.href); } catch (e) { }
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

  // ===== 輸入限制：只留數字 + 最多 6 碼 =====
  function sanitizeCodeInput() {
    if (!inputCode) return;
    var v = (inputCode.value || '');
    v = v.replace(/\D/g, '').slice(0, 6);
    if (inputCode.value !== v) inputCode.value = v;
  }

  async function resend() {
    if (busy || verified) return;
    try {
      setBusy(true);
      setMsg('寄送中…', 'info');
      await apiRequest('auth/device_otp_request', 'POST', {});
      setMsg('已重新寄送', 'success');
      if (inputCode) inputCode.focus();
    } catch (err) {
      setMsg(normalizeErr(err, '寄送失敗'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy || verified) return;

    sanitizeCodeInput();
    var code = (inputCode && inputCode.value ? inputCode.value : '').trim();

    if (!/^\d{6}$/.test(code)) {
      setMsg('請輸入 6 位數字', 'error');
      if (inputCode) inputCode.focus();
      return;
    }

    try {
      setBusy(true);
      setMsg('驗證中…', 'info');

      // ✅ 不再送 device_id（後端改用 UA fingerprint）
      await apiRequest('auth/device_otp_verify', 'POST', { code: code });

      verified = true;
      lockBack = false;

      setMsg('驗證成功，正在進入系統…', 'success');

      // 用 replace 避免返回 device_verify
      window.location.replace(returnTo);
    } catch (err) {
      setMsg(normalizeErr(err, '驗證失敗'), 'error');
      if (inputCode) inputCode.focus();
    } finally {
      // 成功會跳轉，這裡跑不到；失敗才會解除
      setBusy(false);
    }
  }

  // ===== init =====
  armBackTrap();
  armBeforeUnload();

  if (inputCode) {
    // 自動聚焦
    setTimeout(function () { try { inputCode.focus(); } catch (e) { } }, 50);

    // 只允許數字 + 最多 6 碼
    inputCode.addEventListener('input', sanitizeCodeInput);

    // Enter 直接驗證
    inputCode.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        verify();
      }
    });
  }

  if (btnResend) btnResend.addEventListener('click', resend);
  if (btnVerify) btnVerify.addEventListener('click', verify);

})();
