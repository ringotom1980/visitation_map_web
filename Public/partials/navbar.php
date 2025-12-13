<?php

/**
 * Path: Public/partials/navbar.php
 * 說明: 固定 Header（A3）
 * - Logo
 * - 系統名稱
 * - 目前登入：使用者姓名（由 app.js 取得 /api/auth/me 後填入）
 * - 登出
 */
?>
<header class="app-toolbar">
  <div class="app-toolbar__left">
    <img
      src="<?= asset_url('assets/img/logo.png') ?>"
      alt="Logo"
      style="width:28px;height:28px;border-radius:6px;object-fit:contain;" />
    <h1 class="app-title" style="margin-left:10px;"><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></h1>
  </div>

  <div class="app-toolbar__center">
    <div class="search-bar">
      <input id="map-search-input" class="search-bar__input" placeholder="搜尋地點或地址" autocomplete="off" />

      <button type="button" id="btn-search-go" class="search-bar__btn search-bar__btn--search" aria-label="搜尋">
        🔍
      </button>

      <button type="button" id="btn-search-clear" class="search-bar__btn search-bar__btn--clear" aria-label="清除">
        ✕
      </button>
    </div>

  </div>

  <div class="app-toolbar__right">
    <div id="nav-user" style="font-size:13px;color:#374151;white-space:nowrap;">
      目前登入：<span id="nav-user-name">—</span>
    </div>
    <button id="btn-logout" type="button" class="btn btn-outline">
      登出
    </button>
  </div>
</header>