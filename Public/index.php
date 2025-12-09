<?php
/**
 * Path: Public/index.php
 * 說明: 登入頁（對外路徑: /login，手機優先版面）
 */

require_once __DIR__ . '/../config/auth.php';

// 若已登入，直接導向主地圖
if (current_user_id()) {
    header('Location: ' . route_url('app'));
    exit;
}

$pageTitle = APP_NAME . ' - 登入';
$pageCss   = ['assets/css/login.css'];
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<?php require __DIR__ . '/partials/head.php'; ?>
<body class="login-body">
  <div class="login-shell">
    <!-- 上方品牌區：LOGO + 系統名稱 -->
    <header class="login-brand">
  <div class="brand-logo-wrap">
    <img src="<?= asset_url('assets/img/logo.png') ?>" alt="Logo" class="brand-logo-img">
    <div class="brand-text">
      <div class="brand-name"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></div>
      <div class="brand-sub">遺眷親訪定位與路線規劃工具</div>
    </div>
  </div>
</header>


    <!-- 中間登入卡片 -->
    <main class="login-wrapper">
      <h1 class="login-title">登入系統</h1>

      <form id="loginForm" class="login-form" autocomplete="on">
        <label class="form-group">
          <span class="form-label">帳號（Email）</span>
          <input
            type="email"
            name="email"
            id="email"
            required
            inputmode="email"
            autocomplete="username"
            placeholder="name@example.com"
          >
        </label>

        <label class="form-group">
          <span class="form-label">密碼</span>
          <input
            type="password"
            name="password"
            id="password"
            required
            autocomplete="current-password"
            placeholder="請輸入密碼"
          >
        </label>

        <button type="submit" class="btn-primary btn-block">登入</button>

        <p class="login-extra">
          還沒有帳號？
          <a href="<?= route_url('register') ?>">申請帳號</a>
        </p>

        <p id="loginMessage" class="login-message"></p>
      </form>
    </main>

    <!-- 底部小版權（手機優先） -->
    <footer class="login-footer">
      <small>© <?= date('Y') ?> <?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></small>
    </footer>
  </div>

<?php
$pageJs = ['assets/js/login.js'];
require __DIR__ . '/partials/footer.php';
?>
</body>
</html>
