<?php
/**
 * Path: Public/index.php
 * 說明: 登入頁（對外路徑: /login）
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
  <div class="login-wrapper">
    <h1 class="login-title"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></h1>

    <form id="loginForm" class="login-form">
      <label class="form-group">
        <span>帳號（Email）</span>
        <input type="email" name="email" id="email" required>
      </label>

      <label class="form-group">
        <span>密碼</span>
        <input type="password" name="password" id="password" required>
      </label>

      <button type="submit" class="btn-primary">登入</button>

      <p class="login-extra">
        還沒有帳號？<a href="<?= route_url('register') ?>">申請帳號</a>
      </p>

      <p id="loginMessage" class="login-message"></p>
    </form>
  </div>

<?php
// 底部載入 JS
$pageJs = ['assets/js/login.js'];
require __DIR__ . '/partials/footer.php';
?>
</body>
</html>
