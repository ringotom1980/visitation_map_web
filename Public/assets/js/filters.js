// Path: Public/assets/js/filters.js
// 說明: 篩選核心（只保留 4 個：居住鄉鎮、列管鄉鎮、類別、65+）
// - AND 規則固定（不再提供 AND/OR UI）
// - 路線點永遠顯示：不符合則淡化，但不隱藏

window.FilterCore = (function () {
  var state = {
    resideTowns: [],   // [town_code]
    managedTowns: [],  // [town_code]
    categories: [],    // [string]
    over65: 'ALL'      // 'ALL' | 'Y' | 'N'
  };

  function _asSet(arr) {
    var s = Object.create(null);
    (arr || []).forEach(function (v) { s[String(v)] = true; });
    return s;
  }

  function setState(next) {
    state = Object.assign({}, state, next || {});
    apply();
  }

  function getState() {
    return Object.assign({}, state);
  }

  function clear() {
    state = {
      resideTowns: [],
      managedTowns: [],
      categories: [],
      over65: 'ALL'
    };
    apply();
  }

  function _matchPlace(place) {
    // 路線點永遠保留（由 MapModule 判斷）
    if (window.MapModule && typeof window.MapModule.isRoutePoint === 'function') {
      if (window.MapModule.isRoutePoint(place.id)) return true;
    }

    var resideSet = _asSet(state.resideTowns);
    var managedSet = _asSet(state.managedTowns);
    var catSet = _asSet(state.categories);

    // ① 居住鄉鎮市區：用 places.address_town_code
    if (state.resideTowns && state.resideTowns.length > 0) {
      var rtc = place.address_town_code ? String(place.address_town_code).trim() : '';
      if (!rtc || !resideSet[rtc]) return false;
    }

    // ② 列管鄉鎮市區：用 places.managed_town_code
    if (state.managedTowns && state.managedTowns.length > 0) {
      var mtc = place.managed_town_code ? String(place.managed_town_code).trim() : '';
      if (!mtc || !managedSet[mtc]) return false;
    }

    // ③ 類別
    if (state.categories && state.categories.length > 0) {
      var cat = place.category ? String(place.category).trim() : '';
      if (!cat || !catSet[cat]) return false;
    }

    // ④ 是否 65 歲以上
    if (state.over65 === 'Y' || state.over65 === 'N') {
      var v = place.beneficiary_over65 ? String(place.beneficiary_over65).trim() : 'N';
      if (v !== state.over65) return false;
    }

    return true;
  }

  function apply() {
    if (!window.MapModule || typeof window.MapModule.setFilterVisibility !== 'function') return;

    var result = window.MapModule.setFilterVisibility(_matchPlace);

    // result: { visibleCount, dimmedCount }（你的 map.js 目前就是這樣回）
    document.dispatchEvent(new CustomEvent('filters:applied', { detail: result || {} }));
  }

  // places 載入 / route 或 mode 變更時，重新套用
  document.addEventListener('places:loaded', apply);
  document.addEventListener('route:changed', apply);
  document.addEventListener('mode:changed', apply);

  return {
    setState: setState,
    getState: getState,
    clear: clear,
    apply: apply
  };
})();
