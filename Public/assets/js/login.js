// Path: Public/assets/js/login.js
// 說明: 登入頁控制器
// - 使用 apiRequest()（回傳整包 JSON：{success, data, error}）
// - 記住帳號：localStorage key=remembered_login（只存 email）
// - 登入成功：若 need_device_verify=true → 導到 /device-verify
//            否則導到 data.redirect（/app 或 /admin）

(function () {
  'use strict';

  var KEY_REMEMBER = 'remembered_login';

  function $(id) { return document.getElementById(id); }

  function setMsg(text, isOk) {
    var el = $('loginMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('ok', 'error', 'info');
    if (!text) return;
    el.classList.add(isOk ? 'ok' : 'error');
  }

  function loadRemembered() {
    var emailEl = $('email');
    var ck = $('rememberEmail');
    if (!emailEl || !ck) return;

    var remembered = '';
    try { remembered = localStorage.getItem(KEY_REMEMBER) || ''; } catch (e) {}

    if (remembered) {
      emailEl.value = remembered;
      ck.checked = true;
    }
  }

  function saveRemembered(email) {
    try { localStorage.setItem(KEY_REMEMBER, email); } catch (e) {}
  }

  function clearRemembered() {
    try { localStorage.removeItem(KEY_REMEMBER); } catch (e) {}
  }

  async function onSubmit(e) {
    e.preventDefault();

    var emailEl = $('email');
    var pwEl = $('password');
    var ck = $('rememberEmail');

    var email = (emailEl ? String(emailEl.value || '').trim() : '');
    var password = (pwEl ? String(pwEl.value || '') : '');

    if (!email || !password) {
      setMsg('請輸入帳號與密碼', false);
      return;
    }

    setMsg('', true);

    try {
      var j = await apiRequest('auth/login', 'POST', { email: email, password: password });
      var data = (j && j.data) ? j.data : null;

      // 記住帳號（只存 email）
      if (ck && ck.checked) saveRemembered(email);
      else clearRemembered();

      if (!data) {
        setMsg('登入回應異常，請稍後再試', false);
        return;
      }

      // 需要裝置驗證
      if (data.need_device_verify) {
        var to = data.redirect || '/device-verify';
        window.location.href = to;
        return;
      }

      // 正常登入成功
      var redirect = data.redirect || '/app';
      window.location.href = redirect;

    } catch (err) {
      setMsg(err && err.message ? err.message : '系統忙碌中，請稍後再試。', false);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = $('loginForm');
    if (form) form.addEventListener('submit', onSubmit);

    loadRemembered();
  });

})();
