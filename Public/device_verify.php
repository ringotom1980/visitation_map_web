<?php
/**
 * Path: Public/device_verify.php
 * 說明: 裝置驗證（DEVICE OTP）
 */

require_once __DIR__ . '/../config/auth.php';
require_login();

$pageTitle = APP_NAME . ' - 裝置驗證';
$pageCss   = [
  'assets/css/login.css',        // 若要沿用 login 系列版型
  'assets/css/device_verify.css'
];
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
      <h1 class="login-title">裝置驗證</h1>

      <p class="forgot-note">
        我們已寄送 6 位數驗證碼至您的 Email，請於 10 分鐘內輸入。
      </p>

      <div class="login-form">
        <label class="form-group">
          <span class="form-label">驗證碼</span>
          <input
            type="text"
            id="dv-code"
            inputmode="numeric"
            maxlength="6"
            placeholder="輸入 6 位數字"
          >
        </label>

        <button id="dv-verify" class="btn-primary btn-block">
          驗證裝置
        </button>

        <p class="login-extra">
          <button id="dv-resend" type="button" class="btn-link">
            重新寄送驗證碼
          </button>
        </p>

        <p id="dv-msg" class="login-message"></p>
      </div>
    </main>

    <footer class="login-footer">
      <small>© <?= date('Y') ?> <?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></small>
    </footer>

  </div>

  <!-- JS：完全照 forgot.php 的方式 -->
  <script src="<?= asset_url('assets/js/api.js') ?>"></script>
  <script src="<?= asset_url('assets/js/device_verify.js') ?>"></script>
</body>
</html>
