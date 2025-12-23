/**
 * Path: Public/assets/js/device_verify.js
 * 說明: 裝置驗證頁前端控制器（E2 DEVICE OTP）- 嚴格模式 B
 *
 * 嚴格模式 B：
 * - 未完成驗證前，不允許用「上一頁」回到 /app 或其他頁
 * - 使用者若嘗試離開（尤其按上一頁）→ 提示「尚未完成新裝置驗證，將自動登出」
 *   按確定 → 呼叫 /api/auth/logout → 導回 /login
 *
 * 瀏覽器限制：
 * - 對於 reload/close/輸入其他網址：只能用 beforeunload 觸發原生離開提示，無法保證登出 API 一定送出
 * - 但 /app.php 仍會做 Trusted Device Gate，確保回不去主系統
 */

(function () {
  'use strict';
  function getOrCreateDeviceId() {
    const key = 'vm_device_id';
    let did = localStorage.getItem(key) || '';

    if (!/^[a-f0-9]{64}$/.test(did)) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      did = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(key, did);
    }
    return did;
  }

  function $(id) { return document.getElementById(id); }

  var btnVerify = $('dv-verify');
  var btnResend = $('dv-resend');
  var inputCode = $('dv-code');
  var msg = $('dv-msg');

  // ===== 狀態 =====
  var verified = false;        // 一旦驗證成功就放行，不再攔截離開
  var leaving = false;         // 避免重入
  var lockBack = true;         // 未驗證前鎖住上一頁

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
      // 你現有 logout.php 是 POST /api/auth/logout
      await apiRequest('auth/logout', 'POST', {});
    } catch (e) {
      // 即便 API 失敗，也要硬導回 login（server 端 /app 仍會擋）
    } finally {
      // 確保不會回到 device_verify 或 app（用 replace）
      window.location.replace('/login');
    }
  }

  // ===== 鎖住上一頁：history trap + popstate =====
  function armBackTrap() {
    // 先把目前頁塞進 history，讓 back 先觸發 popstate 而不是直接離開
    try {
      history.replaceState({ dv: 1 }, document.title, location.href);
      history.pushState({ dv: 2 }, document.title, location.href);
    } catch (e) {
      // ignore
    }

    window.addEventListener('popstate', function () {
      if (verified) return;
      if (!lockBack) return;

      // 立刻把頁面推回來，避免真的回到上一頁
      try { history.pushState({ dv: 2 }, document.title, location.href); } catch (e) {}

      var ok = window.confirm('尚未完成新裝置驗證，將自動登出。是否確定？');
      if (ok) {
        forceLogoutToLogin();
      }
      // 取消：留在本頁
    });
  }

  // ===== 其他離開情境：beforeunload（只能原生提示，無法保證登出 API）=====
  function armBeforeUnload() {
    window.addEventListener('beforeunload', function (e) {
      if (verified) return;

      // 觸發瀏覽器原生「是否離開」提示
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
    var code = (inputCode.value || '').trim();

    if (!/^\d{6}$/.test(code)) {
      setMsg('請輸入 6 位數字');
      return;
    }

    try {
      setMsg('驗證中…');

      await apiRequest('auth/device_otp_verify', 'POST', {
  code: code,
  device_id: getOrCreateDeviceId()
});


      // ✅ 成功：解除鎖定 + 放行離開
      verified = true;
      lockBack = false;

      setMsg('驗證成功，正在進入系統…');

      // 用 replace 避免返回 device_verify
      window.location.replace('/app');
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
