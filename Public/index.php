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
$loginInfoMessage = '';
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

        <button type="submit" class="btn-primary btn-block">登入</button>
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
  <!-- applied=1 模式B：顯示一次後清掉網址參數 -->
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // 只有登入頁才執行（避免誤觸其他頁面）
      if (!document.body.classList.contains('login-body')) return;

      const url = new URL(window.location.href);

      // 有 applied=1 → 顯示一次後把 URL 參數清除
      if (url.searchParams.has('applied')) {
        // 不重新整理，只改網址列
        url.searchParams.delete('applied');
        window.history.replaceState({}, '', url.pathname);
      }
    });
  </script>

  <!-- 共用 JS + 此頁專屬 JS 都寫在這裡，不再透過 footer.php -->
  <script src="<?= asset_url('assets/js/api.js') ?>"></script>
  <script src="<?= asset_url('assets/js/login.js') ?>"></script>

</body>

</html>