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
header('Cache-Control: no-store');
$adminUser = current_user();

$pageTitle = APP_NAME . ' - 管理後台';
$pageCss   = ['assets/css/base.css', 'assets/css/admin.css'];
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<?php require __DIR__ . '/../partials/head.php'; ?>
<body class="admin-body" data-current-user-id="<?= (int)$adminUser['id'] ?>">
<a class="skip-link" href="#admin-content">跳至主要內容</a>

<header class="admin-header">
  <div class="admin-brand">
    <span class="admin-app-name"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></span>
    <span class="admin-sub">管理後台</span>
  </div>
  <nav class="admin-nav">
    <a href="<?= route_url('app') ?>" class="btn-link">回主地圖</a>
    <a href="<?= route_url('admin') ?>/transfers.php" class="btn-link">單位異動</a>
    <a href="<?= route_url('admin') ?>/security" class="btn-link">安全中心</a>
    <button id="btnLogout" class="btn-outline" type="button">登出</button>
  </nav>
</header>

<main class="admin-main" id="admin-content">
  <div class="admin-intro">
    <div><p class="eyebrow">服務管理中心</p><h1>管理總覽</h1><p>掌握系統使用情況，管理服務人員的帳戶與存取權限。</p></div>
    <button id="btnRefresh" class="btn-outline" type="button">重新整理</button>
  </div>
  <div id="adminFeedback" class="admin-feedback" role="status" aria-live="polite" hidden></div>
  <section class="admin-tab-panel active">
    <h2>系統概況</h2>
    <div id="adminStats" class="admin-stats">
      <div class="empty-hint">載入中…</div>
    </div>
  </section>

  <section class="admin-tab-panel active">
    <div class="section-heading"><div><h2>帳戶管理</h2><p>依姓名、帳號或單位查找人員，再確認角色與帳戶狀態。</p></div><span id="usersCount" class="result-count" aria-live="polite"></span></div>
    <div class="users-toolbar">
      <label class="search-field">搜尋帳戶<input id="userSearch" type="search" placeholder="姓名、Email、單位或職稱" autocomplete="off"></label>
      <label>角色<select id="roleFilter"><option value="">所有角色</option><option value="ADMIN">管理者</option><option value="USER">一般使用者</option></select></label>
      <label>狀態<select id="statusFilter"><option value="">所有狀態</option><option value="ACTIVE">啟用</option><option value="SUSPENDED">停權</option></select></label>
      <button id="btnClearFilters" class="btn-outline" type="button">清除條件</button>
    </div>
    <div id="usersContainer" class="table-wrapper">
      <!-- admin.js 會載入列表 -->
    </div>

    <div class="empty-hint" style="margin-top:10px;">
      密碼復原採 OTP 流程：請使用者至「忘記密碼」頁面自行操作。
    </div>
  </section>
</main>
<dialog id="confirmAction" class="admin-dialog" aria-labelledby="confirmTitle" aria-describedby="confirmDescription">
  <form method="dialog">
    <p class="eyebrow">帳戶權限變更</p><h2 id="confirmTitle"></h2>
    <p id="confirmDescription"></p>
    <div class="dialog-actions"><button class="btn-outline" value="cancel" autofocus>取消</button><button id="confirmSubmit" class="btn-primary" value="confirm">確認變更</button></div>
  </form>
</dialog>

<script src="<?= asset_url('assets/js/api.js') ?>"></script>
<script src="<?= asset_url('assets/js/admin.js') ?>"></script>
</body>
</html>
