// Path: Public/assets/js/app.js
// 說明: 主地圖頁前端控制器 — 三態狀態機（S1/S2/S3）、抽屜/Modal、路線點管理、Google 導航與重新規劃
// C｜S1 資訊抽屜：
// - C1：點 marker 打開抽屜（簡略資訊）
// - C2：詳細資訊展開/收合（不跳頁）
// - C3：抽屜動作：加入路線/編輯/刪除（S2 禁止 edit/delete，S3 禁止加入路線）

document.addEventListener('DOMContentLoaded', function () {
  var Mode = {
    BROWSE: 'BROWSE',
    ROUTE_PLANNING: 'ROUTE_PLANNING',
    ROUTE_READY: 'ROUTE_READY'
  };

  var state = {
    mode: Mode.BROWSE,
    currentPlace: null,
    placesCache: [],
    routePoints: [],
    me: null,
    fallbackCenter: null
  };
  var __initialCentered = false;

  // ===== 篩選模組事件：集中在這裡發送（不要散落各處）=====
  function emitRouteChanged() {
    document.dispatchEvent(new CustomEvent('route:changed', {
      detail: { routePoints: state.routePoints || [] }
    }));
  }

  function emitModeChanged() {
    document.dispatchEvent(new CustomEvent('mode:changed', {
      detail: { mode: state.mode }
    }));
  }

  var myLocationPoint = null;

  var sheetPlace = document.getElementById('sheet-place');
  var sheetPoi = document.getElementById('sheet-poi');

  var btnMyLocation = document.getElementById('btn-my-location');
  var btnRouteMode = document.getElementById('btn-route-mode');
  var btnRouteExit = document.getElementById('btn-route-exit');
  var btnRouteCommit = document.getElementById('btn-route-commit');

  var btnRouteOpenGmaps = document.getElementById('btn-route-open-gmaps');
  var btnRouteReplan = document.getElementById('btn-route-replan');

  var btnPlaceSave = document.getElementById('btn-place-save');
  var btnPlaceEdit = document.getElementById('btn-place-edit');
  var btnPlaceDelete = document.getElementById('btn-place-delete');
  var btnPlaceAddRoute = document.getElementById('btn-place-add-route');
  var btnPlaceDetail = document.getElementById('btn-place-detail');

  var btnLogout = document.getElementById('btn-logout');

  var routeListEl = document.getElementById('route-list');
  var routeBadgeEl = document.getElementById('route-badge');
  var routeActionsEl = document.getElementById('route-actions');

  var navUserNameEl = document.getElementById('nav-user-name');

  // 詳細區 DOM
  var detailsWrap = document.getElementById('sheet-place-details');

  // ===== 可調的焦聚安全距離（marker 與抽屜上緣的距離）=====
  // 單位：px，你之後只要改這個數字
  var FOCUS_GAP_PX = 32;

  // ====== FIX: 動態設定 toolbar 高度，給 FAB 定位用 ======
  (function syncToolbarHeight() {
    var toolbar = document.querySelector('.app-toolbar');
    if (!toolbar) return;

    function apply() {
      var h = toolbar.getBoundingClientRect().height || toolbar.offsetHeight || 64;
      document.documentElement.style.setProperty('--toolbar-h', Math.ceil(h) + 'px');
    }

    apply();
    window.addEventListener('resize', apply, { passive: true });
    window.addEventListener('orientationchange', apply, { passive: true });
    setTimeout(apply, 250);
  })();

  // ===== FIX: mobile 100vh 不準（特別是 iOS/LINE 內建瀏覽器）=====
  (function syncViewportVh() {
    function apply() {
      var vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
    }
    apply();
    window.addEventListener('resize', apply, { passive: true });
    window.addEventListener('orientationchange', apply, { passive: true });
  })();

  if (typeof MapModule === 'undefined') {
    console.error('MapModule 未定義，請確認 map.js 是否有正確載入。');
    return;
  }

  // ✅ 必須先初始化地圖，否則 #map 會是空的（沒有 .gm-style）
  MapModule.init({
    onSearchPlaceSelected: handleSearchPlaceSelected,
    onMapLongPressForNewPlace: handleMapLongPressForNewPlace
  });

  // ✅ 初始化鏡頭聚焦模組（FocusCamera）
  if (window.FocusCamera && typeof window.FocusCamera.init === 'function') {
    window.FocusCamera.init({
      MapModule: MapModule,
      focusZoom: 16
    });
  }

  if (window.PlaceForm) {
    PlaceForm.init({ MapModule: MapModule, PlacesApi: PlacesApi, apiRequest: apiRequest });
  }

  // ✅ 初始化「更新座標」模組（PlaceCoordUpdate）
  if (window.PlaceCoordUpdate && typeof window.PlaceCoordUpdate.init === 'function') {
    window.PlaceCoordUpdate.init({
      PlacesApi: window.PlacesApi || PlacesApi,
      PlaceForm: window.PlaceForm
    });
  }

  // ===== 搜尋列（Google Map 風格）：放大鏡搜尋 + 動態 X 清除 =====
  (function bindSearchBarUX() {
    var input = document.getElementById('map-search-input');
    var btnGo = document.getElementById('btn-search-go');
    var btnClear = document.getElementById('btn-search-clear');
    if (!input) return;
    // ===== 本地優先：先命中「我自己的標註點」(placesCache) =====
    function norm(s) {
      return String(s || '').trim().toLowerCase();
    }

    function placeTextBundle(p) {
      if (!p) return '';
      // 你自己的點：把最常搜的欄位全部串起來做比對
      return norm([
        p.serviceman_name, p.soldier_name,
        p.visit_name,
        p.visit_target, p.target_name,
        p.address_text, p.address,
        p.condolence_order_no,
        p.managed_district,
        p.note,
        p.category, p.category_label,
        p.organization_name, p.organization_county
      ].join(' '));
    }

    function scoreMatch(q, text) {
      // 分數越高越優先
      if (!q || !text) return 0;
      if (text === q) return 1000;           // 完全相等
      if (text.indexOf(q) === 0) return 700; // 前綴命中
      var idx = text.indexOf(q);
      if (idx >= 0) return 300 - Math.min(idx, 100); // 越前面越好
      return 0;
    }

    function findBestLocalPlace(query) {
      var q = norm(query);
      if (!q) return null;
      if (!Array.isArray(state.placesCache) || state.placesCache.length === 0) return null;

      var best = null;
      var bestScore = 0;

      for (var i = 0; i < state.placesCache.length; i++) {
        var p = state.placesCache[i];
        var text = placeTextBundle(p);
        var s = scoreMatch(q, text);

        // 額外加權：官兵姓名/受益人/地址「精準命中」更優先
        var sName = scoreMatch(q, norm(p && (p.serviceman_name || p.soldier_name)));
        var sVisit = scoreMatch(q, norm(p && p.visit_name));
        var sAddr = scoreMatch(q, norm(p && (p.address_text || p.address)));
        s = Math.max(s, sName + 200, sVisit + 150, sAddr + 100);

        if (s > bestScore) {
          bestScore = s;
          best = p;
        }
      }

      // 門檻：避免打「一」也亂命中
      if (bestScore < 250) return null;
      return best;
    }

    function focusAndOpenMyPlace(place) {
      if (!place) return;

      closeSheet('sheet-poi');

      state.currentPlace = place;
      fillPlaceSheet(place);
      collapsePlaceDetails(true);

      // ✅ 聚焦放大統一交給 FocusCamera（抽出去的目的）
      if (window.FocusCamera && typeof window.FocusCamera.focusToPlace === 'function') {
        window.FocusCamera.focusToPlace(place);
      } else if (MapModule && typeof MapModule.panToLatLng === 'function') {
        var lat = (place.lat !== undefined && place.lat !== null) ? Number(place.lat) : null;
        var lng = (place.lng !== undefined && place.lng !== null) ? Number(place.lng) : null;
        if (isFinite(lat) && isFinite(lng)) MapModule.panToLatLng(lat, lng, 16);
      }

      // 再打開抽屜
      openSheet('sheet-place');

      // 抽屜打開後，把點對齊到「抽屜上緣」
      alignMyPlaceAfterSheetOpen(place, sheetPlace);
    }

    // ===== 我的點下拉候選（顯示在 Google pac-container 之前）=====
    var suggestWrap = null;
    var suggestOpen = false;
    var suggestItems = [];
    var activeIndex = -1;

    function ensureSuggestWrap() {
      if (suggestWrap) return suggestWrap;

      // search-bar 是 position:relative，可直接把 dropdown 掛在裡面
      var bar = input.closest ? input.closest('.search-bar') : null;
      if (!bar) return null;

      suggestWrap = document.createElement('div');
      suggestWrap.className = 'my-suggest';
      suggestWrap.setAttribute('aria-hidden', 'true');
      suggestWrap.style.display = 'none';

      // 用 mousedown/pointerdown 阻止 blur，避免點候選時 input 先失焦導致列表關閉
      suggestWrap.addEventListener('pointerdown', function (e) {
        e.preventDefault();
      });

      bar.appendChild(suggestWrap);
      return suggestWrap;
    }

    function buildLocalSuggestions(query) {
      var q = norm(query);
      if (!q) return [];

      if (!Array.isArray(state.placesCache) || state.placesCache.length === 0) return [];

      var out = [];
      for (var i = 0; i < state.placesCache.length; i++) {
        var p = state.placesCache[i];
        var text = placeTextBundle(p);
        var s = scoreMatch(q, text);

        // 欄位加權（你原本邏輯沿用）
        var sName = scoreMatch(q, norm(p && (p.serviceman_name || p.soldier_name)));
        var sVisit = scoreMatch(q, norm(p && p.visit_name));
        var sAddr = scoreMatch(q, norm(p && (p.address_text || p.address)));
        s = Math.max(s, sName + 200, sVisit + 150, sAddr + 100);

        // 門檻：避免打「一」就亂跳
        if (s >= 250) out.push({ p: p, score: s });
      }

      out.sort(function (a, b) { return b.score - a.score; });
      // 顯示前 N 筆即可
      return out.slice(0, 6).map(function (x) { return x.p; });
    }

    function getPrimaryTitle(p) {
      // 主要顯示：官兵姓名 / 受益人 / 類別
      var a = (p.serviceman_name || p.soldier_name || '').trim();
      var b = (p.visit_name || '').trim();
      var c = (p.category_label || p.category || '').trim();

      var t = a;
      if (b) t += '｜' + b;
      if (c) t += '（' + c + '）';
      return t || '（未命名）';
    }

    function getSubTitle(p) {
      // 次要顯示：地址 / 行政區 / 慰問令
      var addr = (p.address_text || p.address || '').trim();
      var md = (p.managed_district || '').trim();
      var co = (p.condolence_order_no || '').trim();

      var parts = [];
      if (addr) parts.push(addr);
      if (md) parts.push(md);
      if (co) parts.push('撫卹令:' + co);

      return parts.join(' ｜ ') || '';
    }

    function openSuggest() {
      var el = ensureSuggestWrap();
      if (!el) return;
      suggestOpen = true;
      el.style.display = 'block';
      el.setAttribute('aria-hidden', 'false');
    }

    function closeSuggest() {
      if (!suggestWrap) return;
      suggestOpen = false;
      suggestItems = [];
      activeIndex = -1;
      suggestWrap.innerHTML = '';
      suggestWrap.style.display = 'none';
      suggestWrap.setAttribute('aria-hidden', 'true');
      arbitratePacByState(); // ★關閉我的候選後，重新決定 Google 是否可顯示
    }

    function setActive(idx) {
      activeIndex = idx;
      if (!suggestWrap) return;

      var nodes = suggestWrap.querySelectorAll('.my-suggest__item');
      for (var i = 0; i < nodes.length; i++) {
        if (i === activeIndex) nodes[i].classList.add('is-active');
        else nodes[i].classList.remove('is-active');
      }
    }

    function renderSuggest(list) {
      var el = ensureSuggestWrap();
      if (!el) return;

      suggestItems = Array.isArray(list) ? list : [];
      el.innerHTML = '';

      if (suggestItems.length === 0) {
        closeSuggest();
        return;
      }

      openSuggest();

      for (var i = 0; i < suggestItems.length; i++) {
        (function (idx) {
          var p = suggestItems[idx];

          var item = document.createElement('div');
          item.className = 'my-suggest__item';
          item.setAttribute('role', 'option');

          var title = document.createElement('div');
          title.className = 'my-suggest__title';
          title.textContent = getPrimaryTitle(p);

          var sub = document.createElement('div');
          sub.className = 'my-suggest__sub';
          sub.textContent = getSubTitle(p);

          item.appendChild(title);
          if (sub.textContent) item.appendChild(sub);

          item.addEventListener('click', function () {
            finalizeAfterMyPlaceChosen();
            focusAndOpenMyPlace(p);
          });

          el.appendChild(item);
        })(i);
      }

      // 預設不主動選中任何一筆（避免 Enter 直接跳）
      setActive(-1);
      arbitratePacByState(); // ★渲染完立刻仲裁 Google 選單顯示
    }

    function refreshSuggestByInput() {
      // 只在 focus 且有輸入時顯示（可依你喜好改成 focus 就顯示）
      var q = (input.value || '').trim();
      if (!q) {
        closeSuggest();
        return;
      }
      var list = buildLocalSuggestions(q);
      renderSuggest(list);
    }

    // ===== Google pac-container 顯示仲裁（關鍵修正）=====
    var MIN_GOOGLE_CHARS = 2; // 你想更保守就改 3
    // ===== 固定窗：短時間壓住 Google pac-container（避免選完又被打開）=====
    var __pacSuppressedUntil = 0;
    var __pacSuppressTimer = null;

    function suppressGooglePacFor(ms) {
      var dur = Number(ms || 750);
      if (!isFinite(dur) || dur < 0) dur = 750;

      __pacSuppressedUntil = Date.now() + dur;

      // 立刻關一次 + 多壓一拍
      setGooglePacVisible(false);

      // 期間內持續補刀（Google 可能下一拍又打開）
      if (__pacSuppressTimer) clearTimeout(__pacSuppressTimer);

      // 先在 80~120ms 補一次，再在結束前補一次
      __pacSuppressTimer = setTimeout(function () {
        setGooglePacVisible(false);

        var remain = __pacSuppressedUntil - Date.now();
        if (remain > 50) {
          setTimeout(function () {
            setGooglePacVisible(false);
          }, Math.min(remain, 900));
        }
      }, 100);
    }

    function isGooglePacSuppressed() {
      return Date.now() < __pacSuppressedUntil;
    }

    function raf2(fn) {
      requestAnimationFrame(function () {
        requestAnimationFrame(fn);
      });
    }

    function setGooglePacVisible(visible) {
      var nodes = document.querySelectorAll('.pac-container');
      nodes.forEach(function (el) {
        el.style.display = visible ? '' : 'none';
        el.style.visibility = visible ? '' : 'hidden';
        el.style.pointerEvents = visible ? '' : 'none';
      });

      if (!visible) raf2(function () {
        document.querySelectorAll('.pac-container').forEach(function (el) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.pointerEvents = 'none';
        });
      });
    }

    function arbitratePacByState() {
      var q = (input.value || '').trim();
      // 規則 0：固定窗壓制中 → Google 一律關閉
      if (isGooglePacSuppressed()) {
        setGooglePacVisible(false);
        return;
      }

      // 規則 1：我的候選開著且有資料 → Google 一律關閉（避免重疊）
      if (suggestOpen && Array.isArray(suggestItems) && suggestItems.length > 0) {
        setGooglePacVisible(false);
        return;
      }

      // 規則 2：字數不足 → Google 一律關閉（解決「打一個字就跳出」）
      if (q.length < MIN_GOOGLE_CHARS) {
        setGooglePacVisible(false);
        return;
      }

      // 規則 3：沒有我的候選 + 字數達標 → 允許 Google 顯示
      setGooglePacVisible(true);
    }

    function syncClearBtn() {
      if (!btnClear) return;
      var has = (input.value || '').trim().length > 0;
      if (has) btnClear.classList.add('is-show');
      else btnClear.classList.remove('is-show');
    }

    function finalizeAfterMyPlaceChosen() {
      // 1) 關我的候選
      closeSuggest();

      // 2) 清空輸入，讓 Google 失去觸發條件（核心）
      input.value = '';
      syncClearBtn();

      // 3) 關 Google pac
      setGooglePacVisible(false);

      // 4) 收鍵盤 / 解除 focus
      try { input.blur(); } catch (e) { }
      if (document.activeElement && document.activeElement.blur) {
        try { document.activeElement.blur(); } catch (e2) { }
      }

      // 5) 保險：下一拍再關一次（避免 Google 同步重開）
      setTimeout(function () {
        setGooglePacVisible(false);
      }, 0);
    }

    // 任何輸入變更 => 控制 X
    input.addEventListener('input', function () {
      syncClearBtn();
      refreshSuggestByInput();
      arbitratePacByState();
    }, { passive: true });

    input.addEventListener('focus', function () {
      refreshSuggestByInput();
      arbitratePacByState();
    });

    input.addEventListener('blur', function () {
      setTimeout(function () {
        closeSuggest();
        setGooglePacVisible(false);
      }, 120);
    });

    // 按 X：清空 + 清 pin
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        input.value = '';
        syncClearBtn();
        closeSuggest();
        if (MapModule && MapModule.clearSearchPin) MapModule.clearSearchPin();
        input.focus();
      });
    }

    // 放大鏡搜尋：若使用者沒選下拉選項，也能用文字查
    function doSearchByText() {
      closeSuggest();
      var q = (input.value || '').trim();
      if (!q) return;

      // 1) 先找「我自己的標註點」
      var hit = findBestLocalPlace(q);
      if (hit) {
        finalizeAfterMyPlaceChosen();
        focusAndOpenMyPlace(hit);
        return;
      }

      // 2) 沒命中才交給 Google
      if (MapModule && MapModule.searchByText) {
        MapModule.searchByText(q, function (err, info) {
          if (err) {
            alert('查無結果，請輸入更完整的地址或地標名稱。');
            return;
          }
          syncClearBtn();
        });
      }
    }

    if (btnGo) {
      btnGo.addEventListener('click', doSearchByText);
    }

    // Enter 也觸發搜尋（符合一般搜尋習慣）
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        if (!suggestOpen) refreshSuggestByInput();
        if (suggestItems.length) {
          e.preventDefault();
          var next = activeIndex + 1;
          if (next >= suggestItems.length) next = 0;
          setActive(next);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        if (suggestItems.length) {
          e.preventDefault();
          var prev = activeIndex - 1;
          if (prev < 0) prev = suggestItems.length - 1;
          setActive(prev);
        }
        return;
      }

      if (e.key === 'Enter') {
        // 若有選中我的候選 → 直接開我的點，不走 Google
        if (suggestOpen && suggestItems.length && activeIndex >= 0) {
          e.preventDefault();
          var p = suggestItems[activeIndex];

          finalizeAfterMyPlaceChosen();
          focusAndOpenMyPlace(p);
          return;
        }

        e.preventDefault();
        closeSuggest(); // ★避免 Enter 後清單殘留
        doSearchByText();
      }

      if (e.key === 'Escape') {
        closeSuggest();
      }
    });

    // 初始同步一次
    syncClearBtn();
  })();

  loadMeNonBlocking();
  refreshPlaces();
  initMyLocationNonBlocking();
  applyMode(Mode.BROWSE);

  function getMapViewportEl() {
    // 依常見結構取地圖容器（你專案若 id 不同也不會壞，會 fallback 到 window.innerHeight）
    return document.getElementById('map')
      || document.getElementById('gmap')
      || document.querySelector('.map')
      || document.querySelector('#map-canvas')
      || null;
  }

  // ===== FIX: 點位對齊到「資訊抽屜上緣」(用 Projection 精準算像素) =====
  var __projOverlay = null;

  function ensureProjectionOverlay(map) {
    try {
      if (!map || !window.google || !google.maps) return null;
      if (__projOverlay) return __projOverlay;

      var ov = new google.maps.OverlayView();
      ov.onAdd = function () { };
      ov.draw = function () { };
      ov.onRemove = function () { };
      ov.setMap(map);

      __projOverlay = ov;
      return __projOverlay;
    } catch (e) {
      console.warn('ensureProjectionOverlay fail:', e);
      return null;
    }
  }

  function isPanelVisible(el) {
    if (!el) return false;
    // 用 aria-hidden / display / size 判斷「真的有顯示」
    var ariaHidden = el.getAttribute('aria-hidden');
    if (ariaHidden === 'true') return false;

    var cs = window.getComputedStyle(el);
    if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;

    var r = el.getBoundingClientRect();
    return (r.width > 0 && r.height > 0);
  }

  function panMarkerAboveSheet(place, sheetInner, gapPx) {
    var map = MapModule.getMap && MapModule.getMap();
    var proj = MapModule.getProjection && MapModule.getProjection();
    if (!proj) {
      var ov = ensureProjectionOverlay(map);
      proj = ov && ov.getProjection && ov.getProjection();
    }

    if (!map || !proj) {
      console.warn('[ALIGN] missing map/projection', { hasMap: !!map, hasProj: !!proj });
      return;
    }

    var lat = Number(place.lat);
    var lng = Number(place.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;

    var latLng = new google.maps.LatLng(lat, lng);

    // ✅ 取 marker 在「map container」內的像素位置
    var markerPx = null;
    if (typeof proj.fromLatLngToContainerPixel === 'function') {
      markerPx = proj.fromLatLngToContainerPixel(latLng);
    } else if (typeof proj.fromLatLngToDivPixel === 'function') {
      markerPx = proj.fromLatLngToDivPixel(latLng);
    }
    if (!markerPx) return;

    // ✅ 目標：marker 的 y 要落在「抽屜上緣 - gap」，但要先換算成 map container 座標
    var mapRect = map.getDiv().getBoundingClientRect();
    var sheetRect = sheetInner.getBoundingClientRect();

    // 抽屜上緣在 viewport 的 y => 轉成 map container 內的 y
    var targetY = (sheetRect.top - mapRect.top) - Number(gapPx || 0);

    // 需要往上移：markerPx.y > targetY => panBy 正值會往下？(Google Maps: panBy(x,y) y>0 地圖往下移，視覺上 marker 往上)
    var deltaY = markerPx.y - targetY;

    console.warn('[ALIGN] markerY=', markerPx.y, 'targetY=', targetY, 'panByY=', deltaY);

    map.panBy(0, deltaY);
  }

  function alignMyPlaceAfterSheetOpen(place, sheetEl, force) {
    if (!place) return;

    // 允許呼叫端指定（你原本就有傳 sheetPlace）
    var root = sheetEl || document.getElementById('sheet-place');
    if (!root) return;

    // 必須真的 open 才做
    if (!root.classList.contains('bottom-sheet--open')) {
      if (!force) return;
    }

    var sheetInner = root.querySelector('.bottom-sheet__inner');
    if (!sheetInner) return;

    var map = MapModule.getMap && MapModule.getMap();
    if (!map || !window.google || !google.maps) return;

    // 讓地圖完成 pan/zoom 後，再等抽屜 layout 穩定，最後才做 panBy
    google.maps.event.addListenerOnce(map, 'idle', function () {
      // 等兩拍，避免「抽屜 transition 高度」與「字體重排」造成 sheetRect.top 浮動
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          panMarkerAboveSheet(place, sheetInner, FOCUS_GAP_PX);
        });
      });
    });
  }

  if (btnMyLocation) {
    btnMyLocation.addEventListener('click', function () {
      requestMyLocation(true);
    });
  }

  if (btnRouteMode) {
    btnRouteMode.addEventListener('click', function () {
      applyMode(Mode.ROUTE_PLANNING);
    });
  }

  if (btnRouteExit) {
    btnRouteExit.addEventListener('click', function () {
      if (state.mode !== Mode.ROUTE_PLANNING) return;

      var keep = confirm('是否保留已加入的路線清單？\n\n按「確定」保留，按「取消」清空（保留起點）。');
      if (!keep) {
        resetRouteKeepStart();
      }
      applyMode(Mode.BROWSE);
    });
  }

  if (btnRouteCommit) {
    btnRouteCommit.addEventListener('click', function () {
      if (!canCommitRoute()) {
        alert('請至少加入 1 個拜訪點（起點不算）。');
        return;
      }
      applyMode(Mode.ROUTE_READY);
    });
  }

  if (btnRouteOpenGmaps) {
    btnRouteOpenGmaps.addEventListener('click', function () {
      if (state.mode !== Mode.ROUTE_READY) return;
      var url = MapModule.buildDirectionsUrl(state.routePoints);
      if (!url) {
        alert('路線資料不足，無法開啟 Google 導航。');
        return;
      }
      window.open(url, '_blank');
    });
  }

  if (btnRouteReplan) {
    btnRouteReplan.addEventListener('click', function () {
      if (state.mode !== Mode.ROUTE_READY) return;
      applyMode(Mode.ROUTE_PLANNING);
    });
  }

  if (btnPlaceSave) {
    btnPlaceSave.addEventListener('click', function () {
      if (!window.PlaceForm) return;
      PlaceForm.submit(state.currentPlace); // 編輯時讓它可以沿用 currentPlace 的 lat/lng
    });
  }

  if (btnPlaceEdit) {
    btnPlaceEdit.addEventListener('click', async function () {
      if (state.mode !== Mode.BROWSE) return;
      if (!state.currentPlace) return;

      var id = state.currentPlace.id;

      closeSheet('sheet-place');
      setPlaceSheetBackdrop(false);
      collapsePlaceDetails(true);

      try {
        // ✅ 先抓最新單筆（確保 managed_town_code / managed_county_code 有值）
        var res = await apiRequest('/places/get?id=' + encodeURIComponent(id), 'GET');

        // apiRequest 回傳的是 {success, data}，真正的 place 在 res.data
        var place = (res && res.data) ? res.data : null;

        // 更新 currentPlace，避免後續 submit 沿用舊資料
        state.currentPlace = place || state.currentPlace;

        if (window.PlaceForm) PlaceForm.openForEdit(state.currentPlace);
      } catch (err) {
        console.error('load place detail fail:', err);
        // 失敗才退回用 cache（至少不讓使用者卡住）
        if (window.PlaceForm) PlaceForm.openForEdit(state.currentPlace);
      }
    });
  }

  if (btnPlaceDelete) {
    btnPlaceDelete.addEventListener('click', function () {
      if (state.mode !== Mode.BROWSE) return;
      if (!state.currentPlace) return;

      closeSheet('sheet-place');
      setPlaceSheetBackdrop(false);
      collapsePlaceDetails(true);

      handlePlaceDelete();
    });
  }

  // C3：加入路線（從 S1 抽屜）
  if (btnPlaceAddRoute) {
    btnPlaceAddRoute.addEventListener('click', function () {
      if (!state.currentPlace) return;

      // S3：禁止加入路線（避免完成後又改）
      if (state.mode === Mode.ROUTE_READY) return;

      // S2：你要求 S2 不應從資訊抽屜操作（而且 S2 也不會開 sheet-place）
      if (state.mode !== Mode.BROWSE) return;

      var action = btnPlaceAddRoute.dataset.action || 'add';
      if (action === 'remove') {
        removePlaceFromRoute(state.currentPlace.id);
      } else {
        addPlaceToRouteAndEnterPlanning(state.currentPlace);
      }

    });
  }

  // C2：詳細展開/收合（不跳頁）
  if (btnPlaceDetail) {
    btnPlaceDetail.addEventListener('click', function () {
      if (state.mode !== Mode.BROWSE) return;
      togglePlaceDetails();
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      var base = (window.API_BASE || '/api').replace(/\/$/, '');
      fetch(base + '/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
        .catch(function (err) {
          console.error('logout error:', err);
        })
        .finally(function () {
          window.location.href = '/login';
        });
    });
  }
  // ===== S1 資訊抽屜：點外面關閉 =====
  var sheetBackdrop = null;
  var escBound = false;

  function ensureSheetBackdrop() {
    if (sheetBackdrop) return sheetBackdrop;

    sheetBackdrop = document.createElement('div');
    sheetBackdrop.className = 'sheet-backdrop';
    document.body.appendChild(sheetBackdrop);

    sheetBackdrop.addEventListener('click', function () {
      if (window.FocusCamera && typeof window.FocusCamera.restoreOverview === 'function') {
        window.FocusCamera.restoreOverview();
      }

      closeSheet('sheet-place');
      closeSheet('sheet-poi');
      state.currentPlace = null;
      collapsePlaceDetails(true);
    });

    if (!escBound) {
      escBound = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          if (window.FocusCamera && typeof window.FocusCamera.restoreOverview === 'function') {
            window.FocusCamera.restoreOverview();
          }

          closeSheet('sheet-place');
          closeSheet('sheet-poi');
          state.currentPlace = null;
          collapsePlaceDetails(true);
        }
      });

    }

    return sheetBackdrop;
  }

  function setPlaceSheetBackdrop(open) {
    var bd = ensureSheetBackdrop();
    if (open) bd.classList.add('is-open');
    else bd.classList.remove('is-open');
  }

  document.body.addEventListener('click', function (evt) {
    var target = evt.target;

    // Modal close：一律交給 PlaceForm（它含 iOS body lock 解鎖）
    if (target && (target.matches('[data-modal-close]') || target.matches('.modal__backdrop'))) {
      var id = target.getAttribute('data-modal-close') || 'modal-place-form';

      if (window.PlaceForm && typeof PlaceForm.closeModal === 'function') {
        PlaceForm.closeModal(id);
      } else {
        // fallback：至少把 modal 關掉（避免卡死）
        var el = document.getElementById(id);
        if (el) {
          el.classList.remove('modal--open');
          el.setAttribute('aria-hidden', 'true');
          document.body.classList.remove('is-modal-open');
        }
      }

      if (MapModule && MapModule.clearTempNewPlaceLatLng) MapModule.clearTempNewPlaceLatLng();
    }

    // Bottom sheet close（保留原本行為）
    var sheetCloseBtn = target && target.closest ? target.closest('[data-sheet-close]') : null;
    if (sheetCloseBtn) {
      var sid = sheetCloseBtn.getAttribute('data-sheet-close');
      if (sid === 'sheet-route') return;
      closeSheet(sid);
    }
  });

  document.addEventListener('placeForm:saved', function (ev) {

    closeSheet('sheet-place');
    state.currentPlace = null;
    collapsePlaceDetails(true);
    refreshPlaces();
  });

  // ✅ 更新座標：DB 成功後 → 局部更新 marker/overlay + 同步 cache + 用既有點選流程開抽屜（不 refreshPlaces）
  document.addEventListener('placeCoordUpdate:saved', function (ev) {
    if (state.mode !== Mode.BROWSE) return;

    var d = (ev && ev.detail) ? ev.detail : {};
    var id = (d.id !== undefined && d.id !== null) ? Number(d.id) : NaN;
    if (!isFinite(id)) return;

    // 先關抽屜避免殘影
    closeSheet('sheet-place');
    state.currentPlace = null;
    collapsePlaceDetails(true);

    // ✅ 以事件回傳的 place 為主；沒有就用 lat/lng
    var place = d.place || null;
    var lat = place && place.lat != null ? Number(place.lat) : Number(d.lat);
    var lng = place && place.lng != null ? Number(place.lng) : Number(d.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;

    // 1) 局部移動同一顆 marker + overlay（核心）
    var moved = false;
    if (window.MapModule && typeof MapModule.updatePlacePosition === 'function') {
      moved = !!MapModule.updatePlacePosition(id, lat, lng);
    } else {
      console.warn('MapModule.updatePlacePosition not found');
    }

    // 2) 同步 placesCache（避免搜尋/抽屜顯示舊座標）
    if (Array.isArray(state.placesCache)) {
      for (var i = 0; i < state.placesCache.length; i++) {
        var row = state.placesCache[i];
        if (row && Number(row.id) === id) {
          if (place) {
            state.placesCache[i] = place;
          } else {
            row.lat = lat;
            row.lng = lng;
          }
          break;
        }
      }
    }

    // 3) 準備要開抽屜的 place（要有完整欄位才顯示正常）
    var openPlace = place;
    if (!openPlace && Array.isArray(state.placesCache)) {
      for (var j = 0; j < state.placesCache.length; j++) {
        var p = state.placesCache[j];
        if (p && Number(p.id) === id) { openPlace = p; break; }
      }
    }
    if (!openPlace) openPlace = { id: id, lat: lat, lng: lng };

    // 4) 走既有「點 marker」流程（開抽屜/對齊等）
    handleMarkerClickInBrowseMode(openPlace);

    // Debug（你要查問題時很有用）
    if (!moved) {
      console.warn('[placeCoordUpdate] marker not moved. Check markersById key type (string vs number). id=', id);
    }
  });

  // ===== map:blankClick 統一入口（唯一監聽） =====
  document.addEventListener('map:blankClick', function () {

    // S2：路線規劃 → 點地圖空白 = 離開規劃
    if (state.mode === Mode.ROUTE_PLANNING) {
      exitPlanningSilent();
      return;
    }

    // S1：BROWSE → 點地圖空白才關資訊抽屜
    if (state.mode === Mode.BROWSE) {
      closeSheet('sheet-place');
      closeSheet('sheet-poi');
      state.currentPlace = null;
      collapsePlaceDetails(true);
      return;
    }

    // S3：ROUTE_READY → 不做事（刻意）
  });

  // ===== map.js：點 Google 原生 POI → 打開同一個 sheet-place（相容多事件名）=====
  (function bindPoiEvents() {
    function handler(e) {
      // e.detail 可能是 { place } 或直接 place
      var d = e && e.detail ? e.detail : null;
      var gp = null;

      if (d && d.place) gp = d.place;
      else if (d && typeof d === 'object') gp = d;

      if (!gp) return;

      openPoiSheetFromGoogle(gp);
    }

    // 你 map.js 最後用哪個事件名都沒關係，這裡都接
    document.addEventListener('map:poiClick', handler);
    document.addEventListener('map:poiSelected', handler);
    document.addEventListener('map:googlePlaceSelected', handler);
    document.addEventListener('map:placeSelected', handler);
  })();

  function loadMeNonBlocking() {
    apiRequest('/auth/me', 'GET')
      .then(function (payload) {
        // ✅ apiRequest 回的是 {success, data}
        var me = (payload && payload.data) ? payload.data : null;

        state.me = me;

        if (window.PlaceForm) PlaceForm.setMe(state.me);

        if (navUserNameEl) {
          var displayName =
            (me && (me.name || me.full_name || me.username || me.email))
              ? (me.name || me.full_name || me.username || me.email)
              : '';
          navUserNameEl.textContent = displayName ? String(displayName) : '—';
        }

        if (me && isFinite(me.county_center_lat) && isFinite(me.county_center_lng)) {
          state.fallbackCenter = { lat: Number(me.county_center_lat), lng: Number(me.county_center_lng) };
          // ✅ 1) 畫出「目前位置」marker（用縣市中心當推定點）
          if (MapModule && MapModule.showMyLocation) {
            MapModule.showMyLocation(state.fallbackCenter.lat, state.fallbackCenter.lng);
          }

          // ✅ 2) 登入後的預設定位：只做一次（避免後面 refresh/事件又搶鏡頭）
          if (!__initialCentered && MapModule && typeof MapModule.panToLatLng === 'function') {
            __initialCentered = true;
            MapModule.panToLatLng(state.fallbackCenter.lat, state.fallbackCenter.lng, 12);
          }
        }
      })
      .catch(function (err) {
        console.warn('load me fail:', err && err.message ? err.message : err);
        if (navUserNameEl) navUserNameEl.textContent = '—';
      });
  }

  function refreshPlaces() {
    return fetch('/api/places/list', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json || typeof json !== 'object') throw new Error('回傳格式錯誤');
        if (!json.success) throw new Error((json.error && json.error.message) || '載入地點資料失敗');

        var places = Array.isArray(json.data) ? json.data : [];
        state.placesCache = places;

        MapModule.setPlaces(
          places,
          handleMarkerClickInBrowseMode,
          handleMarkerClickInRoutePlanningMode
        );

        document.dispatchEvent(new CustomEvent('places:loaded', { detail: { places: places } }));

        MapModule.setMode(state.mode, state.routePoints);
        updateRouteBadge();
        emitModeChanged();
        emitRouteChanged();
      })
      .catch(function (err) {
        console.error('refreshPlaces error:', err);
        alert('載入地點資料失敗');
      });
  }

  function applyMode(nextMode) {
    state.mode = nextMode;
    // 保險：離開 BROWSE 時，確保資訊抽屜的 backdrop 關閉
    if (nextMode !== Mode.BROWSE) setPlaceSheetBackdrop(false);
    // ✅ 更新座標功能：僅 S1(BROWSE) 可用
    if (window.PlaceCoordUpdate && typeof window.PlaceCoordUpdate.setEnabled === 'function') {
      window.PlaceCoordUpdate.setEnabled(nextMode === Mode.BROWSE);
    }

    applyModeGuards();

    if (state.mode === Mode.BROWSE) {
      closeSheet('sheet-route');
      hideRouteActions();
      MapModule.setMode(Mode.BROWSE, state.routePoints);

      if (btnRouteMode) btnRouteMode.classList.remove('fab--active');
      setCommitEnabled(false);

    } else if (state.mode === Mode.ROUTE_PLANNING) {
      closeSheet('sheet-place');
      openSheet('sheet-route');
      hideRouteActions();

      ensureStartPoint();
      MapModule.setMode(Mode.ROUTE_PLANNING, state.routePoints);

      if (btnRouteMode) btnRouteMode.classList.add('fab--active');

      renderRouteList();
      updateCommitState();

    } else if (state.mode === Mode.ROUTE_READY) {
      closeSheet('sheet-route');
      closeSheet('sheet-place');

      ensureStartPoint();
      MapModule.setMode(Mode.ROUTE_READY, state.routePoints);
      showRouteActions();

      if (btnRouteMode) btnRouteMode.classList.remove('fab--active');
      setCommitEnabled(false);
    }

    updateRouteBadge();
    emitModeChanged();
  }

  // 離開路線規劃模式（不詢問、保留已加入點）
  function exitPlanningSilent() {
    if (state.mode !== Mode.ROUTE_PLANNING) return;

    // 關抽屜（如果是開著）
    // 注意：你原本 closeSheet('sheet-route') 在規劃模式會被擋，所以這裡先不要靠 closeSheet
    // 直接移除 class 才能真的收起來
    var el = document.getElementById('sheet-route');
    if (el) el.classList.remove('bottom-sheet--open');

    applyMode(Mode.BROWSE); // 回到 S1，保留 state.routePoints 不動
  }

  const btnRouteClose = document.getElementById('btn-route-close');

  if (btnRouteClose) {
    btnRouteClose.addEventListener('click', function () {
      exitPlanningSilent();
    });
  }


  function applyModeGuards() {
    var isBrowse = (state.mode === Mode.BROWSE);

    if (btnPlaceEdit) btnPlaceEdit.disabled = !isBrowse;
    if (btnPlaceDelete) btnPlaceDelete.disabled = !isBrowse;
    if (btnPlaceDetail) btnPlaceDetail.disabled = !isBrowse;

    // C3：加入路線在 S1 才能按；S3 也禁用
    if (btnPlaceAddRoute) btnPlaceAddRoute.disabled = !(state.mode === Mode.BROWSE);

    if (!isBrowse) {
      closeSheet('sheet-place');
      state.currentPlace = null;
      collapsePlaceDetails(true);
    }
  }

  function canCommitRoute() {
    ensureStartPoint();
    return Array.isArray(state.routePoints) && state.routePoints.length >= 2;
  }

  function updateCommitState() {
    setCommitEnabled(canCommitRoute());
  }

  function setCommitEnabled(enabled) {
    if (!btnRouteCommit) return;
    btnRouteCommit.disabled = !enabled;
  }

  function showRouteActions() {
    if (!routeActionsEl) return;
    routeActionsEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-route-actions');
  }

  function hideRouteActions() {
    if (!routeActionsEl) return;
    routeActionsEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-route-actions');
  }

  function initMyLocationNonBlocking() {
    requestMyLocation(false);
  }

  function requestMyLocation(panTo) {
    if (!navigator.geolocation) {
      panToFallbackIfNeeded();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var acc = pos && pos.coords ? Number(pos.coords.accuracy) : NaN; // ★公尺

        // ★只有「背景自動定位」才嚴格；「使用者按按鈕」要寬鬆，否則桌機/Wi-Fi 會永遠失敗
        var strict = (panTo !== true);

        // strict 模式：accuracy 太差就不用 GPS，改用 fallback
        if (strict && (!isFinite(acc) || acc > 200)) {
          console.warn('geolocation accuracy too low (strict), use fallback. acc(m)=', acc);
          panToFallbackIfNeeded(false); // 注意：不要偷 pan
          return;
        }

        myLocationPoint = {
          id: '__me',
          serviceman_name: '目前位置',
          category: 'CURRENT',
          visit_target: '',
          address_text: '',
          note: '',
          lat: lat,
          lng: lng,
          soldier_name: '目前位置',
          target_name: '',
          address: ''
        };

        MapModule.showMyLocation(lat, lng);
        // ✅ 鏡頭移動：只有使用者主動（panTo=true）才移動
        if (panTo === true && MapModule && typeof MapModule.panToLatLng === 'function') {
          MapModule.panToLatLng(lat, lng, 16);
        }
        if (state.mode === Mode.ROUTE_PLANNING || state.mode === Mode.ROUTE_READY) {
          ensureStartPoint();
          renderRouteList();
          MapModule.setMode(state.mode, state.routePoints);
          updateCommitState();
        }
      }
      ,
      function (err) {
        console.warn('geolocation fail:', err && err.message ? err.message : err);
        panToFallbackIfNeeded(panTo === true);
      },

      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
    );
  }

  function panToFallbackIfNeeded(doPan) {
    if (!state.fallbackCenter || !MapModule) return;

    if (MapModule.showMyLocation) {
      MapModule.showMyLocation(state.fallbackCenter.lat, state.fallbackCenter.lng);
    }

    // ✅ 只有你明確要求才 pan（例如：使用者按我的位置但 GPS 失敗）
    if (doPan === true && typeof MapModule.panToLatLng === 'function') {
      MapModule.panToLatLng(state.fallbackCenter.lat, state.fallbackCenter.lng, 12);
    }
  }

  function ensureStartPoint() {
    if (!myLocationPoint) {
      // 盡量用新版：organization_name（organizations.name）
      // 其次相容舊版：organization_county
      var orgLabel = '';
      if (state.me) {
        orgLabel = (state.me.organization_name || state.me.organization_county || '');
      }

      if (state.fallbackCenter && isFinite(state.fallbackCenter.lat) && isFinite(state.fallbackCenter.lng)) {
        var addrText = orgLabel ? (orgLabel + '（推定）') : '';

        myLocationPoint = {
          id: '__me',
          category: 'CURRENT',
          note: '',
          lat: state.fallbackCenter.lat,
          lng: state.fallbackCenter.lng,

          // canonical（新版 places）
          serviceman_name: '起點（縣市中心）',
          visit_target: '',
          address_text: addrText,

          // alias（前端舊欄位/MapModule 兼容）
          soldier_name: '起點（縣市中心）',
          target_name: '',
          address: addrText
        };
      } else {
        myLocationPoint = {
          id: '__me',
          category: 'CURRENT',
          note: '',
          lat: null,
          lng: null,

          // canonical
          serviceman_name: '起點（未定位）',
          visit_target: '',
          address_text: '',

          // alias
          soldier_name: '起點（未定位）',
          target_name: '',
          address: ''
        };
      }
    }

    if (!Array.isArray(state.routePoints)) state.routePoints = [];

    if (state.routePoints.length === 0) {
      state.routePoints.push(myLocationPoint);
      return;
    }

    if (state.routePoints[0].id !== '__me') {
      state.routePoints = state.routePoints.filter(function (p) { return p && p.id !== '__me'; });
      state.routePoints.unshift(myLocationPoint);
      return;
    }

    state.routePoints[0] = myLocationPoint;
  }

  function resetRouteKeepStart() {
    ensureStartPoint();
    state.routePoints = [state.routePoints[0]];
    renderRouteList();
    MapModule.setMode(state.mode, state.routePoints);
    updateCommitState();
    updateRouteBadge();
    emitRouteChanged();
  }

  function handleSearchPlaceSelected(place) {
    // place 是 Google Autocomplete/Places 的回傳
    openPoiSheetFromGoogle(place);
  }

  function handleMapLongPressForNewPlace(latLng, address) {
    if (state.mode !== Mode.BROWSE) return;
    if (!window.PlaceForm) return;
    PlaceForm.openForCreate(latLng, address);
  }

  function handleMarkerClickInBrowseMode(place) {
    if (state.mode !== Mode.BROWSE) return;

    closeSheet('sheet-poi');
    state.currentPlace = place;

    fillPlaceSheet(place);
    collapsePlaceDetails(true);

    // 1) 先把地圖置中 + 放大（交給 FocusCamera；它會記住前視角供回復）
    if (window.FocusCamera && typeof window.FocusCamera.focusToPlace === 'function') {
      window.FocusCamera.focusToPlace(place);
    } else if (MapModule && typeof MapModule.panToLatLng === 'function') {
      var lat = (place.lat !== undefined && place.lat !== null) ? Number(place.lat) : null;
      var lng = (place.lng !== undefined && place.lng !== null) ? Number(place.lng) : null;
      if (isFinite(lat) && isFinite(lng)) MapModule.panToLatLng(lat, lng, 16);
    }

    // 2) 打開抽屜
    openSheet('sheet-place');

    // 3) 抽屜打開後，把點對齊到「抽屜上緣」
    alignMyPlaceAfterSheetOpen(place, sheetPlace);
  }

  function handleMarkerClickInRoutePlanningMode(place) {
    if (state.mode !== Mode.ROUTE_PLANNING) return;

    ensureStartPoint();

    var idx = indexOfRoutePoint(place.id);
    if (idx >= 0) {
      if (place.id === '__me') return;
      state.routePoints.splice(idx, 1);
    } else {
      state.routePoints.push(place);
    }

    renderRouteList();
    MapModule.setMode(state.mode, state.routePoints);
    updateCommitState();
    updateRouteBadge();
    emitRouteChanged();
  }

  function addPlaceToRouteAndEnterPlanning(place) {
    ensureStartPoint();

    // 已在路線就不重複加入
    var idx = indexOfRoutePoint(place.id);
    if (idx < 0) {
      state.routePoints.push(place);
    }

    // ✅ 需求：加入後不自動切換到 S2，只要收起抽屜並更新樣式/徽章
    closeSheet('sheet-place');
    state.currentPlace = null;
    collapsePlaceDetails(true);

    MapModule.setMode(state.mode, state.routePoints);
    updateCommitState();
    updateRouteBadge();
    emitRouteChanged();
  }

  function removePlaceFromRoute(placeId) {
    ensureStartPoint();

    // 不移除起點
    if (placeId === '__me') return;

    state.routePoints = state.routePoints.filter(function (p) {
      return p && p.id !== placeId;
    });

    // 收起抽屜、更新地圖與徽章（S1 行為）
    closeSheet('sheet-place');
    state.currentPlace = null;
    collapsePlaceDetails(true);

    MapModule.setMode(state.mode, state.routePoints);
    updateCommitState();
    updateRouteBadge();
    emitRouteChanged();
  }

  function normRouteId(x) {
    if (x === '__me') return '__me';
    if (x === null || x === undefined) return '';
    return String(x);
  }

  function indexOfRoutePoint(id) {
    var tid = normRouteId(id);
    for (var i = 0; i < state.routePoints.length; i++) {
      var p = state.routePoints[i];
      if (p && normRouteId(p.id) === tid) return i;
    }
    return -1;
  }

  function fillPlaceSheet(place) {
    // ====== canonical first, fallback to alias ======
    var servicemanName = pick(place, 'serviceman_name', 'soldier_name');
    var visitTarget = pick(place, 'visit_target', 'target_name');
    var addressText = pick(place, 'address_text', 'address');

    // 類別顯示：若後端有 category_label 就用，否則用 category
    var categoryText = place.category_label || place.category || '';

    // ====== S1 簡略資訊（新版抽屜 id）======
    // 你新版抽屜用的是：
    // sheet-place-serviceman-name / sheet-place-category / sheet-place-address-text / sheet-place-visit-target / sheet-place-note
    setText('sheet-place-serviceman-name', servicemanName);
    setText('sheet-place-category', categoryText);
    setText('sheet-place-address-text', addressText);
    setText('sheet-place-visit-target', visitTarget);
    setText('sheet-place-note', place.note);

    // ====== C2 詳細欄位（新版詳細區 id）======
    // 你要顯示 organizations.name → organization_name
    setText('sheet-place-org-county', place.organization_name || place.organization_county || '—');
    setText('sheet-place-updated-by-user-id', place.updated_by_user_name || place.updated_by_user_id);

    setText('sheet-place-visit-name', place.visit_name);
    setText('sheet-place-managed-district', place.managed_district);
    setText('sheet-place-condolence-order-no', place.condolence_order_no);
    setText('sheet-place-beneficiary-over65', toYesNo(place.beneficiary_over65));

    // created/updated
    setText('sheet-place-created-at', formatDateTime(place.created_at));
    setText('sheet-place-updated-at', formatDateTime(place.updated_at));

    // lat/lng
    var lat = (place.lat !== undefined && place.lat !== null) ? String(place.lat) : '';
    var lng = (place.lng !== undefined && place.lng !== null) ? String(place.lng) : '';
    setText('sheet-place-latlng', (lat && lng) ? (lat + ', ' + lng) : '—');

    // ====== S1：抽屜內按鈕要依是否已加入路線切換：加入路線 / 取消路線 ======
    var btnAdd = document.getElementById('btn-place-add-route');
    if (btnAdd) {
      var inRoute = indexOfRoutePoint(place.id) >= 0;

      if (inRoute) {
        btnAdd.textContent = '取消路線';
        btnAdd.classList.remove('btn-primary');
        btnAdd.classList.add('btn-danger');
        btnAdd.dataset.action = 'remove';
      } else {
        btnAdd.textContent = '加入路線';
        btnAdd.classList.remove('btn-danger');
        btnAdd.classList.add('btn-primary');
        btnAdd.dataset.action = 'add';
      }
    }
  }

  // ===== POI（Google 原生地點）顯示到 sheet-poi（只要店名/地址/照片）=====
  function openPoiSheetFromGoogle(googlePlace) {
    if (state.mode !== Mode.BROWSE) return;
    if (!googlePlace) return;

    // 避免兩個抽屜疊在一起：POI 打開時，先把 places 抽屜收掉（不改動 route/sheet-route）
    closeSheet('sheet-place');
    state.currentPlace = null;
    collapsePlaceDetails(true);

    fillPoiSheet(googlePlace);
    openSheet('sheet-poi');

    // 若有 placeId 嘗試抓照片（沒有就只顯示店名/地址）
    var pid = googlePlace.place_id || googlePlace.placeId || '';
    if (pid) fetchPoiPhoto(pid);
  }

  function fillPoiSheet(gp) {
    var name = gp.name || gp.formatted_name || gp.title || '（未命名地點）';
    var addr = gp.formatted_address || gp.vicinity || gp.address || '—';

    setText('sheet-poi-name', name);
    setText('sheet-poi-address', addr);

    var img = document.getElementById('sheet-poi-photo');
    if (img) {
      img.style.display = 'none';
      img.src = '';
    }
  }

  function fetchPoiPhoto(placeId) {
    try {
      if (!placeId || !window.google || !google.maps || !google.maps.places) return;

      // PlacesService 需要一個容器元素，但不一定要綁你的地圖實例
      var dummy = document.createElement('div');
      var svc = new google.maps.places.PlacesService(dummy);

      svc.getDetails({ placeId: placeId, fields: ['photos'] }, function (place, status) {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return;

        var img = document.getElementById('sheet-poi-photo');
        if (!img) return;

        if (place.photos && place.photos.length) {
          img.src = place.photos[0].getUrl({ maxWidth: 900, maxHeight: 500 });
          img.style.display = 'block';
        }
      });
    } catch (e) {
      // 不要打斷主流程：照片抓不到就算了
      console.warn('fetchPoiPhoto fail:', e);
    }
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = (text === undefined || text === null || text === '') ? '—' : String(text);
  }

  function formatDateTime(v) {
    if (!v) return '';
    // 後端可能是 "YYYY-MM-DD HH:mm:ss"；直接顯示即可（避免時區誤轉）
    return String(v);
  }

  // ===== C2：詳細展開/收合 =====
  function togglePlaceDetails() {
    if (!detailsWrap) return;

    var collapsed = detailsWrap.classList.contains('is-collapsed');
    if (collapsed) {
      expandPlaceDetails();
    } else {
      collapsePlaceDetails(false);
    }
  }

  function expandPlaceDetails() {
    if (!detailsWrap) return;

    detailsWrap.classList.remove('is-collapsed');
    detailsWrap.classList.add('is-expanded');
    detailsWrap.setAttribute('aria-hidden', 'false');

    if (btnPlaceDetail) btnPlaceDetail.textContent = '收合';

    // ✅ 關鍵：展開後抽屜高度變了，必須「再對齊一次」
    // 等 transition 走完再對齊（做兩次補刀，避免 iOS/Android 量測不同步）
    if (state && state.currentPlace && sheetPlace && sheetPlace.classList.contains('bottom-sheet--open')) {
      setTimeout(function () {
        alignMyPlaceAfterSheetOpen(state.currentPlace, sheetPlace, true); // force=true
        setTimeout(function () {
          alignMyPlaceAfterSheetOpen(state.currentPlace, sheetPlace, true);
        }, 120);
      }, 260);
    }
  }

  function collapsePlaceDetails(force) {
    if (!detailsWrap) return;

    detailsWrap.classList.remove('is-expanded');
    detailsWrap.classList.add('is-collapsed');
    detailsWrap.setAttribute('aria-hidden', 'true');

    if (btnPlaceDetail) btnPlaceDetail.textContent = '詳細';

    // 收合通常不必重新對齊（地圖會露更多出來），但你若想一致也可以打開：
    // if (state && state.currentPlace && sheetPlace && sheetPlace.classList.contains('bottom-sheet--open')) {
    //   setTimeout(function () { alignMyPlaceAfterSheetOpen(state.currentPlace, sheetPlace, true); }, 180);
    // }
  }

  function renderRouteList() {
    if (!routeListEl) return;

    ensureStartPoint();
    routeListEl.innerHTML = '';
    var visitNo = 0; // 只對拜訪點編號（排除 __me 起點）

    state.routePoints.forEach(function (p, index) {
      var el = document.createElement('div');
      el.className = 'route-item';
      el.dataset.id = String(p.id);

      if (index === 0) {
        el.classList.add('route-item--fixed');
      } else {
        el.setAttribute('draggable', 'true');
      }

      var title = pick(p, 'serviceman_name', 'soldier_name') || (p.id === '__me' ? '目前位置' : '未命名');
      var sub = pick(p, 'address_text', 'address') || '';
      var indexHtml = '';
      if (p && p.id !== '__me') {
        visitNo++;
        indexHtml = '<div class="route-item__index">' + visitNo + '</div>';
      } else {
        // 起點不要顯示「1」
        indexHtml = '<div class="route-item__index route-item__index--start">起點</div>';
      }

      el.innerHTML =
        indexHtml +
        '<div class="route-item__content">' +
        '  <div class="route-item__title">' + escapeHtml(title) + '</div>' +
        '  <div class="route-item__sub">' + escapeHtml(sub) + '</div>' +
        '</div>' +
        (index === 0 ? '' : '<button type="button" class="route-item__remove" title="移除">✕</button>');

      if (index !== 0) {
        el.addEventListener('click', function (e) {
          if (e && e.target && e.target.classList && e.target.classList.contains('route-item__remove')) return;

          state.routePoints = state.routePoints.filter(function (x) {
            return x && x.id !== p.id;
          });
          ensureStartPoint();
          renderRouteList();
          MapModule.setMode(state.mode, state.routePoints);
          updateCommitState();
          updateRouteBadge();
          emitRouteChanged();
        });
      }

      var btnRemove = el.querySelector('.route-item__remove');
      if (btnRemove) {
        btnRemove.addEventListener('click', function () {
          state.routePoints = state.routePoints.filter(function (x) {
            return x && x.id !== p.id;
          });
          ensureStartPoint();
          renderRouteList();
          MapModule.setMode(state.mode, state.routePoints);
          updateCommitState();
          updateRouteBadge();
          emitRouteChanged();
        });
      }

      routeListEl.appendChild(el);
    });

    bindDragAndDrop();
  }

  function bindDragAndDrop() {
    if (!routeListEl) return;

    var draggingId = null;

    routeListEl.querySelectorAll('.route-item[draggable="true"]').forEach(function (item) {
      item.addEventListener('dragstart', function (e) {
        draggingId = item.dataset.id;
        item.classList.add('route-item--dragging');
        if (e && e.dataTransfer) e.dataTransfer.setData('text/plain', draggingId);
      });

      item.addEventListener('dragend', function () {
        draggingId = null;
        item.classList.remove('route-item--dragging');
        routeListEl.querySelectorAll('.route-item').forEach(function (x) {
          x.classList.remove('route-item--over');
        });
      });

      item.addEventListener('dragover', function (e) {
        if (!draggingId) return;
        e.preventDefault();
        item.classList.add('route-item--over');
      });

      item.addEventListener('dragleave', function () {
        item.classList.remove('route-item--over');
      });

      item.addEventListener('drop', function (e) {
        if (!draggingId) return;
        e.preventDefault();

        var targetId = item.dataset.id;
        if (!targetId || targetId === draggingId) return;

        var fromIdx = indexOfRoutePoint(castId(draggingId));
        var toIdx = indexOfRoutePoint(castId(targetId));

        if (fromIdx <= 0 || toIdx <= 0) return;

        var moved = state.routePoints.splice(fromIdx, 1)[0];
        state.routePoints.splice(toIdx, 0, moved);

        renderRouteList();
        MapModule.setMode(state.mode, state.routePoints);
        updateCommitState();
        updateRouteBadge();
        emitRouteChanged();
      });
    });
  }

  //專門抓抽屜實際上緣」的 helper
  function getSheetInnerEl(sheetEl) {
    if (!sheetEl) return null;
    return sheetEl.querySelector('.bottom-sheet__inner');
  }

  // ===== canonical + alias helpers =====
  function pick(place, canonicalKey, aliasKey) {
    if (!place) return '';
    var v = place[canonicalKey];
    if (v === undefined || v === null || v === '') v = place[aliasKey];
    return (v === undefined || v === null) ? '' : v;
  }

  function toYesNo(v) {
    return (String(v || '').toUpperCase() === 'Y') ? '是' : '否';
  }

  function castId(id) {
    if (id === '__me') return '__me';
    var n = parseInt(id, 10);
    return isFinite(n) ? n : id;
  }

  function updateRouteBadge() {
    if (!routeBadgeEl) return;

    var n = 0;
    if (Array.isArray(state.routePoints) && state.routePoints.length > 0) {
      n = state.routePoints.filter(function (p) { return p && p.id !== '__me'; }).length;
    }

    routeBadgeEl.textContent = String(n);
    routeBadgeEl.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  async function handlePlaceDelete() {
    if (!state.currentPlace) return;
    if (!confirm('確定要刪除這個地點嗎？此動作無法復原。')) return;

    try {
      await PlacesApi.remove(state.currentPlace.id);
      closeSheet('sheet-place');
      state.currentPlace = null;
      await refreshPlaces();
    } catch (err) {
      console.error(err);
      alert((err && err.message) ? err.message : '刪除失敗');
    }
  }

  function openSheet(id) {
    var el = document.getElementById(id);
    if (!el) return;

    if (id === 'sheet-place' && state.mode !== Mode.BROWSE) return;
    if (id === 'sheet-poi' && state.mode !== Mode.BROWSE) return;

    // ★互斥：開哪個就先關另一個
    if (id === 'sheet-place') closeSheet('sheet-poi');
    if (id === 'sheet-poi') closeSheet('sheet-place');

    el.classList.add('bottom-sheet--open');

    if (id === 'sheet-place') setPlaceSheetBackdrop(true);
  }


  function closeSheet(id) {
    var el = document.getElementById(id);
    if (!el) return;

    el.classList.remove('bottom-sheet--open');

    if (id === 'sheet-place') {
      setPlaceSheetBackdrop(false);
    }

    // ✅ POI：關閉時清掉照片，避免殘留上一張
    if (id === 'sheet-poi') {
      var img = document.getElementById('sheet-poi-photo');
      if (img) { img.style.display = 'none'; img.src = ''; }
    }
  }

  // 防止點擊抽屜內容誤觸外層關閉，但「允許」點 X 正常關閉
  (function bindSheetStopPropagation() {
    var sheet = document.getElementById('sheet-place');
    if (!sheet) return;

    sheet.addEventListener('click', function (e) {
      // ✅ 點到任何帶 data-sheet-close 的元素（或其子元素）時，不要阻擋冒泡
      // 讓 body 的委派可以收到事件並關閉抽屜
      if (e.target && e.target.closest && e.target.closest('[data-sheet-close]')) return;

      // 其他點擊才阻擋冒泡
      e.stopPropagation();
    });
  })();

  // ===== S1：點「抽屜以外」關閉資訊抽屜（不影響 marker / 地圖操作）=====
  (function bindOutsideClickForPlaceSheet() {
    document.addEventListener('pointerdown', function (e) {
      // 只在 BROWSE
      if (state.mode !== Mode.BROWSE) return;

      // 抽屜沒開，不處理
      if (!sheetPlace || !sheetPlace.classList.contains('bottom-sheet--open')) return;

      // 點在抽屜內 → 不關
      if (sheetPlace.contains(e.target)) return;

      // 點在 marker（Google Maps 會用 img / button / aria-role）
      if (e.target.closest('[role="button"], img, canvas')) return;

      // 點在 modal / toolbar / 搜尋列
      if (e.target.closest('.app-toolbar, .modal, .pac-container')) return;

      if (window.FocusCamera && typeof window.FocusCamera.restoreOverview === 'function') {
        window.FocusCamera.restoreOverview();
      }

      closeSheet('sheet-place');
      state.currentPlace = null;
      collapsePlaceDetails(true);
    }, { passive: true });
  })();

  // ===== POI：點「抽屜以外」關閉 POI 抽屜（不影響 marker / 地圖操作）=====
  (function bindOutsideClickForPoiSheet() {
    document.addEventListener('pointerdown', function (e) {
      if (state.mode !== Mode.BROWSE) return;

      if (!sheetPoi || !sheetPoi.classList.contains('bottom-sheet--open')) return;
      if (sheetPoi.contains(e.target)) return;

      if (e.target.closest('[role="button"], img, canvas')) return;
      if (e.target.closest('.app-toolbar, .modal, .pac-container')) return;

      closeSheet('sheet-poi');
    }, { passive: true });
  })();

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

});
