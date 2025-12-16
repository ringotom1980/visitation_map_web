// Path: Public/assets/js/filters_ui.js
// 說明:
// - 篩選面板 UI：checkbox grid（居住4欄 / 列管4欄 / 類別2欄 / 65+ 3欄單選）
// - 選項全部「由後端依 DB 實際存在」生成：GET /filters/options
// - 不含 AND/OR、不含 keyword
// - 清除：清掉 checkbox + FilterCore 狀態並立即套用

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function renderCheckboxGrid(containerEl, items, valueFn, labelFn, checkedValues) {
    if (!containerEl) return;

    containerEl.innerHTML = '';
    checkedValues = checkedValues || [];
    var checkedMap = {};
    for (var i = 0; i < checkedValues.length; i++) checkedMap[String(checkedValues[i])] = true;

    if (!items || !items.length) {
      var empty = document.createElement('div');
      empty.className = 'filter-empty';
      empty.textContent = '（沒有可用選項）';
      containerEl.appendChild(empty);
      return;
    }

    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var v = String(valueFn(it));
      var label = String(labelFn(it));
      var id = containerEl.id + '__' + k;

      var wrap = document.createElement('label');
      wrap.className = 'filter-checkitem';
      wrap.setAttribute('for', id);

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.value = v;
      cb.checked = !!checkedMap[v];

      var span = document.createElement('span');
      span.className = 'filter-checktext';
      span.textContent = label;

      wrap.appendChild(cb);
      wrap.appendChild(span);
      containerEl.appendChild(wrap);
    }
  }

  function readCheckedValues(containerEl) {
    if (!containerEl) return [];
    var cbs = containerEl.querySelectorAll('input[type="checkbox"]');
    var out = [];
    for (var i = 0; i < cbs.length; i++) if (cbs[i].checked) out.push(cbs[i].value);
    return out;
  }

  function clearAllCheckbox(containerEl) {
    if (!containerEl) return;
    var cbs = containerEl.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < cbs.length; i++) cbs[i].checked = false;
  }

  // over65：checkbox 呈現但邏輯為「單選」
  function enforceSingleCheckbox(containerEl, clickedEl) {
    if (!containerEl || !clickedEl) return;
    if (!clickedEl.checked) {
      // 不允許全部取消：若取消則回到 ALL
      var all = containerEl.querySelector('input[type="checkbox"][value="ALL"]');
      if (all) all.checked = true;
      return;
    }
    var cbs = containerEl.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < cbs.length; i++) {
      if (cbs[i] !== clickedEl) cbs[i].checked = false;
    }
  }

  // ---- DOM refs ----
  var panel = $('filter-panel');
  var btnOpen = $('btn-filter');
  var btnClear = $('btn-filter-clear');
  var btnClose = $('btn-filter-close');

  var elReside  = $('filter-reside-town');   // 4欄
  var elManaged = $('filter-managed-town');  // 4欄
  var elCat     = $('filter-category');      // 2欄
  var elOver65  = $('filter-over65');        // 3欄（單選）

  // ---- data cache ----
  var _options = null;
  var _placesLoaded = false;

  function openPanel() {
    if (!panel) return;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
  }
  function closePanel() {
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  }

  function wireCloseTriggers() {
    if (!panel) return;
    panel.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-filter-close') === '1') closePanel();
    });
  }

  function loadOptions() {
    return apiRequest('/filters/options', 'GET')
      .then(function (res) {
        _options = (res && res.success) ? res.data : null;
      })
      .catch(function () { _options = null; });
  }

  function rebuildUI() {
    if (!_options) return;

    var st = (window.FilterCore && window.FilterCore.state) ? window.FilterCore.state() : null;

    // categories (value=category)
    renderCheckboxGrid(
      elCat,
      _options.categories || [],
      function (x) { return x; },
      function (x) { return x; },
      st ? st.categories : []
    );

    // reside towns (value=town_code, label=town_name)
    renderCheckboxGrid(
      elReside,
      _options.reside_towns || [],
      function (r) { return r.town_code; },
      function (r) { return r.town_name; },
      st ? st.resideTowns : []
    );

    // managed towns (value=town_code, label=town_name)
    renderCheckboxGrid(
      elManaged,
      _options.managed_towns || [],
      function (r) { return r.town_code; },
      function (r) { return r.town_name; },
      st ? st.managedTowns : []
    );

    // over65 (checkbox 單選)
    var overChecked = [st ? st.over65 : 'ALL'];
    renderCheckboxGrid(
      elOver65,
      _options.over65 || [],
      function (r) { return r.value; },
      function (r) { return r.label; },
      overChecked
    );
  }

  function onAnyFilterChanged() {
    if (!window.FilterCore) return;

    var managed = readCheckedValues(elManaged);
    var reside  = readCheckedValues(elReside);
    var cats    = readCheckedValues(elCat);

    var over65Arr = readCheckedValues(elOver65);
    var over65 = (over65Arr && over65Arr.length) ? over65Arr[0] : 'ALL';

    window.FilterCore.setManagedTowns(managed);
    window.FilterCore.setResideTowns(reside);
    window.FilterCore.setCategories(cats);
    window.FilterCore.setOver65(over65);

    window.FilterCore.apply();
  }

  function wireCheckboxChange(containerEl, opts) {
    if (!containerEl) return;
    containerEl.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.type !== 'checkbox') return;

      // over65 單選約束
      if (opts && opts.single) {
        enforceSingleCheckbox(containerEl, t);
      }
      onAnyFilterChanged();
    });
  }

  function wireStaticControls() {
    if (btnOpen) btnOpen.addEventListener('click', openPanel);
    if (btnClose) btnClose.addEventListener('click', closePanel);

    if (btnClear) {
      btnClear.addEventListener('click', function () {
        // 1) 清 UI
        clearAllCheckbox(elManaged);
        clearAllCheckbox(elReside);
        clearAllCheckbox(elCat);

        // over65 回到 ALL
        clearAllCheckbox(elOver65);
        var all = elOver65 ? elOver65.querySelector('input[type="checkbox"][value="ALL"]') : null;
        if (all) all.checked = true;

        // 2) 清 FilterCore + 立即套用
        if (window.FilterCore) {
          window.FilterCore.reset();
          window.FilterCore.apply();
        }
      });
    }
  }

  // places:loaded 只是表示 marker 資料已載入，可用來「稍後擴充」動態重建；
  // 目前選項由 DB API 統一供給，避免前端亂解析
  document.addEventListener('places:loaded', function () {
    _placesLoaded = true;
  });

  // Boot
  wireCloseTriggers();
  wireStaticControls();

  loadOptions().then(function () {
    rebuildUI();

    wireCheckboxChange(elManaged);
    wireCheckboxChange(elReside);
    wireCheckboxChange(elCat);
    wireCheckboxChange(elOver65, { single: true });

    // 初次載入後，若 FilterCore 已有狀態，立刻套用一次
    if (window.FilterCore) window.FilterCore.apply();
  });

})();
