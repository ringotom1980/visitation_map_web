<?php
// Public/app.php
declare(strict_types=1);

require __DIR__ . '/partials/head.php';
// 建議在 head.php 裡已經載入 base.css、layout.css 等共用資源
?>

<body class="app-page">
<?php require __DIR__ . '/partials/navbar.php'; ?>
<?php require __DIR__ . '/partials/flash.php'; ?>

<main class="app-main">
  <!-- 上方工具列（標題 + 搜尋列） -->
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
      <!-- 預留：例如之後放篩選、顯示模式等 -->
    </div>
  </header>

  <!-- 主內容：地圖 + 浮動按鈕 + 底部抽屜 -->
  <section class="app-content">
    <div id="map" class="app-map"></div>

    <!-- 右下角浮動按鈕：新增標記 -->
    <button
      id="btn-add-place"
      class="fab fab-primary"
      type="button"
      title="新增標記（點選後在地圖點位置）"
    >
      ＋
    </button>

    <!-- 右下角第二顆 FAB：進入/退出路線規劃模式 -->
    <button
      id="btn-route-mode"
      class="fab fab-secondary"
      type="button"
      title="路線規劃模式"
    >
      🧭
    </button>

    <!-- 底部資訊卡：顯示單一標記詳細資訊（情境 5） -->
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

    <!-- 底部抽屜：路線規劃模式（情境 6） -->
    <div id="sheet-route" class="bottom-sheet bottom-sheet--route">
      <div class="bottom-sheet__inner">
        <header class="bottom-sheet__header">
          <div>
            <div class="bottom-sheet__title">路線規劃</div>
            <div class="bottom-sheet__subtitle" id="route-mode-hint">
              已進入路線規劃模式，請依順序點選要拜訪的地點。
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
            >
              完成規劃
            </button>
            <button
              id="btn-route-open-gmaps"
              type="button"
              class="btn btn-outline"
            >
              用 Google 地圖導航
            </button>
          </div>
        </footer>
      </div>
    </div>

    <!-- 新增/編輯標記表單（情境 3 / 5） -->
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

<!-- Google Maps JS（請依你的環境改成從設定檔取 Key） -->
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY_HERE&libraries=places"></script>

<!-- 共用前端工具 -->
<script src="/assets/js/api.js"></script>
<script src="/assets/js/places.js"></script>
<script src="/assets/js/map.js"></script>
<script src="/assets/js/app.js"></script>
</body>
</html>
