<?php
/**
 * Path: Public/admin/index.php
 * 說明: 管理後台（/admin）— 使用者管理（OTP 模式）
 * - OTP 已涵蓋註冊驗證、忘記密碼
 * - 後台不提供「暫時密碼」重設機制，避免雙軌
 */

declare(strict_types=1);

require_once __DIR__ . '/../../config/auth.php';

require_admin_page();

$pageTitle = APP_NAME . ' - 管理後台';
$pageCss   = ['assets/css/base.css', 'assets/css/admin.css'];
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<?php require __DIR__ . '/../partials/head.php'; ?>
<body class="admin-body">

<header class="admin-header">
  <div class="admin-brand">
    <span class="admin-app-name"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></span>
    <span class="admin-sub">管理後台</span>
  </div>
  <nav class="admin-nav">
    <a href="<?= route_url('app') ?>" class="btn-link">回主地圖</a>
    <a href="<?= route_url('admin') ?>/security" class="btn-link">安全中心</a>
    <button id="btnLogout" class="btn-outline" type="button">登出</button>
  </nav>
</header>

<main class="admin-main">
  <section class="admin-tab-panel active">
    <h2>使用者管理</h2>
    <div id="usersContainer" class="table-wrapper">
      <!-- admin.js 會載入列表 -->
    </div>

    <div class="empty-hint" style="margin-top:10px;">
      密碼復原採 OTP 流程：請使用者至「忘記密碼」頁面自行操作。
    </div>
  </section>
</main>

<script src="<?= asset_url('assets/js/api.js') ?>"></script>
<script src="<?= asset_url('assets/js/admin.js') ?>"></script>
</body>
</html>
