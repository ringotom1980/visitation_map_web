<?php
// Public/index.php = /login

require_once __DIR__ . '/../config/app.php';

// 若已登入，可直接導去 /app
require_once __DIR__ . '/../config/auth.php';
if (current_user_id()) {
    header('Location: ' . BASE_URL . '/app.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <title><?= htmlspecialchars(APP_NAME) ?> - 登入</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/base.css">
  <link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/login.css">
</head>
<body class="login-body">
  <div class="login-wrapper">
    <h1 class="login-title"><?= htmlspecialchars(APP_NAME) ?></h1>

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
        還沒有帳號？<a href="<?= BASE_URL ?>/register.php">申請帳號</a>
      </p>

      <p id="loginMessage" class="login-message"></p>
    </form>
  </div>

  <script src="<?= BASE_URL ?>/assets/js/api.js"></script>
  <script src="<?= BASE_URL ?>/assets/js/login.js"></script>
</body>
</html>
