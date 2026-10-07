<?php
// Isolated anonymous HTML preview guard; not the production entry.
@ini_set('display_errors', '0');
@ini_set('display_startup_errors', '0');
@ini_set('log_errors', '0');
if (!in_array(strtolower((string)ini_get('display_errors')), ['', '0', 'off', 'false'], true)) {
    http_response_code(503); header('Content-Type: text/plain; charset=utf-8'); echo "Preview unavailable\n"; exit;
}
$previewMethod = $_SERVER['REQUEST_METHOD'] ?? '';
$previewUri = $_SERVER['REQUEST_URI'] ?? '';
if (!in_array($previewMethod, ['GET', 'HEAD'], true) || $previewUri !== '/visitation-release/runtime/Public/index.php' || ($_SERVER['QUERY_STRING'] ?? '') !== '') {
    http_response_code(403); exit;
}
// Do not resume production login/session cookies in this isolated preview.
$_COOKIE = [];
unset($_SERVER['HTTP_COOKIE']);
@ini_set('session.use_only_cookies', '1');
session_id('');
header('Cache-Control: no-store');
set_error_handler(static function (int $severity): bool {
    if (!(error_reporting() & $severity)) { return false; }
    throw new RuntimeException('Preview execution unavailable');
});
$previewBufferLevel = ob_get_level();
ob_start();
try {


/**
 * Path: Public/index.php
 * 說明: 登入頁（對外路徑: /login，手機優先版面）
 */

require_once __DIR__ . '/../config/auth.php';

// The hosting document-root rewrite already sends unmatched routes here.
// Dispatch only these known pages before the login-page redirect. No arbitrary
// filename or path supplied by a request is ever included.
$adminPages = [
    '/admin/accounts' => 'accounts.php', '/admin/accounts/' => 'accounts.php',
    '/admin/accounts.php' => 'accounts.php', '/admin/accounts.php/' => 'accounts.php',
    '/admin/transfers' => 'transfers.php', '/admin/transfers/' => 'transfers.php',
    '/admin/transfers.php' => 'transfers.php', '/admin/transfers.php/' => 'transfers.php',
];
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (isset($adminPages[$requestPath])) {
    require __DIR__ . '/admin/' . $adminPages[$requestPath];
    exit;
}

// 若已登入，直接導向主地圖
if (current_user_id()) {
  header('Location: ' . route_url('app'));
  exit;
}

$pageTitle = APP_NAME . ' - 登入';
$pageCss   = [
  'assets/css/login.css',
  'assets/css/remember_login.css', // ✅ 新增：記住帳號樣式（外掛）
];

$loginInfoMessage = '';
if (isset($_GET['expired'])) {
  $loginInfoMessage = '登入狀態已失效，請重新登入。若帳戶已停權，請聯絡管理者。';
}
if (isset($_GET['applied']) && $_GET['applied'] === '1') {
  $loginInfoMessage = '已送出帳號申請，待管理者審核通過後即可登入';
}

?>
<!DOCTYPE html>
<html lang="zh-Hant">

<?php require __DIR__ . '/partials/head.php'; ?>

<body class="login-body">
  <div class="login-shell">

    <!-- 上方品牌 LOGO -->
    <header class="login-brand">
      <div class="brand-logo-wrap">
        <img src="<?= asset_url('assets/img/logo128.png') ?>" alt="Logo" class="brand-logo-img">
        <div class="brand-text">
          <div class="brand-name"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></div>
          <div class="brand-sub">遺眷親訪定位與路線規劃工具</div>
        </div>
      </div>
    </header>

    <!-- 登入卡片 -->
    <main class="login-wrapper">
      <h1 class="login-title">登入系統</h1>

      <form id="loginForm" class="login-form" method="post" action="<?= route_url('api/auth/login') ?>" autocomplete="on">
        <label class="form-group">
          <span class="form-label">帳號（Email）</span>
          <input
            type="email"
            name="email"
            id="email"
            required
            inputmode="email"
            autocomplete="username"
            placeholder="name@example.com">
        </label>

        <label class="form-group">
          <span class="form-label">密碼</span>
          <input
            type="password"
            name="password"
            id="password"
            required
            autocomplete="current-password"
            placeholder="請輸入密碼">
        </label>

        <!-- ✅ 記住帳號（只存 email 字串，不存密碼） -->
        <div class="remember-row">
          <label class="remember-check">
            <input type="checkbox" id="rememberEmail" />
            <span>記住帳號</span>
          </label>
        </div>

        <button type="submit" class="btn-primary btn-block" disabled>準備登入…</button>
        <noscript><p class="login-message error">請啟用 JavaScript 後重新載入，以使用安全登入流程。</p></noscript>

        <p class="login-extra">
          還沒有帳號？
          <a href="<?= route_url('register') ?>">申請帳號</a>
        </p>
        <p class="login-extra">
          忘記密碼？
          <a href="<?= route_url('forgot') ?>">重設密碼</a>
        </p>

        <p
          id="loginMessage"
          role="status" aria-live="polite"
          class="login-message<?= $loginInfoMessage !== '' ? ' info' : '' ?>">
          <?= $loginInfoMessage !== '' ? htmlspecialchars($loginInfoMessage, ENT_QUOTES, 'UTF-8') : '' ?>
        </p>

      </form>

      <p class="login-extra small">
        帳號有問題無法登入，請聯絡苗栗縣後備指揮部留守科協助
      </p>

    </main>

    <footer class="login-footer">
      <small>© <?= date('Y') ?> <?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></small>
    </footer>

  </div>
  <script src="<?= asset_url('assets/js/api.js') ?>"></script>
  <script src="<?= asset_url('assets/js/login_page.js') ?>"></script>
  <script src="<?= asset_url('assets/js/login.js') ?>"></script>
</body>

</html>

<?php
    ob_end_flush();
} catch (Throwable $previewFailure) {
    while (ob_get_level() > $previewBufferLevel) { ob_end_clean(); }
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Preview unavailable\n";
} finally {
    restore_error_handler();
}
