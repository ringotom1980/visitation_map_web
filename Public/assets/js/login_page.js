// Path: Public/assets/js/login_page.js
// 說明: 登入頁專用（外掛）
// - applied=1 顯示一次後清掉 URL 參數（不 reload）
// - 僅在 login-body 頁面生效

document.addEventListener('DOMContentLoaded', function () {
  if (!document.body || !document.body.classList.contains('login-body')) return;

  try {
    var url = new URL(window.location.href);
    if (url.searchParams.has('applied')) {
      url.searchParams.delete('applied');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  } catch (e) {
    // ignore
  }
});
