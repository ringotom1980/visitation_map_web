// Path: Public/assets/js/filters.js
// 說明: FilterCore — 管理篩選狀態、計算符合/淡化、通知地圖層更新
// 條件只保留：居住鄉鎮市區、列管鄉鎮市區、類別、65歲以上（不含 AND/OR、不含 keyword）

(function () {
  'use strict';

  if (window.FilterCore) return;

  var FilterCore = (function () {
    var state = {
      managedTowns: [],   // values: town_code
      resideTowns: [],    // values: town_code
      categories: [],     // values: category string
      over65: 'ALL'       // ALL / Y / N
    };

    function hasAny() {
      return !!(
        state.managedTowns.length ||
        state.resideTowns.length ||
        state.categories.length ||
        state.over65 !== 'ALL'
      );
    }

    function matchPlace(p) {
      // 沒任何條件 => 全部顯示
      if (!hasAny()) return true;

      // 列管鄉鎮（town_code）
      if (state.managedTowns.length) {
        var mt = String((p.managed_town_code || '')).trim();
        if (!mt || state.managedTowns.indexOf(mt) === -1) return false;
      }

      // 居住鄉鎮（town_code）
      if (state.resideTowns.length) {
        var rt = String((p.address_town_code || p.addressTownCode || '')).trim();
        if (!rt || state.resideTowns.indexOf(rt) === -1) return false;
      }

      // 類別
      if (state.categories.length) {
        var c = String((p.category || '')).trim();
        if (!c || state.categories.indexOf(c) === -1) return false;
      }

      // 65+
      if (state.over65 !== 'ALL') {
        if (String(p.beneficiary_over65 || 'N') !== state.over65) return false;
      }

      return true;
    }

    function apply() {
      document.dispatchEvent(new CustomEvent('filters:changed', {
        detail: { state: state }
      }));
    }

    function reset() {
      state.managedTowns = [];
      state.resideTowns = [];
      state.categories = [];
      state.over65 = 'ALL';
    }

    return {
      state: function () { return JSON.parse(JSON.stringify(state)); },

      setManagedTowns: function (arr) { state.managedTowns = Array.isArray(arr) ? arr : []; },
      setResideTowns: function (arr) { state.resideTowns = Array.isArray(arr) ? arr : []; },
      setCategories: function (arr) { state.categories = Array.isArray(arr) ? arr : []; },
      setOver65: function (v) { state.over65 = (v === 'Y' || v === 'N') ? v : 'ALL'; },

      matchPlace: matchPlace,
      apply: apply,
      reset: reset
    };
  })();

  window.FilterCore = FilterCore;
})();
