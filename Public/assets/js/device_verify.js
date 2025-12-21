(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var btnVerify = $('dv-verify');
  var btnResend = $('dv-resend');
  var inputCode = $('dv-code');
  var msg = $('dv-msg');

  function setMsg(t) { msg.textContent = t || ''; }

  async function resend() {
    setMsg('寄送中...');
    var j = await apiRequest('/api/auth/device_otp_request', { method: 'POST', body: {} });
    if (!j || !j.success) {
      setMsg((j && j.error) ? j.error : '寄送失敗');
      return;
    }
    setMsg('已重新寄送');
  }

  async function verify() {
    var code = (inputCode.value || '').trim();
    if (!/^\d{6}$/.test(code)) {
      setMsg('請輸入 6 位數字');
      return;
    }

    setMsg('驗證中...');
    var j = await apiRequest('/api/auth/device_otp_verify', { method: 'POST', body: { code: code } });
    if (!j || !j.success) {
      setMsg((j && j.error) ? j.error : '驗證失敗');
      return;
    }

    // 成功 → 回 app（或你要導回登入前目標也可擴充）
    window.location.href = '/app';
  }

  btnResend.addEventListener('click', resend);
  btnVerify.addEventListener('click', verify);
})();
