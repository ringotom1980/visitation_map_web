<?php
/**
 * Path: Public/forgot.php
 * 說明: 忘記密碼（寄送 Email OTP）
 */

require_once __DIR__ . '/../config/auth.php';

// 若已登入，仍允許改密碼嗎？這裡採「已登入就回主頁」避免混淆
if (current_user_id()) {
  header('Location: ' . route_url('app'));
  exit;
}

$pageTitle = APP_NAME . ' - 忘記密碼';
$pageCss   = ['assets/css/login.css', 'assets/css/forgot.css'];
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<?php require __DIR__ . '/partials/head.php'; ?>
<body class="login-body">
  <div class="login-shell">

    <header class="login-brand">
      <div class="brand-logo-wrap">
        <img src="<?= asset_url('assets/img/logo128.png') ?>" alt="Logo" class="brand-logo-img">
        <div class="brand-text">
          <div class="brand-name"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></div>
          <div class="brand-sub">遺眷親訪定位與路線規劃工具</div>
        </div>
      </div>
    </header>

    <main class="login-wrapper">
      <h1 class="login-title">忘記密碼</h1>

      <p class="forgot-note">
        請輸入註冊 Email，我們會寄送 6 位數驗證碼（10 分鐘內有效）。
      </p>

      <form id="forgotForm" class="login-form" autocomplete="on">
        <label class="form-group">
          <span class="form-label">Email（登入帳號）</span>
          <input type="email" id="email" name="email" required autocomplete="username" placeholder="name@example.com">
        </label>

        <button type="submit" class="btn-primary btn-block">寄送驗證碼</button>

        <p class="login-extra">
          已想起密碼？<a href="<?= route_url('login') ?>">回登入頁</a>
        </p>

        <p id="forgotMessage" class="login-message"></p>
      </form>
    </main>

    <footer class="login-footer">
      <small>© <?= date('Y') ?> <?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></small>
    </footer>

  </div>

  <script src="<?= asset_url('assets/js/api.js') ?>"></script>
  <script src="<?= asset_url('assets/js/forgot.js') ?>"></script>
</body>
</html>
