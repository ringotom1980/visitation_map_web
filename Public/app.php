<?php
/**
 * Path: Public/app.php
 * 說明: 主地圖頁（S1 瀏覽 / S2 路線規劃 / S3 路線完成）— 地圖 + FAB + 底部抽屜 + S3 底部操作條
 */

declare(strict_types=1);

// 先載入設定與 helper
require_once __DIR__ . '/../config/app.php';

// 頁面標題與專用 CSS
$pageTitle = APP_NAME;
$pageCss = [
    'assets/css/layout.css',
    'assets/css/app.css',
];
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<?php require __DIR__ . '/partials/head.php'; ?>

<body class="app-page">
<?php require __DIR__ . '/partials/navbar.php'; ?>
<?php require __DIR__ . '/partials/flash.php'; ?>

<main class="app-main">
  <!-- 上方工具列（標題 + 搜尋列 + 登出） -->
  <header class="app-toolbar">
    <div class="app-toolbar__left">
      <h1 class="app-title">遺眷親訪地圖</h1>
    </div>

    <div class="app-toolbar__center">
      <div class="search-bar">
        <span class="search-bar__icon">🔍</span>
        <input
          id="map-search-input"
          type="text"
          class="search-bar__input"
          placeholder="搜尋地址或地標（僅定位，不自動新增標記）"
          autocomplete="off"
        />
      </div>
    </div>

    <div class="app-toolbar__right">
      <button id="btn-logout" type="button" class="btn btn-outline">
        登出
      </button>
    </div>
  </header>

  <!-- 主內容：地圖 + 浮動按鈕 + 底部抽屜 -->
  <section class="app-content">
    <div id="map" class="app-map"></div>

    <!-- 右下角浮動按鈕：目前位置 -->
    <button
      id="btn-my-location"
      class="fab fab-primary"
      type="button"
      title="移到我現在的位置"
    >
      目前位置
    </button>

    <!-- 右下角第二顆 FAB：進入路線規劃模式（S2） -->
    <button
      id="btn-route-mode"
      class="fab fab-secondary"
      type="button"
      title="路線規劃（加入拜訪點後再進入排序）"
    >
      路線規劃
      <span id="route-badge" class="fab-badge" aria-hidden="true">0</span>
    </button>

    <!-- 底部資訊卡：S1（一般瀏覽模式）專屬 -->
    <div id="sheet-place" class="bottom-sheet bottom-sheet--place">
      <div class="bottom-sheet__inner">
        <header class="bottom-sheet__header">
          <div>
            <div id="sheet-place-name" class="bottom-sheet__title">官兵姓名</div>
            <div id="sheet-place-category" class="bottom-sheet__subtitle">類別</div>
          </div>
          <button
            type="button"
            class="bottom-sheet__close"
            data-sheet-close="sheet-place"
          >
            ✕
          </button>
        </header>

        <div class="bottom-sheet__body">
          <div class="field-row">
            <div class="field-label">地址</div>
            <div id="sheet-place-address" class="field-value">—</div>
          </div>
          <div class="field-row">
            <div class="field-label">訪問對象</div>
            <div id="sheet-place-target" class="field-value">—</div>
          </div>
          <div class="field-row">
            <div class="field-label">備註</div>
            <div id="sheet-place-note" class="field-value">—</div>
          </div>
        </div>

        <footer class="bottom-sheet__footer bottom-sheet__footer--split">
          <button id="btn-place-detail" type="button" class="btn btn-ghost">
            詳細
          </button>
          <div class="bottom-sheet__footer-right">
            <button id="btn-place-edit" type="button" class="btn btn-outline">
              編輯
            </button>
            <button id="btn-place-delete" type="button" class="btn btn-danger">
              刪除
            </button>
          </div>
        </footer>
      </div>
    </div>

    <!-- 底部抽屜：S2（路線規劃模式）固定存在 -->
    <div id="sheet-route" class="bottom-sheet bottom-sheet--route">
      <div class="bottom-sheet__inner">
        <header class="bottom-sheet__header">
          <div>
            <div class="bottom-sheet__title">路線規劃</div>
            <div class="bottom-sheet__subtitle" id="route-mode-hint">
              已進入路線規劃模式，請依順序點選要拜訪的地點（點已加入可移除）。
            </div>
          </div>
          <button id="btn-route-exit" type="button" class="bottom-sheet__link">
            退出規劃
          </button>
        </header>

        <div id="route-list" class="route-list">
          <!-- 由 JS 動態產生每一個路線點 -->
        </div>

        <footer class="bottom-sheet__footer">
          <div class="route-summary">
            <span id="route-distance">距離：—</span>
            <span id="route-duration">時間：—</span>
          </div>
          <div class="bottom-sheet__footer-actions">
            <button
              id="btn-route-commit"
              type="button"
              class="btn btn-primary"
              disabled
            >
              完成規劃
            </button>
          </div>
        </footer>
      </div>
    </div>

    <!-- S3（路線完成／執行模式）底部固定操作區：Google 導航 / 重新規劃 -->
    <div id="route-actions" class="route-actions" aria-hidden="true">
      <button id="btn-route-open-gmaps" type="button" class="btn btn-primary">
        用 Google 地圖導航
      </button>
      <button id="btn-route-replan" type="button" class="btn btn-outline">
        重新規劃
      </button>
    </div>

    <!-- 新增/編輯標記表單 -->
    <div id="modal-place-form" class="modal" aria-hidden="true">
      <div class="modal__backdrop" data-modal-close="modal-place-form"></div>
      <div class="modal__dialog">
        <header class="modal__header">
          <h2 id="modal-place-title" class="modal__title">新增標記</h2>
          <button
            type="button"
            class="modal__close"
            data-modal-close="modal-place-form"
          >
            ✕
          </button>
        </header>

        <div class="modal__body">
          <form id="place-form">
            <input type="hidden" id="place-id" name="id" />

            <div class="form-row">
              <label for="place-soldier-name">官兵姓名（必填）</label>
              <input
                id="place-soldier-name"
                name="soldier_name"
                type="text"
                required
              />
            </div>

            <div class="form-row">
              <label for="place-category">類別</label>
              <select id="place-category" name="category" required>
                <option value="">請選擇</option>
                <option value="DEPENDENT">遺眷</option>
                <option value="DISABLED_VET">身心障礙官兵</option>
                <option value="OTHER">其他</option>
              </select>
            </div>

            <div class="form-row">
              <label for="place-target-name">訪問對象</label>
              <input
                id="place-target-name"
                name="target_name"
                type="text"
              />
            </div>

            <div class="form-row">
              <label for="place-address">地址</label>
              <input
                id="place-address"
                name="address"
                type="text"
                readonly
              />
              <small class="form-help">
                會自動帶入你在地圖上點選的位置（可之後再提供手動修正）。
              </small>
            </div>

            <div class="form-row">
              <label for="place-note">備註</label>
              <textarea
                id="place-note"
                name="note"
                rows="3"
              ></textarea>
            </div>
          </form>
        </div>

        <footer class="modal__footer">
          <button
            type="button"
            class="btn btn-ghost"
            data-modal-close="modal-place-form"
          >
            取消
          </button>
          <button id="btn-place-save" type="button" class="btn btn-primary">
            儲存
          </button>
        </footer>
      </div>
    </div>
  </section>
</main>

<!-- Google Maps JS：取消 async / defer，確保先載入，再跑 map.js / app.js -->
<script
  src="https://maps.googleapis.com/maps/api/js?key=<?= htmlspecialchars(google_maps_key(), ENT_QUOTES) ?>&libraries=places"
></script>

<!-- 共用前端工具（使用 asset_url 自動帶版本號） -->
<script src="<?= asset_url('assets/js/api.js') ?>"></script>
<script src="<?= asset_url('assets/js/places.js') ?>"></script>
<script src="<?= asset_url('assets/js/map.js') ?>"></script>
<script src="<?= asset_url('assets/js/app.js') ?>"></script>
</body>
</html>
