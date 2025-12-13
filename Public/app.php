<?php

/**
 * Path: Public/app.php
 * 說明: 主地圖頁（S1 瀏覽 / S2 路線規劃 / S3 路線完成）
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/../config/auth.php';

// A2/A3：主頁必須登入
require_login_page();

$pageTitle = APP_NAME;
$pageCss = [
  'assets/css/layout.css',
  'assets/css/app.css',
  'assets/css/map_overlays.css',
];
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<?php require __DIR__ . '/partials/head.php'; ?>

<body class="app-page">
  <?php require __DIR__ . '/partials/navbar.php'; ?>
  <?php require __DIR__ . '/partials/flash.php'; ?>

  <main class="app-main">
    <section class="app-content">
      <div id="map" class="app-map"></div>

      <button
        id="btn-my-location"
        class="fab fab-primary"
        type="button"
        title="移到我現在的位置">
        目前位置
      </button>

      <button
        id="btn-route-mode"
        class="fab fab-secondary"
        type="button"
        title="路線規劃（加入拜訪點後再進入排序）">
        路線規劃
        <span id="route-badge" class="fab-badge" aria-hidden="true">0</span>
      </button>

      <!-- S1 資訊抽屜 -->
      <div id="sheet-place" class="bottom-sheet bottom-sheet--place">
        <div class="bottom-sheet__inner">
          <header class="bottom-sheet__header">
            <div>
              <!-- 依需求：官兵姓名 serviceman_name（類別 category）同一行 -->
              <div class="bottom-sheet__title">
                <span id="sheet-place-serviceman-name">—</span>
                <span class="muted">（<span id="sheet-place-category">—</span>）</span>
              </div>
              <div class="field-row">
                <div class="field-label">撫卹令號</div>
                <div id="sheet-place-condolence-order-no" class="field-value">—</div>
              </div>
            </div>
            <button
              type="button"
              class="bottom-sheet__close"
              data-sheet-close="sheet-place">✕</button>
          </header>

          <div class="bottom-sheet__body">
            <!-- S1：初始滑上來的簡略資訊（依圖1） -->

            <div class="field-row field-row--split">
              <div class="field-col">
                <div class="field-label">受益人</div>
                <div id="sheet-place-visit-name" class="field-value">—</div>
              </div>
              <div class="field-col">
                <div class="field-label">是否 65 歲以上</div>
                <div id="sheet-place-beneficiary-over65" class="field-value">—</div>
              </div>
            </div>

            <div class="field-row field-row--split">
              <div class="field-col">
                <div class="field-label">與官兵關係</div>
                <div id="sheet-place-visit-target" class="field-value">—</div>
              </div>
              <div class="field-col">
                <div class="field-label">列管鄉鎮市區</div>
                <div id="sheet-place-managed-district" class="field-value">—</div>
              </div>
            </div>

            <div class="field-row">
              <div class="field-label">備註</div>
              <div id="sheet-place-note" class="field-value">—</div>
            </div>

            <!-- C2：詳細資訊（預設收合，不跳頁）（依圖2） -->
            <div id="sheet-place-details" class="place-details is-collapsed" aria-hidden="true">
              <div class="place-details__divider"></div>

              <div class="field-row">
                <div class="field-label">列管縣市</div>
                <div id="sheet-place-org-county" class="field-value">—</div>
              </div>

              <div class="field-row">
                <div class="field-label">標記點地址</div>
                <div id="sheet-place-address-text" class="field-value">—</div>
              </div>

              <div class="field-row">
                <div class="field-label">座標</div>
                <div id="sheet-place-latlng" class="field-value">—</div>
              </div>

              <div class="field-row">
                <div class="field-label">最後更新人</div>
                <div id="sheet-place-updated-by-user-id" class="field-value">—</div>
              </div>

              <div class="field-row field-row--split">
                <div class="field-col">
                  <div class="field-label">建立時間</div>
                  <div id="sheet-place-created-at" class="field-value">—</div>
                </div>
                <div class="field-col">
                  <div class="field-label">最後更新</div>
                  <div id="sheet-place-updated-at" class="field-value">—</div>
                </div>
              </div>
            </div>
          </div>

          <footer class="bottom-sheet__footer bottom-sheet__footer--split">
            <button id="btn-place-detail" type="button" class="btn btn-ghost">詳細</button>

            <div class="bottom-sheet__footer-right">
              <button id="btn-place-add-route" type="button" class="btn btn-primary">加入路線</button>
              <button id="btn-place-edit" type="button" class="btn btn-outline">編輯</button>
              <button id="btn-place-delete" type="button" class="btn btn-danger">刪除</button>
            </div>
          </footer>
        </div>
      </div>


      <!-- S2 路線規劃抽屜 -->
      <div id="sheet-route" class="bottom-sheet bottom-sheet--route">
        <div class="bottom-sheet__inner">
          <header class="bottom-sheet__header">
            <div>
              <div class="bottom-sheet__title">路線規劃</div>
              <div class="bottom-sheet__subtitle" id="route-mode-hint">
                已進入路線規劃模式，請依順序點選要拜訪的地點（點已加入可移除）。
              </div>
            </div>
            <button id="btn-route-close" type="button" class="bottom-sheet__close">
              ✕
            </button>

          </header>

          <div id="route-list" class="route-list"></div>

          <footer class="bottom-sheet__footer">
            <div class="route-summary">
              <span id="route-distance">距離：—</span>
              <span id="route-duration">時間：—</span>
            </div>
            <div class="bottom-sheet__footer-actions">
              <button
                id="btn-route-exit"
                type="button"
                class="btn btn-danger">
                退出規劃
              </button>

              <button
                id="btn-route-commit"
                type="button"
                class="btn btn-primary"
                disabled>
                完成規劃
              </button>
            </div>
          </footer>
        </div>
      </div>

      <!-- S3 底部操作 -->
      <div id="route-actions" class="route-actions" aria-hidden="true">
        <button id="btn-route-open-gmaps" type="button" class="btn btn-primary">
          用 Google 地圖導航
        </button>
        <button id="btn-route-replan" type="button" class="btn btn-outline">
          重新規劃
        </button>
      </div>

      <!-- 新增/編輯標記 -->
      <div id="modal-place-form" class="modal" aria-hidden="true">
        <div class="modal__backdrop" data-modal-close="modal-place-form"></div>
        <div class="modal__dialog">
          <header class="modal__header">
            <h2 id="modal-place-title" class="modal__title">新增標記</h2>
            <button type="button" class="modal__close" data-modal-close="modal-place-form">✕</button>
          </header>

          <div class="modal__body">
            <form id="place-form">
              <input type="hidden" id="place-id" name="id" />

              <div class="form-row">
                <label for="place-serviceman-name">官兵姓名（必填）</label>
                <input id="place-serviceman-name" name="serviceman_name" type="text" required />
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
                <label for="place-visit-target">與官兵關係</label>
                <input id="place-visit-target" name="visit_target" type="text" />
              </div>

              <div class="form-row">
                <label for="place-visit-name">實際受訪姓名</label>
                <input id="place-visit-name" name="visit_name" type="text" required />
              </div>

              <div class="form-row">
                <label for="place-condolence-order-no">撫卹令號</label>
                <input id="place-condolence-order-no" name="condolence_order_no" type="text" />
                <small class="form-help">同一撫卹令號可能有多位受益人，所以不做唯一。</small>
              </div>

              <div class="form-row">
                <label for="place-beneficiary-over65">受益人是否 65 歲以上</label>
                <select id="place-beneficiary-over65" name="beneficiary_over65">
                  <option value="N" selected>否</option>
                  <option value="Y">是</option>
                </select>
              </div>

              <div class="form-row">
                <label for="place-managed-district">列管鄉鎮市區</label>
                <input id="place-managed-district" name="managed_district" type="text" />
              </div>

              <div class="form-row">
                <label for="place-address-text">地址</label>
                <input id="place-address-text" name="address_text" type="text" readonly />
                <small class="form-help">會自動帶入你在地圖上點選的位置（可之後再提供手動修正）。</small>
              </div>

              <div class="form-row">
                <label for="place-note">備註</label>
                <textarea id="place-note" name="note" rows="3"></textarea>
              </div>
            </form>
          </div>

          <footer class="modal__footer">
            <button type="button" class="btn btn-ghost" data-modal-close="modal-place-form">取消</button>
            <button id="btn-place-save" type="button" class="btn btn-primary">儲存</button>
          </footer>
        </div>
      </div>
    </section>
  </main>

  <script src="https://maps.googleapis.com/maps/api/js?key=<?= htmlspecialchars(google_maps_key(), ENT_QUOTES) ?>&libraries=places"></script>

  <script src="<?= asset_url('assets/js/api.js') ?>"></script>
  <script src="<?= asset_url('assets/js/places.js') ?>"></script>
  <script src="<?= asset_url('assets/js/map.js') ?>"></script>
  <script src="<?= asset_url('assets/js/app.js') ?>"></script>
</body>

</html>