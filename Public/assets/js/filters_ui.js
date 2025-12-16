// Path: Public/assets/js/filters_ui.js
// 說明：篩選面板 UI（外掛）
// - 依 /api/filters/options.php 動態產生 checkbox
// - 任何選取變更 → FilterCore.setState(...)（FilterCore 內部會自動 apply）
// - 65 歲以上：用 checkbox 做「單選」（ALL/Y/N）

(function () {
  function $(id) { return document.getElementById(id); }

  function fetchJson(url) {
    return fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    }).then(function (r) { return r.json(); });
  }

  function renderGrid(container, items, opts) {
    opts = opts || {};
    var name = opts.name || 'x';
    var checked = opts.checked || {}; // {value:true}
    var single = !!opts.single;
    var keepOne = !!opts.keepOne; // 單選時：至少保留一個被勾選

    container.innerHTML = '';

    if (!items || items.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'filter-empty';
      empty.textContent = '無可用選項';
      container.appendChild(empty);
      return;
    }

    items.forEach(function (it) {
      var value = String(it.value);
      var label = String(it.label);

      var wrap = document.createElement('label');
      wrap.className = 'filter-checkitem';

      var input = document.createElement('input');
      input.type = 'checkbox';
      input.name = name;
      input.value = value;
      input.checked = !!checked[value];

      var text = document.createElement('span');
      text.className = 'filter-checktext';
      text.title = label;
      text.textContent = label;

      wrap.appendChild(input);
      wrap.appendChild(text);
      container.appendChild(wrap);

      if (single) {
        input.addEventListener('change', function () {
          if (input.checked) {
            var all = container.querySelectorAll('input[type="checkbox"][name="' + name + '"]');
            Array.prototype.forEach.call(all, function (x) {
              if (x !== input) x.checked = false;
            });
          } else if (keepOne) {
            input.checked = true;
          }
          if (typeof opts.onChange === 'function') opts.onChange();
        });
      } else {
        input.addEventListener('change', function () {
          if (typeof opts.onChange === 'function') opts.onChange();
        });
      }
    });
  }

  function getCheckedValues(container) {
    var list = [];
    var nodes = container.querySelectorAll('input[type="checkbox"]');
    Array.prototype.forEach.call(nodes, function (n) {
      if (n.checked) list.push(String(n.value));
    });
    return list;
  }

  function getSingleValue(container, fallback) {
    var nodes = container.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].checked) return String(nodes[i].value);
    }
    return fallback;
  }

  function setAllUnchecked(container) {
    var nodes = container.querySelectorAll('input[type="checkbox"]');
    Array.prototype.forEach.call(nodes, function (n) { n.checked = false; });
  }

  function setSingleChecked(container, value) {
    var nodes = container.querySelectorAll('input[type="checkbox"]');
    Array.prototype.forEach.call(nodes, function (n) { n.checked = (String(n.value) === String(value)); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.FilterCore) return;

    window.FilterCore.init();

    var btnOpen = $('btn-filter');
    var panel = $('filter-panel');
    var btnClear = $('btn-filter-clear');
    var btnClose = $('btn-filter-close');

    var elReside = $('filter-reside-town');
    var elManaged = $('filter-managed-town');
    var elCat = $('filter-category');
    var elOver65 = $('filter-over65');

    var elCntV = $('filter-count-visible');
    var elCntD = $('filter-count-dimmed');

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

    if (btnOpen) btnOpen.addEventListener('click', openPanel);
    if (btnClose) btnClose.addEventListener('click', closePanel);

    if (panel) {
      panel.addEventListener('click', function (e) {
        var t = e.target;
        if (!t) return;
        if (t.classList && t.classList.contains('filter-panel__backdrop')) closePanel();
        if (t.getAttribute && t.getAttribute('data-filter-close') === '1') closePanel();
      });
    }

    document.addEventListener('filters:stats', function (e) {
      var d = (e && e.detail) ? e.detail : {};
      if (elCntV) elCntV.textContent = String(d.visible || 0);
      if (elCntD) elCntD.textContent = String(d.dimmed || 0);
    });

    function syncStateFromUI() {
      var reside = elReside ? getCheckedValues(elReside) : [];
      var managed = elManaged ? getCheckedValues(elManaged) : [];
      var cats = elCat ? getCheckedValues(elCat) : [];
      var over65 = elOver65 ? getSingleValue(elOver65, 'ALL') : 'ALL';

      window.FilterCore.setState({
        resideTowns: reside,
        managedTowns: managed,
        categories: cats,
        over65: over65
      });
    }

    function loadOptions() {
      if (elReside) elReside.innerHTML = '<div class="filter-loading">載入中...</div>';
      if (elManaged) elManaged.innerHTML = '<div class="filter-loading">載入中...</div>';
      if (elCat) elCat.innerHTML = '<div class="filter-loading">載入中...</div>';
      if (elOver65) elOver65.innerHTML = '<div class="filter-loading">載入中...</div>';

      fetchJson('api/filters/options.php').then(function (json) {
        // 兼容 {success:true,data:{...}} / {ok:true,data:{...}} / 直接 data
        var data = (json && json.data) ? json.data : json;
        data = (data && data.data) ? data.data : data;

        var st = window.FilterCore.getState();

        var resideItems = (data.reside_towns || []).map(function (t) {
          return { value: String(t.town_code), label: String(t.town_name) };
        });
        renderGrid(elReside, resideItems, {
          name: 'filter-reside',
          checked: (function () {
            var m = {}; (st.resideTowns || []).forEach(function (v) { m[String(v)] = true; }); return m;
          })(),
          onChange: syncStateFromUI
        });

        var managedItems = (data.managed_towns || []).map(function (t) {
          return { value: String(t.town_code), label: String(t.town_name) };
        });
        renderGrid(elManaged, managedItems, {
          name: 'filter-managed',
          checked: (function () {
            var m = {}; (st.managedTowns || []).forEach(function (v) { m[String(v)] = true; }); return m;
          })(),
          onChange: syncStateFromUI
        });

        var catItems = (data.categories || []).map(function (c) {
          return { value: String(c), label: String(c) };
        });
        renderGrid(elCat, catItems, {
          name: 'filter-cat',
          checked: (function () {
            var m = {}; (st.categories || []).forEach(function (v) { m[String(v)] = true; }); return m;
          })(),
          onChange: syncStateFromUI
        });

        var overItems = (data.over65 || [
          { value: 'ALL', label: '不限' },
          { value: 'Y', label: '是' },
          { value: 'N', label: '否' }
        ]).map(function (x) {
          return { value: String(x.value), label: String(x.label) };
        });

        var overChecked = {};
        overChecked[String(st.over65 || 'ALL')] = true;

        renderGrid(elOver65, overItems, {
          name: 'filter-over65',
          checked: overChecked,
          single: true,
          keepOne: true,
          onChange: syncStateFromUI
        });

        syncStateFromUI(); // 首次套用
      }).catch(function (err) {
        console.error(err);
        if (elReside) elReside.innerHTML = '<div class="filter-empty">載入失敗</div>';
        if (elManaged) elManaged.innerHTML = '<div class="filter-empty">載入失敗</div>';
        if (elCat) elCat.innerHTML = '<div class="filter-empty">載入失敗</div>';
        if (elOver65) elOver65.innerHTML = '<div class="filter-empty">載入失敗</div>';
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', function () {
        if (elReside) setAllUnchecked(elReside);
        if (elManaged) setAllUnchecked(elManaged);
        if (elCat) setAllUnchecked(elCat);
        if (elOver65) setSingleChecked(elOver65, 'ALL');
        window.FilterCore.clear();
      });
    }

    loadOptions();
  });
})();
