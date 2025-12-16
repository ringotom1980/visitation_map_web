// Path: Public/assets/js/filters_ui.js
// 說明:
// - 篩選面板 UI：三欄 checkbox（居住鄉鎮 / 列管鄉鎮 / 類別）
// - 選項全部「動態生成」：
//   * 類別：由 places.category 去重
//   * 居住鄉鎮：由 places.address_town_code 優先，否則由 address_text 解析（只顯示鄉鎮市區，不含縣市）
//   * 列管鄉鎮：由 /managed_towns/list 取得可選清單，再與 places 實際存在 managed_town_code 取交集
// - 清除：清掉 checkbox + 65+ + AND/OR + FilterCore 狀態

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function uniq(arr) {
    var map = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = String(arr[i] || '').trim();
      if (!v) continue;
      if (!map[v]) { map[v] = 1; out.push(v); }
    }
    return out;
  }

  function residenceTownName(p) {
    var raw = (p && p.address_town_code) ? String(p.address_town_code) : '';
    if (!raw) raw = (p && p.address_text) ? String(p.address_text) : '';
    raw = raw.trim();
    if (!raw) return '';

    var m = raw.match(/([\u4e00-\u9fa5]{1,6}(?:市|區|鄉|鎮))/g);
    if (m && m.length) return m[m.length - 1];
    return raw;
  }

  function renderCheckboxGrid(containerEl, items, valueFn, labelFn, checkedValues) {
    if (!containerEl) return;

    containerEl.innerHTML = '';
    containerEl.classList.add('filter-checkgrid');

    checkedValues = checkedValues || [];
    var checkedMap = {};
    for (var i = 0; i < checkedValues.length; i++) checkedMap[String(checkedValues[i])] = true;

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
    for (var i = 0; i < cbs.length; i++) {
      if (cbs[i].checked) out.push(cbs[i].value);
    }
    return out;
  }

  function clearAllCheckbox(containerEl) {
    if (!containerEl) return;
    var cbs = containerEl.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < cbs.length; i++) cbs[i].checked = false;
  }

  // ---- DOM refs ----
  var panel = $('filter-panel');
  var btnOpen = $('btn-filter');
  var btnClear = $('btn-filter-clear');
  var btnClose = $('btn-filter-close');

  var elManaged = $('filter-managed-town'); // checkbox container
  var elReside  = $('filter-reside-town');  // checkbox container
  var elCat     = $('filter-category');     // checkbox container

  var elOver65  = $('filter-over65');
  var elLogicAnd = document.querySelector('input[name="filter-logic"][value="AND"]');
  var elLogicOr  = document.querySelector('input[name="filter-logic"][value="OR"]');

  // ---- data caches ----
  var _managedList = []; // rows from managed_towns/list
  var _places = [];

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
      if (!t) return;
      if (t.getAttribute && t.getAttribute('data-filter-close') === '1') closePanel();
    });
  }

  function loadManagedTownsList() {
    // 後端已依登入者 organization 限制清單
    return apiRequest('/managed_towns/list', 'GET')
      .then(function (res) {
        var rows = (res && res.success && Array.isArray(res.data)) ? res.data : [];
        _managedList = rows;
      })
      .catch(function () {
        _managedList = [];
      });
  }

  function rebuildOptionsFromPlaces() {
    if (!_places || !_places.length) {
      renderCheckboxGrid(elCat, [], function (x) { return x; }, function (x) { return x; }, []);
      renderCheckboxGrid(elReside, [], function (x) { return x; }, function (x) { return x; }, []);
      renderCheckboxGrid(elManaged, [], function (x) { return x; }, function (x) { return x; }, []);
      return;
    }

    // categories
    var cats = [];
    for (var i = 0; i < _places.length; i++) {
      if (_places[i] && _places[i].category) cats.push(String(_places[i].category).trim());
    }
    cats = uniq(cats).sort();

    // residence towns
    var towns = [];
    for (var j = 0; j < _places.length; j++) {
      var tn = residenceTownName(_places[j]);
      if (tn) towns.push(tn);
    }
    towns = uniq(towns).sort();

    // managed towns: intersection(places.usedCodes, managedList.allowed)
    var usedCodes = {};
    for (var k = 0; k < _places.length; k++) {
      var c = _places[k] ? String(_places[k].managed_town_code || '').trim() : '';
      if (c) usedCodes[c] = 1;
    }

    var managedItems = [];
    for (var m = 0; m < _managedList.length; m++) {
      var r = _managedList[m];
      var code = String(r.town_code || '').trim();
      if (!code) continue;
      if (usedCodes[code]) managedItems.push(r);
    }

    var st = (window.FilterCore && window.FilterCore.state) ? window.FilterCore.state() : null;

    renderCheckboxGrid(elCat, cats,
      function (x) { return x; },
      function (x) { return x; },
      st ? st.categories : []
    );

    renderCheckboxGrid(elReside, towns,
      function (x) { return x; },
      function (x) { return x; },
      st ? st.resideTowns : []
    );

    renderCheckboxGrid(elManaged, managedItems,
      function (r) { return r.town_code; },
      function (r) { return String(r.town_name || r.town_code || '').trim(); },
      st ? st.managedTowns : []
    );
  }

  function onAnyFilterChanged() {
    if (!window.FilterCore) return;

    var managed = readCheckedValues(elManaged);
    var reside  = readCheckedValues(elReside);
    var cats    = readCheckedValues(elCat);

    var over65 = elOver65 ? elOver65.value : 'ALL';
    var logic = (elLogicOr && elLogicOr.checked) ? 'OR' : 'AND';

    window.FilterCore.setManagedTowns(managed);
    window.FilterCore.setResideTowns(reside);
    window.FilterCore.setCategories(cats);
    window.FilterCore.setOver65(over65);
    window.FilterCore.setLogic(logic);

    window.FilterCore.apply();
  }

  function wireCheckboxChange(containerEl) {
    if (!containerEl) return;
    containerEl.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.type !== 'checkbox') return;
      onAnyFilterChanged();
    });
  }

  function wireStaticControls() {
    if (elOver65) elOver65.addEventListener('change', onAnyFilterChanged);
    if (elLogicAnd) elLogicAnd.addEventListener('change', onAnyFilterChanged);
    if (elLogicOr) elLogicOr.addEventListener('change', onAnyFilterChanged);

    if (btnOpen) btnOpen.addEventListener('click', openPanel);
    if (btnClose) btnClose.addEventListener('click', closePanel);

    if (btnClear) {
      btnClear.addEventListener('click', function () {
        // 1) 清 UI
        clearAllCheckbox(elManaged);
        clearAllCheckbox(elReside);
        clearAllCheckbox(elCat);
        if (elOver65) elOver65.value = 'ALL';
        if (elLogicAnd) elLogicAnd.checked = true;
        if (elLogicOr) elLogicOr.checked = false;

        // 2) 清 FilterCore + 觸發刷新
        if (window.FilterCore) {
          window.FilterCore.reset();
          window.FilterCore.apply();
        }
      });
    }
  }

  // 你現有 app.js 會 dispatch 這個事件（你貼過的程式碼已存在）
  document.addEventListener('places:loaded', function (e) {
    var places = e && e.detail && Array.isArray(e.detail.places) ? e.detail.places : [];
    _places = places;

    rebuildOptionsFromPlaces();
    wireCheckboxChange(elManaged);
    wireCheckboxChange(elReside);
    wireCheckboxChange(elCat);
  });

  // Boot
  wireCloseTriggers();
  wireStaticControls();

  // 先拿列管清單（依登入者單位），再等待 places:loaded 來做交集
  loadManagedTownsList().then(function () {
    if (_places && _places.length) rebuildOptionsFromPlaces();
  });

})();
