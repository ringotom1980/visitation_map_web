<?php
/**
 * Path: Public/admin/index.php
 * 說明: 管理後台（/admin）— 申請審核 + 使用者管理
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
    <button id="btnLogout" class="btn-outline">登出</button>
  </nav>
</header>

<main class="admin-main">
  <div class="admin-tabs">
    <button class="admin-tab active" data-tab="applications">待審核申請</button>
    <button class="admin-tab" data-tab="users">已啟用使用者</button>
  </div>

  <section id="tab-applications" class="admin-tab-panel active">
    <h2>待審核申請</h2>
    <div id="applicationsContainer" class="table-wrapper">
      <!-- admin.js 會載入列表 -->
    </div>
  </section>

  <section id="tab-users" class="admin-tab-panel">
    <h2>使用者管理</h2>
    <div id="usersContainer" class="table-wrapper">
      <!-- admin.js 會載入列表 -->
    </div>
  </section>
</main>

<script src="<?= asset_url('assets/js/api.js') ?>"></script>
<script src="<?= asset_url('assets/js/admin.js') ?>"></script>
</body>
</html>
