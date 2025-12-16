// Path: Public/assets/js/filters.js
// 說明: FilterCore — 管理篩選狀態、計算符合/淡化、通知地圖層更新
// 本次調整：
// 1) 篩選條件只保留：居住鄉鎮市區、列管鄉鎮市區、類別、65歲以上
// 2) 關鍵字篩選（keyword）停用（導覽列已做）
// 3) reset/clear 要完整清掉所有條件（含 OR/AND、65+、checkbox）

(function () {
  'use strict';

  if (window.FilterCore) return;

  var FilterCore = (function () {
    var state = {
      managedTowns: [],   // values: town_code or district name
      resideTowns: [],    // values: town/district name (e.g., "苗栗市")
      categories: [],
      over65: 'ALL',
      logic: 'AND'
    };

    function residenceTownName(p) {
      // Prefer stored field, otherwise parse from address_text.
      var raw = (p && (p.address_town_code || p.addressTownCode)) ? String(p.address_town_code || p.addressTownCode) : '';
      if (!raw) raw = (p && p.address_text) ? String(p.address_text) : '';
      raw = raw.trim();
      if (!raw) return '';

      // Extract last segment ending with 市/區/鄉/鎮
      var m = raw.match(/([\u4e00-\u9fa5]{1,6}(?:市|區|鄉|鎮))/g);
      if (m && m.length) return m[m.length - 1];
      return raw;
    }

    function hasAny() {
      return !!(
        state.managedTowns.length ||
        state.resideTowns.length ||
        state.categories.length ||
        state.over65 !== 'ALL'
      );
    }

    function matchPlace(p) {
      var st = state;

      // AND / OR mode
      if (st.logic === 'OR') {
        var okAny = false;

        // managed
        if (st.managedTowns.length) {
          var mt = String((p.managed_town_code || p.managed_district || '')).trim();
          if (mt && st.managedTowns.indexOf(mt) !== -1) okAny = true;
        }

        // reside
        if (!okAny && st.resideTowns.length) {
          var rt = residenceTownName(p);
          if (rt && st.resideTowns.indexOf(rt) !== -1) okAny = true;
        }

        // category
        if (!okAny && st.categories.length) {
          var cat = String(p.category || '').trim();
          if (cat && st.categories.indexOf(cat) !== -1) okAny = true;
        }

        // over65
        if (!okAny && st.over65 !== 'ALL') {
          if (String(p.beneficiary_over65 || 'N') === st.over65) okAny = true;
        }

        // OR：若沒選任何條件 => 全部顯示
        if (!hasAny()) return true;
        return okAny;
      }

      // AND mode
      if (st.managedTowns.length) {
        var mt2 = String((p.managed_town_code || p.managed_district || '')).trim();
        if (!mt2 || st.managedTowns.indexOf(mt2) === -1) return false;
      }

      if (st.resideTowns.length) {
        var rt2 = residenceTownName(p);
        if (!rt2 || st.resideTowns.indexOf(rt2) === -1) return false;
      }

      if (st.categories.length) {
        var c2 = String(p.category || '').trim();
        if (!c2 || st.categories.indexOf(c2) === -1) return false;
      }

      if (st.over65 !== 'ALL') {
        if (String(p.beneficiary_over65 || 'N') !== st.over65) return false;
      }

      return true;
    }

    // External hook: called by UI and app/map layer
    function apply() {
      // 由 app.js / map.js 監聽此事件去更新 marker 顯示/淡化與統計數
      document.dispatchEvent(new CustomEvent('filters:changed', {
        detail: { state: state }
      }));
    }

    function reset() {
      state.managedTowns = [];
      state.resideTowns = [];
      state.categories = [];
      state.over65 = 'ALL';
      state.logic = 'AND';
    }

    return {
      state: function () { return JSON.parse(JSON.stringify(state)); },

      setManagedTowns: function (arr) { state.managedTowns = Array.isArray(arr) ? arr : []; },
      setResideTowns: function (arr) { state.resideTowns = Array.isArray(arr) ? arr : []; },
      setCategories: function (arr) { state.categories = Array.isArray(arr) ? arr : []; },
      setOver65: function (v) { state.over65 = (v === 'Y' || v === 'N') ? v : 'ALL'; },
      setLogic: function (v) { state.logic = (v === 'OR') ? 'OR' : 'AND'; },

      matchPlace: matchPlace,
      apply: apply,
      reset: reset
    };
  })();

  window.FilterCore = FilterCore;

})();
