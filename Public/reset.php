<?php
/**
 * Path: Public/reset.php
 * 說明: 忘記密碼 - 輸入 OTP + 新密碼
 */

require_once __DIR__ . '/../config/auth.php';

if (current_user_id()) {
  header('Location: ' . route_url('app'));
  exit;
}

$email = trim((string)($_GET['email'] ?? ''));

$pageTitle = APP_NAME . ' - 重設密碼';
$pageCss   = ['assets/css/login.css', 'assets/css/reset.css'];
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
      <h1 class="login-title">重設密碼</h1>

      <form id="resetForm" class="login-form" autocomplete="on">
        <label class="form-group">
          <span class="form-label">Email（登入帳號）</span>
          <input type="email" id="email" name="email" required autocomplete="username"
                 value="<?= htmlspecialchars($email, ENT_QUOTES, 'UTF-8') ?>"
                 placeholder="name@example.com">
        </label>

        <label class="form-group">
          <span class="form-label">Email 驗證碼（6 位數）</span>
          <input type="text" id="otp" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" placeholder="請輸入 6 位數驗證碼" required>
        </label>

        <label class="form-group">
          <span class="form-label">新密碼（至少 8 碼）</span>
          <input type="password" id="new_password" autocomplete="new-password" minlength="8" required>
        </label>

        <label class="form-group">
          <span class="form-label">再次輸入新密碼</span>
          <input type="password" id="new_password_confirm" autocomplete="new-password" minlength="8" required>
        </label>

        <button type="submit" class="btn-primary btn-block">驗證並更新密碼</button>

        <p class="login-extra">
          回到 <a href="<?= route_url('login') ?>">登入頁</a>
        </p>

        <p id="resetMessage" class="login-message"></p>
      </form>
    </main>

    <footer class="login-footer">
      <small>© <?= date('Y') ?> <?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></small>
    </footer>

  </div>

  <script src="<?= asset_url('assets/js/api.js') ?>"></script>
  <script src="<?= asset_url('assets/js/reset.js') ?>"></script>
</body>
</html>
