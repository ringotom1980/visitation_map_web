// Public/assets/js/app.js

document.addEventListener('DOMContentLoaded', function () {
  var state = {
    routeMode: false,
    currentPlace: null,
    routePlaces: [] // 用 place 物件陣列記順序
  };

  // 主要 DOM
  var sheetPlace = document.getElementById('sheet-place');
  var sheetRoute = document.getElementById('sheet-route');
  var modalPlaceForm = document.getElementById('modal-place-form');
  var placeForm = document.getElementById('place-form');

  var btnAddPlace = document.getElementById('btn-add-place');
  var btnRouteMode = document.getElementById('btn-route-mode');
  var btnRouteExit = document.getElementById('btn-route-exit');
  var btnRouteCommit = document.getElementById('btn-route-commit');
  var btnRouteOpenGmaps = document.getElementById('btn-route-open-gmaps');

  var btnPlaceSave = document.getElementById('btn-place-save');
  var btnPlaceEdit = document.getElementById('btn-place-edit');
  var btnPlaceDelete = document.getElementById('btn-place-delete');

  var routeListEl = document.getElementById('route-list');

  // 登出按鈕（app.php 右上角會放這顆）
  var btnLogout = document.getElementById('btn-logout');

  // 防呆：MapModule 要存在
  if (typeof MapModule === 'undefined') {
    console.error('MapModule 未定義，請確認 map.js 是否有正確載入。');
    return;
  }

  // 初始化地圖
  MapModule.init({
    onSearchPlaceSelected: handleSearchPlaceSelected,
    onMapClickForNewPlace: handleMapClickForNewPlace
  });

  // 先載入地點列表並顯示於地圖
  refreshPlaces();

  // ========== 事件註冊 ==========

  // ＋ 新增標記：只開啟「選點模式」，不立刻開表單（避免 modal 蓋住地圖）
  if (btnAddPlace) {
    btnAddPlace.addEventListener('click', function () {
      toggleRouteMode(false);        // 關掉路線模式避免干擾
      MapModule.enableAddPlaceMode();
      alert('請在地圖上點選要新增標記的位置。');
    });
  }

  if (btnRouteMode) {
    btnRouteMode.addEventListener('click', function () {
      toggleRouteMode(!state.routeMode);
    });
  }

  if (btnRouteExit) {
    btnRouteExit.addEventListener('click', function () {
      toggleRouteMode(false);
    });
  }

  if (btnRouteCommit) {
    btnRouteCommit.addEventListener('click', function () {
      if (state.routePlaces.length < 2) {
        alert('請至少選擇兩個拜訪地點。');
        return;
      }
      alert('這裡之後會接 Directions API 計算距離/時間。');
    });
  }

  if (btnRouteOpenGmaps) {
    btnRouteOpenGmaps.addEventListener('click', function () {
      if (state.routePlaces.length < 2) {
        alert('請至少選擇兩個拜訪地點。');
        return;
      }
      var url = MapModule.buildDirectionsUrl(state.routePlaces);
      if (url) {
        window.open(url, '_blank');
      }
    });
  }

  // 標記資訊卡的操作
  if (btnPlaceSave) {
    btnPlaceSave.addEventListener('click', handlePlaceSave);
  }

  if (btnPlaceEdit) {
    btnPlaceEdit.addEventListener('click', function () {
      if (!state.currentPlace) return;
      openPlaceFormForEdit(state.currentPlace);
    });
  }

  if (btnPlaceDelete) {
    btnPlaceDelete.addEventListener('click', handlePlaceDelete);
  }

  // 登出按鈕
  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      }).catch(function (err) {
        console.error('logout error:', err);
      }).finally(function () {
        window.location.href = '/login';
      });
    });
  }

  // modal / sheet 通用關閉
  document.body.addEventListener('click', function (evt) {
    var target = evt.target;

    // 關閉 modal
    if (
      target.matches('[data-modal-close]') ||
      target.matches('.modal__backdrop')
    ) {
      var id = target.getAttribute('data-modal-close') || 'modal-place-form';
      closeModal(id);
    }

    // 關閉 bottom-sheet
    if (target.matches('[data-sheet-close]')) {
      var sid = target.getAttribute('data-sheet-close');
      closeSheet(sid);
    }
  });

  /* ========== 實作區 ========== */

  function refreshPlaces() {
    fetch('/api/places/list', {
      credentials: 'same-origin'
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function (json) {
        if (!json || typeof json !== 'object') {
          throw new Error('回傳格式錯誤');
        }
        if (!json.success) {
          throw new Error(
            (json.error && json.error.message) || '載入地點資料失敗'
          );
        }

        var places = Array.isArray(json.data) ? json.data : [];

        // 把 marker click 的 callback 傳進 MapModule
        if (window.MapController && typeof window.MapController.setPlaces === 'function') {
          window.MapController.setPlaces(
            places,
            handleMarkerClickInNormalMode,
            handleMarkerClickInRouteMode
          );
        } else {
          console.warn('MapController.setPlaces 未定義，僅快取資料');
        }

        window.MAP_PLACES = places;
      })
      .catch(function (err) {
        console.error('refreshPlaces error:', err);
        alert('載入地點資料失敗');
      });
  }

  function handleSearchPlaceSelected(place) {
    console.log('搜尋定位結果：', place.formatted_address || place.name);
  }

  // 地圖點擊（新增模式時由 map.js 呼叫這個）
  function handleMapClickForNewPlace(latLng) {
    // 之後可以在這裡接 Geocoding 填地址，目前先清空
    var addrInput = document.getElementById('place-address');
    if (addrInput) {
      addrInput.value = '';
    }

    openPlaceFormForCreate();
  }

  function handleMarkerClickInNormalMode(place) {
    state.currentPlace = place;
    fillPlaceSheet(place);
    openSheet('sheet-place');
  }

  function handleMarkerClickInRouteMode(place) {
    var exist = state.routePlaces.some(function (p) {
      return p.id === place.id;
    });
    if (exist) return;

    state.routePlaces.push(place);
    renderRouteList();
  }

  function toggleRouteMode(enabled) {
    state.routeMode = enabled;
    MapModule.enableRouteMode(enabled);

    if (enabled) {
      state.routePlaces = [];
      openSheet('sheet-route');
      if (btnRouteMode) btnRouteMode.classList.add('fab--active');
    } else {
      state.routePlaces = [];
      renderRouteList();
      closeSheet('sheet-route');
      if (btnRouteMode) btnRouteMode.classList.remove('fab--active');
    }
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
  }

  function renderRouteList() {
    if (!routeListEl) return;

    routeListEl.innerHTML = '';
    state.routePlaces.forEach(function (p, index) {
      var el = document.createElement('div');
      el.className = 'route-item';
      el.dataset.id = p.id;

      el.innerHTML =
        '<div class="route-item__index">' + (index + 1) + '</div>' +
        '<div class="route-item__content">' +
        '  <div>' + (p.soldier_name || '未命名') + '</div>' +
        '  <div style="font-size:11px;color:#777;">' + (p.address || '') + '</div>' +
        '</div>' +
        '<div class="route-item__handle">≡</div>' +
        '<button type="button" class="route-item__remove">✕</button>';

      var btnRemove = el.querySelector('.route-item__remove');
      if (btnRemove) {
        btnRemove.addEventListener('click', function () {
          state.routePlaces = state.routePlaces.filter(function (x) {
            return x.id !== p.id;
          });
          renderRouteList();
        });
      }

      routeListEl.appendChild(el);
    });
  }

  function openSheet(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('bottom-sheet--open');
  }

  function closeSheet(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('bottom-sheet--open');
  }

  function openModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('modal--open');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('modal--open');
    el.setAttribute('aria-hidden', 'true');
  }

  function openPlaceFormForCreate() {
    if (placeForm && placeForm.reset) {
      placeForm.reset();
    }

    var idInput = document.getElementById('place-id');
    var titleEl = document.getElementById('modal-place-title');

    if (idInput) idInput.value = '';
    if (titleEl) titleEl.textContent = '新增標記';

    openModal('modal-place-form');
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

    var formData = new FormData(placeForm);
    var id = formData.get('id');
    var payload = {
      soldier_name: formData.get('soldier_name') || '',
      category: formData.get('category') || '',
      target_name: formData.get('target_name') || '',
      address: formData.get('address') || '',
      note: formData.get('note') || ''
    };

    var latLng = MapModule.getTempNewPlaceLatLng();
    if (!id && !latLng) {
      alert('請在地圖上點選位置後再儲存。');
      return;
    }
    if (latLng) {
      payload.lat = latLng.lat();
      payload.lng = latLng.lng();
    }

    try {
      if (id) {
        await PlacesApi.update(id, payload);
      } else {
        await PlacesApi.create(payload);
      }
      closeModal('modal-place-form');
      closeSheet('sheet-place');
      await refreshPlaces();
    } catch (err) {
      console.error(err);
      alert(err.message || '儲存失敗');
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
      alert(err.message || '刪除失敗');
    }
  }
});
