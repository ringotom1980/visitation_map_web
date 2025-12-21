<?php
/**
 * Path: Public/admin/auth_security.php
 * 說明: 安全中心（節流/封鎖 + 稽核事件）管理頁
 * 權限: ADMIN
 */

declare(strict_types=1);

require_once __DIR__ . '/../../config/auth.php';

require_admin_page();

$pageTitle = APP_NAME . ' - 安全中心';
$pageCss   = ['assets/css/base.css', 'assets/css/admin.css'];
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<?php require __DIR__ . '/../partials/head.php'; ?>
<body class="admin-body">

<header class="admin-header">
  <div class="admin-brand">
    <span class="admin-app-name"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></span>
    <span class="admin-sub">安全中心</span>
  </div>

  <nav class="admin-nav">
    <a href="<?= route_url('admin') ?>" class="btn-link">回管理後台</a>
    <a href="<?= route_url('app') ?>" class="btn-link">回主地圖</a>
    <button id="btnLogout" class="btn-outline" type="button">登出</button>
  </nav>
</header>

<main class="admin-main">

  <div class="admin-tabs">
    <button class="admin-tab active" type="button" data-tab="throttles">節流/封鎖</button>
    <button class="admin-tab" type="button" data-tab="events">稽核事件</button>
  </div>

  <!-- 節流/封鎖 -->
  <section id="tab-throttles" class="admin-tab-panel active">
    <h2>節流 / 封鎖</h2>

    <div class="table-wrapper" style="margin-bottom: 10px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <input id="qT" type="text" placeholder="搜尋 action / email / ip"
               style="flex:1 1 220px; min-width: 200px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:10px; background:#f9fafb;">
        <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#4b5563;">
          <input type="checkbox" id="onlyBlocked" checked>
          只看目前封鎖
        </label>

        <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#4b5563;">
          筆數
          <select id="limitT" style="padding:7px 10px; border:1px solid #e5e7eb; border-radius:10px; background:#fff;">
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200" selected>200</option>
            <option value="500">500</option>
          </select>
        </label>

        <button id="btnSearchT" type="button" class="btn-outline">查詢</button>
        <button id="btnRefreshT" type="button" class="btn-outline">重新整理</button>
      </div>

      <div id="hintThrottles" class="empty-hint" style="display:none; padding:10px 4px 2px;"></div>
    </div>

    <div class="table-wrapper" id="wrapThrottles">
      <!-- JS 會塞 table -->
    </div>
  </section>

  <!-- 稽核事件 -->
  <section id="tab-events" class="admin-tab-panel">
    <h2>稽核事件</h2>

    <div class="table-wrapper" style="margin-bottom: 10px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <input id="qE" type="text" placeholder="搜尋 event_type / email / ip / detail"
               style="flex:1 1 220px; min-width: 200px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:10px; background:#f9fafb;">

        <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#4b5563;">
          類型
          <select id="typeE" style="padding:7px 10px; border:1px solid #e5e7eb; border-radius:10px; background:#fff;">
            <option value="">（全部）</option>
            <option value="LOGIN_OK">LOGIN_OK</option>
            <option value="LOGIN_FAIL">LOGIN_FAIL</option>
            <option value="REGISTER_OK">REGISTER_OK</option>
            <option value="REGISTER_FAIL">REGISTER_FAIL</option>
            <option value="REGISTER_OTP_SENT">REGISTER_OTP_SENT</option>
            <option value="REGISTER_VERIFY_FAIL">REGISTER_VERIFY_FAIL</option>
            <option value="RESET_OK">RESET_OK</option>
            <option value="RESET_FAIL">RESET_FAIL</option>
            <option value="RESET_OTP_SENT">RESET_OTP_SENT</option>
            <option value="RESET_VERIFY_FAIL">RESET_VERIFY_FAIL</option>
            <option value="RISK_BLOCK">RISK_BLOCK</option>
          </select>
        </label>

        <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#4b5563;">
          筆數
          <select id="limitE" style="padding:7px 10px; border:1px solid #e5e7eb; border-radius:10px; background:#fff;">
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200" selected>200</option>
            <option value="500">500</option>
          </select>
        </label>

        <button id="btnSearchE" type="button" class="btn-outline">查詢</button>
        <button id="btnRefreshE" type="button" class="btn-outline">重新整理</button>
      </div>

      <div id="hintEvents" class="empty-hint" style="display:none; padding:10px 4px 2px;"></div>
    </div>

    <div class="table-wrapper" id="wrapEvents">
      <!-- JS 會塞 table -->
    </div>
  </section>

</main>

<script src="<?= asset_url('assets/js/api.js') ?>"></script>
<script src="<?= asset_url('assets/js/admin_auth_security.js') ?>"></script>
</body>
</html>
