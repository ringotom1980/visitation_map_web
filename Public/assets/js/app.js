// Public/assets/js/app.js

document.addEventListener('DOMContentLoaded', () => {
  const state = {
    routeMode: false,
    currentPlace: null,
    routePlaces: [], // 用 place 物件陣列記順序
  };

  // 主要 DOM
  const sheetPlace = document.getElementById('sheet-place');
  const sheetRoute = document.getElementById('sheet-route');
  const modalPlaceForm = document.getElementById('modal-place-form');
  const placeForm = document.getElementById('place-form');

  const btnAddPlace = document.getElementById('btn-add-place');
  const btnRouteMode = document.getElementById('btn-route-mode');
  const btnRouteExit = document.getElementById('btn-route-exit');
  const btnRouteCommit = document.getElementById('btn-route-commit');
  const btnRouteOpenGmaps = document.getElementById('btn-route-open-gmaps');

  const btnPlaceSave = document.getElementById('btn-place-save');
  const btnPlaceEdit = document.getElementById('btn-place-edit');
  const btnPlaceDelete = document.getElementById('btn-place-delete');

  const routeListEl = document.getElementById('route-list');

  // 初始化地圖
  MapModule.init({
    onSearchPlaceSelected: handleSearchPlaceSelected,
    onMapClickForNewPlace: handleMapClickForNewPlace,
  });

  // 先載入地點列表並顯示於地圖
  refreshPlaces();

  // 事件註冊
  btnAddPlace?.addEventListener('click', () => {
    // 進入「地圖上點一下決定位置」模式
    MapModule.enableAddPlaceMode();
    openPlaceFormForCreate();
  });

  btnRouteMode?.addEventListener('click', () => {
    toggleRouteMode(!state.routeMode);
  });

  btnRouteExit?.addEventListener('click', () => {
    toggleRouteMode(false);
  });

  btnRouteCommit?.addEventListener('click', () => {
    // 將 routePlaces 丟給 Directions API（之後可擴充）
    if (state.routePlaces.length < 2) {
      alert('請至少選擇兩個拜訪地點。');
      return;
    }
    alert('這裡之後會接 Directions API 計算距離/時間。');
  });

  btnRouteOpenGmaps?.addEventListener('click', () => {
    if (state.routePlaces.length < 2) {
      alert('請至少選擇兩個拜訪地點。');
      return;
    }
    const url = MapModule.buildDirectionsUrl(state.routePlaces);
    if (url) {
      window.open(url, '_blank');
    }
  });

  // 標記資訊卡的操作
  btnPlaceSave?.addEventListener('click', handlePlaceSave);
  btnPlaceEdit?.addEventListener('click', () => {
    if (!state.currentPlace) return;
    openPlaceFormForEdit(state.currentPlace);
  });
  btnPlaceDelete?.addEventListener('click', handlePlaceDelete);

  // modal / sheet 通用關閉
  document.body.addEventListener('click', (evt) => {
    const target = evt.target;

    // 關閉 modal
    if (
      target.matches('[data-modal-close]') ||
      target.matches('.modal__backdrop')
    ) {
      const id = target.getAttribute('data-modal-close') || 'modal-place-form';
      closeModal(id);
    }

    // 關閉 bottom-sheet
    if (target.matches('[data-sheet-close]')) {
      const id = target.getAttribute('data-sheet-close');
      closeSheet(id);
    }
  });

  /* ========== 實作區 ========== */

  async function refreshPlaces() {
    try {
      const data = await PlacesApi.list();
      const places = data.items || data; // 看你 API 的回傳格式，這裡先兼容
      // 顯示在地圖上
      MapModule.setPlaces(
        places,
        handleMarkerClickInNormalMode,
        handleMarkerClickInRouteMode
      );
      // 之後可在這裡更新「地點列表頁」等
    } catch (err) {
      console.error(err);
      alert('載入地點資料失敗');
    }
  }

  function handleSearchPlaceSelected(place) {
    // 只幫忙移動地圖，不新增資料
    console.log('搜尋定位結果：', place.formatted_address || place.name);
  }

  function handleMapClickForNewPlace(latLng) {
    // 把經緯度暫存到表單（之後儲存時送給後端）
    // 可選擇先呼叫 Geocoding API 反查地址再填入 place-address
    document.getElementById('place-address').value = '';
    // 你之後如果有 Geocoding API，可在這裡反查地址並填入
  }

  function handleMarkerClickInNormalMode(place) {
    state.currentPlace = place;
    fillPlaceSheet(place);
    openSheet('sheet-place');
  }

  function handleMarkerClickInRouteMode(place) {
    // 不重複加入
    if (state.routePlaces.find((p) => p.id === place.id)) {
      return;
    }
    state.routePlaces.push(place);
    renderRouteList();
  }

  function toggleRouteMode(enabled) {
    state.routeMode = enabled;
    MapModule.enableRouteMode(enabled);

    if (enabled) {
      state.routePlaces = [];
      openSheet('sheet-route');
      btnRouteMode.classList.add('fab--active');
    } else {
      state.routePlaces = [];
      renderRouteList();
      closeSheet('sheet-route');
      btnRouteMode.classList.remove('fab--active');
    }
  }

  function fillPlaceSheet(place) {
    document.getElementById('sheet-place-name').textContent =
      place.soldier_name || '—';
    document.getElementById('sheet-place-category').textContent =
      place.category_label || place.category || '—';
    document.getElementById('sheet-place-address').textContent =
      place.address || '—';
    document.getElementById('sheet-place-target').textContent =
      place.target_name || '—';
    document.getElementById('sheet-place-note').textContent =
      place.note || '—';
  }

  function renderRouteList() {
    routeListEl.innerHTML = '';
    state.routePlaces.forEach((p, index) => {
      const el = document.createElement('div');
      el.className = 'route-item';
      el.dataset.id = p.id;

      el.innerHTML = `
        <div class="route-item__index">${index + 1}</div>
        <div class="route-item__content">
          <div>${p.soldier_name || '未命名'}</div>
          <div style="font-size:11px;color:#777;">${p.address || ''}</div>
        </div>
        <div class="route-item__handle">≡</div>
        <button type="button" class="route-item__remove">✕</button>
      `;

      el.querySelector('.route-item__remove').addEventListener('click', () => {
        state.routePlaces = state.routePlaces.filter((x) => x.id !== p.id);
        renderRouteList();
      });

      routeListEl.appendChild(el);
    });
    // 拖曳排序之後可以再用簡單的拖曳函式或套件補上
  }

  function openSheet(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('bottom-sheet--open');
  }

  function closeSheet(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('bottom-sheet--open');
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('modal--open');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('modal--open');
    el.setAttribute('aria-hidden', 'true');
  }

  function openPlaceFormForCreate() {
    placeForm.reset();
    document.getElementById('place-id').value = '';
    document.getElementById('modal-place-title').textContent = '新增標記';
    openModal('modal-place-form');
  }

  function openPlaceFormForEdit(place) {
    document.getElementById('place-id').value = place.id;
    document.getElementById('place-soldier-name').value =
      place.soldier_name || '';
    document.getElementById('place-category').value = place.category || '';
    document.getElementById('place-target-name').value =
      place.target_name || '';
    document.getElementById('place-address').value = place.address || '';
    document.getElementById('place-note').value = place.note || '';
    document.getElementById('modal-place-title').textContent = '編輯標記';
    openModal('modal-place-form');
  }

  async function handlePlaceSave() {
    const formData = new FormData(placeForm);
    const id = formData.get('id');
    const payload = {
      soldier_name: formData.get('soldier_name') || '',
      category: formData.get('category') || '',
      target_name: formData.get('target_name') || '',
      address: formData.get('address') || '',
      note: formData.get('note') || '',
    };

    // 經緯度從 MapModule.getTempNewPlaceLatLng() 或編輯時現有資料取得
    const latLng = MapModule.getTempNewPlaceLatLng();
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
