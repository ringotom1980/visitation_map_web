// Path: Public/assets/js/filters.js
// 說明：篩選核心（只負責：保存狀態、計算可見/淡化、通知 map.js 與 UI）
// - 條件：居住鄉鎮(可多)、列管鄉鎮(可多)、類別(可多)、65歲以上(單選：ALL/Y/N)
// - 規則：固定 AND（不提供 AND/OR 切換）
// - 路線點永遠顯示（不符合則淡化）

window.FilterCore = (function () {
  var state = {
    resideTowns: [],   // places.address_town_code
    managedTowns: [],  // places.managed_town_code
    categories: [],    // places.category
    over65: 'ALL'      // ALL/Y/N
  };

  var places = [];       // from places:loaded
  var routeKeepIds = []; // from route:changed (places ids)

  function normalizeArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return [v];
  }

  function setState(partial) {
    partial = partial || {};
    if (partial.resideTowns !== undefined) state.resideTowns = normalizeArray(partial.resideTowns).map(String);
    if (partial.managedTowns !== undefined) state.managedTowns = normalizeArray(partial.managedTowns).map(String);
    if (partial.categories !== undefined) state.categories = normalizeArray(partial.categories).map(String);
    if (partial.over65 !== undefined) state.over65 = String(partial.over65 || 'ALL');
    apply();
  }

  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  function setPlaces(list) {
    places = Array.isArray(list) ? list : [];
    apply();
  }

  function setRouteKeepIds(ids) {
    routeKeepIds = Array.isArray(ids) ? ids.map(String) : [];
    apply();
  }

  function clear() {
    state.resideTowns = [];
    state.managedTowns = [];
    state.categories = [];
    state.over65 = 'ALL';
    apply();
  }

  function matchPlace(p) {
    // 居住鄉鎮（address_town_code）
    if (state.resideTowns.length > 0) {
      if (!p.address_town_code || state.resideTowns.indexOf(String(p.address_town_code)) === -1) return false;
    }

    // 列管鄉鎮（managed_town_code）
    if (state.managedTowns.length > 0) {
      if (!p.managed_town_code || state.managedTowns.indexOf(String(p.managed_town_code)) === -1) return false;
    }

    // 類別
    if (state.categories.length > 0) {
      if (!p.category || state.categories.indexOf(String(p.category)) === -1) return false;
    }

    // 65+
    if (state.over65 !== 'ALL') {
      var v = String(p.beneficiary_over65 || '');
      if (state.over65 === 'Y' && v !== 'Y') return false;
      if (state.over65 === 'N' && v !== 'N') return false;
    }

    return true;
  }

  function buildFilterResult() {
    var anyActive =
      state.resideTowns.length > 0 ||
      state.managedTowns.length > 0 ||
      state.categories.length > 0 ||
      (state.over65 !== 'ALL');

    if (!anyActive) {
      return {
        active: false,
        visibleIds: [],
        dimIds: [],
        countVisible: places.length,
        countDimmed: 0
      };
    }

    var visibleIds = [];
    var dimIds = [];

    for (var i = 0; i < places.length; i++) {
      var p = places[i];
      var id = String(p.id);
      if (matchPlace(p)) visibleIds.push(id);
      else dimIds.push(id);
    }

    return {
      active: true,
      visibleIds: visibleIds,
      dimIds: dimIds,
      countVisible: visibleIds.length,
      countDimmed: dimIds.length
    };
  }

  function apply() {
    var res = buildFilterResult();

    if (window.MapModule && typeof window.MapModule.setFilterVisibility === 'function') {
      if (!res.active) {
        window.MapModule.setFilterVisibility(null, []);
      } else {
        // 傳 visibleIds + routeKeepIds（路線點永遠顯示）
        window.MapModule.setFilterVisibility(res.visibleIds, routeKeepIds);
      }
    }

    document.dispatchEvent(new CustomEvent('filters:stats', {
      detail: { visible: res.countVisible, dimmed: res.countDimmed }
    }));
  }

  function init() {
    document.addEventListener('places:loaded', function (e) {
      var list = (e && e.detail && e.detail.places) ? e.detail.places : [];
      setPlaces(list);
    });

    // app.js emitRouteChanged 會帶：detail.routePoints = [{id,...}, ...]
    document.addEventListener('route:changed', function (e) {
      var pts = (e && e.detail && Array.isArray(e.detail.routePoints)) ? e.detail.routePoints : [];
      var ids = pts.map(function (x) { return x && x.id ? String(x.id) : ''; })
                   .filter(function (x) { return x !== ''; });
      setRouteKeepIds(ids);
    });

    document.addEventListener('mode:changed', apply);
  }

  return {
    init: init,
    setState: setState,
    getState: getState,
    setPlaces: setPlaces,
    clear: clear,
    apply: apply
  };
})();
