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

  var myLocationPoint = null;

  var sheetPlace = document.getElementById('sheet-place');
  var sheetRoute = document.getElementById('sheet-route');
  var modalPlaceForm = document.getElementById('modal-place-form');
  var placeForm = document.getElementById('place-form');

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

  if (typeof MapModule === 'undefined') {
    console.error('MapModule 未定義，請確認 map.js 是否有正確載入。');
    return;
  }

  MapModule.init({
    onSearchPlaceSelected: handleSearchPlaceSelected,
    onMapLongPressForNewPlace: handleMapLongPressForNewPlace
  });

  // ===== 搜尋列（Google Map 風格）：放大鏡搜尋 + 動態 X 清除 =====
  (function bindSearchBarUX() {
    var input = document.getElementById('map-search-input');
    var btnGo = document.getElementById('btn-search-go');
    var btnClear = document.getElementById('btn-search-clear');
    if (!input) return;

    function syncClearBtn() {
      if (!btnClear) return;
      var has = (input.value || '').trim().length > 0;
      if (has) btnClear.classList.add('is-show');
      else btnClear.classList.remove('is-show');
    }

    // 任何輸入變更 => 控制 X
    input.addEventListener('input', function () {
      syncClearBtn();
    }, { passive: true });

    // 按 X：清空 + 清 pin
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        input.value = '';
        syncClearBtn();
        if (MapModule && MapModule.clearSearchPin) MapModule.clearSearchPin();
        input.focus();
      });
    }

    // 放大鏡搜尋：若使用者沒選下拉選項，也能用文字查
    function doSearchByText() {
      var q = (input.value || '').trim();
      if (!q) return;

      if (MapModule && MapModule.searchByText) {
        MapModule.searchByText(q, function (err, info) {
          if (err) {
            alert('查無結果，請輸入更完整的地址或地標名稱。');
            return;
          }
          // 若你想：搜尋成功後保留文字、保持 X 顯示
          syncClearBtn();
        });
      }
    }

    if (btnGo) {
      btnGo.addEventListener('click', doSearchByText);
    }

    // Enter 也觸發搜尋（符合一般搜尋習慣）
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearchByText();
      }
    });

    // 初始同步一次
    syncClearBtn();
  })();


  loadMeNonBlocking();
  refreshPlaces();
  initMyLocationNonBlocking();
  applyMode(Mode.BROWSE);

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
    btnPlaceSave.addEventListener('click', handlePlaceSave);
  }

  if (btnPlaceEdit) {
    btnPlaceEdit.addEventListener('click', function () {
      if (state.mode !== Mode.BROWSE) return;
      if (!state.currentPlace) return;
      openPlaceFormForEdit(state.currentPlace);
    });
  }

  if (btnPlaceDelete) {
    btnPlaceDelete.addEventListener('click', function () {
      if (state.mode !== Mode.BROWSE) return;
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
      closeSheet('sheet-place');
      state.currentPlace = null;
      collapsePlaceDetails(true);
    });

    if (!escBound) {
      escBound = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closeSheet('sheet-place');
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

    if (target && (target.matches('[data-modal-close]') || target.matches('.modal__backdrop'))) {
      var id = target.getAttribute('data-modal-close') || 'modal-place-form';
      closeModal(id);
      if (MapModule.clearTempNewPlaceLatLng) MapModule.clearTempNewPlaceLatLng();
    }

    if (target && target.matches('[data-sheet-close]')) {
      var sid = target.getAttribute('data-sheet-close');
      if (sid === 'sheet-route') return;
      closeSheet(sid);
    }
  });

  // S2：路線規劃模式下點地圖空白 → 離開規劃（保留清單、不詢問）
  document.addEventListener('map:blankClick', function () {
    exitPlanningSilent();
  });

  function loadMeNonBlocking() {
    apiRequest('/auth/me', 'GET')
      .then(function (me) {
        state.me = me || null;

        if (navUserNameEl && me && me.name) {
          navUserNameEl.textContent = me.name;
        }

        if (me && isFinite(me.county_center_lat) && isFinite(me.county_center_lng)) {
          state.fallbackCenter = { lat: Number(me.county_center_lat), lng: Number(me.county_center_lng) };
          if (!myLocationPoint && MapModule && MapModule.showMyLocation) {
            MapModule.showMyLocation(state.fallbackCenter.lat, state.fallbackCenter.lng);
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

        MapModule.setMode(state.mode, state.routePoints);
        updateRouteBadge();
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

        myLocationPoint = {
          id: '__me',
          soldier_name: '目前位置',
          category: 'CURRENT',
          target_name: '',
          address: '',
          note: '',
          lat: lat,
          lng: lng
        };

        MapModule.showMyLocation(lat, lng);

        if (state.mode === Mode.ROUTE_PLANNING || state.mode === Mode.ROUTE_READY) {
          ensureStartPoint();
          renderRouteList();
          MapModule.setMode(state.mode, state.routePoints);
          updateCommitState();
        }
      },
      function (err) {
        console.warn('geolocation fail:', err && err.message ? err.message : err);
        panToFallbackIfNeeded();
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
    );
  }

  function panToFallbackIfNeeded() {
    if (state.fallbackCenter && MapModule && MapModule.showMyLocation) {
      MapModule.showMyLocation(state.fallbackCenter.lat, state.fallbackCenter.lng);
    }
  }

  function ensureStartPoint() {
    if (!myLocationPoint) {
      if (state.fallbackCenter && isFinite(state.fallbackCenter.lat) && isFinite(state.fallbackCenter.lng)) {
        myLocationPoint = {
          id: '__me',
          soldier_name: '起點（縣市中心）',
          category: 'CURRENT',
          target_name: '',
          address: (state.me && state.me.organization_county) ? (state.me.organization_county + '（推定）') : '',
          note: '',
          lat: state.fallbackCenter.lat,
          lng: state.fallbackCenter.lng
        };
      } else {
        myLocationPoint = {
          id: '__me',
          soldier_name: '起點（未定位）',
          category: 'CURRENT',
          target_name: '',
          address: '',
          note: '',
          lat: null,
          lng: null
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
  }

  function handleSearchPlaceSelected(place) {
    console.log('搜尋定位結果：', place.formatted_address || place.name || '');
  }

  function handleMapLongPressForNewPlace(latLng, address) {
    if (state.mode !== Mode.BROWSE) return;

    if (placeForm && placeForm.reset) placeForm.reset();

    var idInput = document.getElementById('place-id');
    var addrInput = document.getElementById('place-address');
    var titleEl = document.getElementById('modal-place-title');

    if (idInput) idInput.value = '';
    if (addrInput) addrInput.value = address || '';
    if (titleEl) titleEl.textContent = '新增標記';

    openModal('modal-place-form');
  }

  function handleMarkerClickInBrowseMode(place) {
    if (state.mode !== Mode.BROWSE) return;

    state.currentPlace = place;

    fillPlaceSheet(place);
    collapsePlaceDetails(true);

    openSheet('sheet-place');
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
  }


  function indexOfRoutePoint(id) {
    for (var i = 0; i < state.routePoints.length; i++) {
      if (state.routePoints[i] && state.routePoints[i].id === id) return i;
    }
    return -1;
  }

  function fillPlaceSheet(place) {
    var elName = document.getElementById('sheet-place-name');
    var elCat = document.getElementById('sheet-place-category');
    var elAddr = document.getElementById('sheet-place-address');
    var elTarget = document.getElementById('sheet-place-target');
    var elNote = document.getElementById('sheet-place-note');

    if (elName) elName.textContent = place.soldier_name || '—';
    if (elCat) elCat.textContent = place.category_label || place.category || '—';
    if (elAddr) elAddr.textContent = place.address || '—';
    if (elTarget) elTarget.textContent = place.target_name || '—';
    if (elNote) elNote.textContent = place.note || '—';

    // C2 詳細欄位（place 可能沒有某些欄位，沒有就顯示 —）
    setText('sheet-place-visit-name', place.visit_name || '—');
    setText('sheet-place-township', place.township || '—');
    setText('sheet-place-created-at', formatDateTime(place.created_at) || '—');
    setText('sheet-place-updated-at', formatDateTime(place.updated_at) || '—');

    var lat = (place.lat !== undefined && place.lat !== null) ? String(place.lat) : '';
    var lng = (place.lng !== undefined && place.lng !== null) ? String(place.lng) : '';
    setText('sheet-place-latlng', (lat && lng) ? (lat + ', ' + lng) : '—');
    // S1：抽屜內按鈕要依是否已加入路線切換：加入路線 / 取消路線
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
  }

  function collapsePlaceDetails(force) {
    if (!detailsWrap) return;

    detailsWrap.classList.remove('is-expanded');
    detailsWrap.classList.add('is-collapsed');
    detailsWrap.setAttribute('aria-hidden', 'true');

    if (btnPlaceDetail) btnPlaceDetail.textContent = '詳細';
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

      var title = p.soldier_name || (p.id === '__me' ? '目前位置' : '未命名');
      var sub = p.address || '';
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
      });
    });
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

  function openPlaceFormForEdit(place) {
    var idInput = document.getElementById('place-id');
    var nameInput = document.getElementById('place-soldier-name');
    var catSelect = document.getElementById('place-category');
    var targetInput = document.getElementById('place-target-name');
    var addrInput = document.getElementById('place-address');
    var noteInput = document.getElementById('place-note');
    var titleEl = document.getElementById('modal-place-title');

    if (idInput) idInput.value = place.id;
    if (nameInput) nameInput.value = place.soldier_name || '';
    if (catSelect) catSelect.value = place.category || '';
    if (targetInput) targetInput.value = place.target_name || '';
    if (addrInput) addrInput.value = place.address || '';
    if (noteInput) noteInput.value = place.note || '';
    if (titleEl) titleEl.textContent = '編輯標記';

    openModal('modal-place-form');
  }

  async function handlePlaceSave() {
    if (!placeForm) return;
    if (state.mode !== Mode.BROWSE) return;

    var formData = new FormData(placeForm);
    var id = formData.get('id');

    var payload = {
      soldier_name: (formData.get('soldier_name') || '').toString().trim(),
      category: (formData.get('category') || '').toString().trim(),
      target_name: (formData.get('target_name') || '').toString().trim(),
      address: (formData.get('address') || '').toString().trim(),
      note: (formData.get('note') || '').toString().trim()
    };

    if (!payload.soldier_name || !payload.category) {
      alert('官兵姓名與類別為必填欄位。');
      return;
    }

    var latLng = MapModule.getTempNewPlaceLatLng ? MapModule.getTempNewPlaceLatLng() : null;

    try {
      if (id) {
        var base = state.currentPlace && String(state.currentPlace.id) === String(id) ? state.currentPlace : null;
        payload.lat = latLng ? latLng.lat() : (base ? base.lat : null);
        payload.lng = latLng ? latLng.lng() : (base ? base.lng : null);

        if (payload.lat === null || payload.lng === null) {
          alert('編輯時缺少座標資訊，請在地圖上重新長按選擇位置後再儲存。');
          return;
        }

        await PlacesApi.update(id, payload);
      } else {
        if (!latLng) {
          alert('請在地圖上長按選擇位置後再儲存。');
          return;
        }
        payload.lat = latLng.lat();
        payload.lng = latLng.lng();

        await PlacesApi.create(payload);
      }

      closeModal('modal-place-form');
      if (MapModule.clearTempNewPlaceLatLng) MapModule.clearTempNewPlaceLatLng();

      closeSheet('sheet-place');
      state.currentPlace = null;

      await refreshPlaces();
    } catch (err) {
      console.error(err);
      alert((err && err.message) ? err.message : '儲存失敗');
    }
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

    el.classList.add('bottom-sheet--open');

    // ❌ S1 資訊抽屜「不要」開 backdrop，地圖必須可操作
    if (id === 'sheet-place') {
      setPlaceSheetBackdrop(false);
    }
  }

  function closeSheet(id) {
    var el = document.getElementById(id);
    if (!el) return;

    el.classList.remove('bottom-sheet--open');

    if (id === 'sheet-place') {
      setPlaceSheetBackdrop(false);
    }
  }

  // 防止點擊抽屜內容誤觸 backdrop
  (function bindSheetStopPropagation() {
    var sheet = document.getElementById('sheet-place');
    if (!sheet) return;

    sheet.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
  })();

  function openModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('modal--open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-modal-open');
  }

  function closeModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('modal--open');
    el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-modal-open');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
   // ===== S1：點地圖空白 → 關閉資訊抽屜（不靠 backdrop）=====
  (function bindMapClickToCloseSheet() {
    var mapEl = document.getElementById('map'); // ⚠️ 如果你的地圖不是這個 id，等下跟我說
    if (!mapEl) return;

    mapEl.addEventListener('click', function (e) {
      // 只處理瀏覽模式
      if (state.mode !== Mode.BROWSE) return;

      // 點在資訊抽屜本體內，不關
      if (sheetPlace && sheetPlace.contains(e.target)) return;

      closeSheet('sheet-place');
      state.currentPlace = null;
      collapsePlaceDetails(true);
    }, true); // ★ 一定要 capture
  })();

});
