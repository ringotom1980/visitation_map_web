// Path: Public/assets/js/filters_ui.js
// 說明：篩選面板 UI（外掛）
// - 依 /api/filters/options 動態產生 checkbox
// - 任何選取變更 → FilterCore.setState(...)（FilterCore 內部會自動 apply）
// - 65 歲以上：用 checkbox 做「單選」（ALL/Y/N）

(function () {
  function $(id) { return document.getElementById(id); }

  function safeApiBase() {
    // 優先用 api.js 設定的 API_BASE；沒有就 fallback /api
    var base = (window.API_BASE || '/api');
    base = String(base || '/api').replace(/\/$/, '');
    return base;
  }

  function fetchJson(url) {
    return fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
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

  // Native checkboxes retain multi-select semantics and keyboard interaction.
  function makeRegionDropdown(container, label) {
    var wrapper = document.createElement('div');
    wrapper.className = 'region-multi';
    var trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'region-multi__trigger';
    trigger.setAttribute('aria-expanded', 'false');
    var body = document.createElement('div');
    body.id = container.id + '-dropdown'; body.hidden = true;
    body.className = 'region-multi__body';
    trigger.setAttribute('aria-controls', body.id);
    var search = document.createElement('input');
    search.type = 'search'; search.placeholder = '搜尋鄉鎮市區';
    search.setAttribute('aria-label', label + '：搜尋選項');
    var actions = document.createElement('div'); actions.className = 'region-multi__actions';
    var status = document.createElement('div'); status.className = 'region-multi__status';
    status.setAttribute('role', 'status');
    container.before(wrapper); wrapper.append(trigger, body);
    body.append(search, actions, container, status);
    container.className = 'region-multi__options';
    function refresh() {
      var query = search.value.trim().toLocaleLowerCase();
      var rows = container.querySelectorAll('.filter-checkitem');
      var count = 0, selected = [];
      rows.forEach(function (row) {
        var input = row.querySelector('input');
        if (input.checked) selected.push(row.textContent.trim());
        row.hidden = row.textContent.toLocaleLowerCase().indexOf(query) === -1;
        if (!row.hidden) count++;
      });
      trigger.textContent = '⌖ ' + (selected.length ? selected.slice(0, 2).join('、') + (selected.length > 2 ? '…' : '') + '（' + selected.length + '）' : '不限鄉鎮市區') + ' ▾';
      trigger.setAttribute('aria-label', label + '：' + (selected.length ? '已選 ' + selected.length + ' 個，' + selected.join('、') : '不限'));
      status.textContent = rows.length ? (count ? '顯示 ' + count + ' 個選項・已選 ' + selected.length + ' 個' : '找不到符合的鄉鎮市區') : '';
    }
    function close(returnFocus) { body.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (returnFocus) trigger.focus(); }
    trigger.addEventListener('click', function () {
      if (!body.hidden) { close(false); return; }
      document.dispatchEvent(new CustomEvent('regionDropdown:open', {detail: wrapper}));
      body.hidden = false; trigger.setAttribute('aria-expanded', 'true'); search.focus();
    });
    wrapper.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !body.hidden) { event.preventDefault(); event.stopPropagation(); close(true); }
    });
    document.addEventListener('click', function (event) { if (!wrapper.contains(event.target)) close(false); });
    document.addEventListener('keyup', function (event) { if (event.key === 'Tab' && !wrapper.contains(document.activeElement)) close(false); });
    document.addEventListener('regionDropdown:open', function (event) { if (event.detail !== wrapper) close(false); });
    search.addEventListener('input', refresh);
    container.addEventListener('change', refresh);
    ['全選', '清除'].forEach(function (text, index) {
      var button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.addEventListener('click', function () {
        container.querySelectorAll('input[type="checkbox"]').forEach(function (input) { input.checked = index === 0; });
        container.dispatchEvent(new Event('change', {bubbles:true}));
        var first = container.querySelector('input[type="checkbox"]');
        if (first) first.dispatchEvent(new Event('change', {bubbles:true}));
        refresh();
      });
      actions.appendChild(button);
    });
    container._refreshRegion = refresh;
    new MutationObserver(refresh).observe(container, {childList:true});
    refresh();
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

    if (elReside) makeRegionDropdown(elReside, '居住鄉鎮市區');
    if (elManaged) makeRegionDropdown(elManaged, '列管鄉鎮市區');

    var elCntV = $('filter-count-visible');
    var elCntD = $('filter-count-dimmed');

    function openPanel() {
      if (!panel) return;
      document.dispatchEvent(new CustomEvent('mapPanel:open', { detail: { panel: 'filter' } }));
      document.body.classList.add('has-filter-panel');
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
      panel.querySelector('.filter-panel__close').focus();
    }
    function closePanel() {
      if (!panel) return;
      var wasOpen = panel.classList.contains('is-open');
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('has-filter-panel');
      if (wasOpen && btnOpen) btnOpen.focus();
    }

    if (btnOpen) btnOpen.addEventListener('click', openPanel);
    document.addEventListener('mapPanel:open', function (e) { if (e.detail.panel !== 'filter') closePanel(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('is-open')) { closePanel(); btnOpen.focus(); } });
    if (btnClose) btnClose.addEventListener('click', closePanel);
    if (panel) panel.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || !panel.classList.contains('is-open')) return;
      var controls = Array.from(panel.querySelectorAll('button:not(:disabled),input:not(:disabled)')).filter(function (el) { return el.getClientRects().length > 0; });
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

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

      // ✅ 用 API_BASE 組絕對路徑（不帶 .php）
      var url = safeApiBase() + '/filters/options';

      fetchJson(url).then(function (json) {
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
        [elReside, elManaged].forEach(function (el) { if (el && el._refreshRegion) el._refreshRegion(); });
      });
    }

    loadOptions();
  });
})();
