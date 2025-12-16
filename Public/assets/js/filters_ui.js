// Path: Public/assets/js/filters_ui.js
// 說明: 篩選面板 UI（checkbox grids）
// - 居住鄉鎮市區：4欄 multi
// - 列管鄉鎮市區：4欄 multi
// - 類別：2欄 multi
// - 65歲以上：3欄 checkbox 但單選（ALL/Y/N）
// - 清除條件：要清掉勾選 + 回復 over65=ALL，並觸發 FilterCore.clear()

(function () {
  function $(id) { return document.getElementById(id); }

  var els = {
    panel: $('filter-panel'),
    btnOpen: $('btn-filter'),
    btnClear: $('btn-filter-clear'),
    btnClose: $('btn-filter-close'),

    boxReside: $('filter-reside-town'),
    boxManaged: $('filter-managed-town'),
    boxCategory: $('filter-category'),
    boxOver65: $('filter-over65'),

    countVisible: $('filter-count-visible'),
    countDimmed: $('filter-count-dimmed')
  };

  function openPanel() {
    if (!els.panel) return;
    els.panel.classList.add('is-open');
    els.panel.setAttribute('aria-hidden', 'false');
  }

  function closePanel() {
    if (!els.panel) return;
    els.panel.classList.remove('is-open');
    els.panel.setAttribute('aria-hidden', 'true');
  }

  function renderEmpty(container, text) {
    if (!container) return;
    container.innerHTML = '<div class="filter-empty">' + (text || '無資料') + '</div>';
  }

  function renderLoading(container) {
    if (!container) return;
    container.innerHTML = '<div class="filter-loading">載入中...</div>';
  }

  function checkboxItem(name, value, label, checked) {
    var safeVal = String(value);
    var safeLab = String(label);
    return (
      '<label class="filter-checkitem">' +
        '<input type="checkbox" name="' + name + '" value="' + safeVal.replace(/"/g, '&quot;') + '"' + (checked ? ' checked' : '') + ' />' +
        '<span class="filter-checktext">' + safeLab + '</span>' +
      '</label>'
    );
  }

  function getCheckedValues(container) {
    if (!container) return [];
    var nodes = container.querySelectorAll('input[type="checkbox"]:checked');
    var out = [];
    nodes.forEach(function (n) { out.push(String(n.value)); });
    return out;
  }

  // over65 單選：永遠保持 1 個被勾（預設 ALL）
  function enforceOver65Single(target) {
    if (!els.boxOver65) return;

    var all = els.boxOver65.querySelectorAll('input[type="checkbox"]');
    if (!target) {
      // 確保至少一個
      var any = false;
      all.forEach(function (c) { if (c.checked) any = true; });
      if (!any) {
        var a = els.boxOver65.querySelector('input[value="ALL"]');
        if (a) a.checked = true;
      }
      return;
    }

    // 點到誰就只留誰
    if (target.checked) {
      all.forEach(function (c) {
        if (c !== target) c.checked = false;
      });
    } else {
      // 不允許全不選 -> 回到 ALL
      var any2 = false;
      all.forEach(function (c) { if (c.checked) any2 = true; });
      if (!any2) {
        var a2 = els.boxOver65.querySelector('input[value="ALL"]');
        if (a2) a2.checked = true;
      }
    }
  }

  function syncToCore() {
    if (!window.FilterCore) return;

    var reside = getCheckedValues(els.boxReside);
    var managed = getCheckedValues(els.boxManaged);
    var cats = getCheckedValues(els.boxCategory);

    var over65 = 'ALL';
    if (els.boxOver65) {
      var c = els.boxOver65.querySelector('input[type="checkbox"]:checked');
      over65 = c ? String(c.value) : 'ALL';
    }

    window.FilterCore.setState({
      resideTowns: reside,
      managedTowns: managed,
      categories: cats,
      over65: over65
    });
  }

  function bindEvents() {
    if (els.btnOpen) els.btnOpen.addEventListener('click', openPanel);

    // 關閉（遮罩/右上角/完成）
    document.addEventListener('click', function (e) {
      var t = e.target;

      if (t && t.getAttribute && t.getAttribute('data-filter-close') === '1') {
        closePanel();
      }
      if (t === els.btnClose) closePanel();
    });

    // 勾選事件（事件委派）
    if (els.boxReside) {
      els.boxReside.addEventListener('change', function () { syncToCore(); });
    }
    if (els.boxManaged) {
      els.boxManaged.addEventListener('change', function () { syncToCore(); });
    }
    if (els.boxCategory) {
      els.boxCategory.addEventListener('change', function () { syncToCore(); });
    }
    if (els.boxOver65) {
      els.boxOver65.addEventListener('change', function (e) {
        enforceOver65Single(e.target);
        syncToCore();
      });
    }

    // 清除條件
    if (els.btnClear) {
      els.btnClear.addEventListener('click', function () {
        // 1) 清 UI
        [els.boxReside, els.boxManaged, els.boxCategory].forEach(function (box) {
          if (!box) return;
          box.querySelectorAll('input[type="checkbox"]').forEach(function (c) { c.checked = false; });
        });

        if (els.boxOver65) {
          els.boxOver65.querySelectorAll('input[type="checkbox"]').forEach(function (c) { c.checked = false; });
          var a = els.boxOver65.querySelector('input[value="ALL"]');
          if (a) a.checked = true;
        }

        // 2) 清核心 + 立即套用
        if (window.FilterCore) window.FilterCore.clear();
      });
    }

    // 顯示統計
    document.addEventListener('filters:applied', function (e) {
      var d = (e && e.detail) ? e.detail : {};
      if (els.countVisible) els.countVisible.textContent = String(d.visibleCount || 0);
      if (els.countDimmed) els.countDimmed.textContent = String(d.dimmedCount || 0);
    });
  }

  async function loadOptions() {
    if (!window.apiRequest) return;

    renderLoading(els.boxReside);
    renderLoading(els.boxManaged);
    renderLoading(els.boxCategory);
    renderLoading(els.boxOver65);

    // 你提供的 API：/api/filters/options.php
    var res = await apiRequest('/filters/options', 'GET');

    // 兼容兩種格式：{success:true,data:{...}} 或 {ok:true,data:{...}}
    var data = res && (res.data || (res.ok ? res.data : null));
    if (!data) {
      renderEmpty(els.boxReside, '載入失敗');
      renderEmpty(els.boxManaged, '載入失敗');
      renderEmpty(els.boxCategory, '載入失敗');
      renderEmpty(els.boxOver65, '載入失敗');
      return;
    }

    // ① 居住鄉鎮（checkbox 多選）
    if (Array.isArray(data.reside_towns) && data.reside_towns.length > 0) {
      els.boxReside.innerHTML = data.reside_towns.map(function (t) {
        return checkboxItem('reside_town', t.town_code, t.town_name, false);
      }).join('');
    } else {
      renderEmpty(els.boxReside, '無資料');
    }

    // ② 列管鄉鎮（checkbox 多選）
    if (Array.isArray(data.managed_towns) && data.managed_towns.length > 0) {
      els.boxManaged.innerHTML = data.managed_towns.map(function (t) {
        return checkboxItem('managed_town', t.town_code, t.town_name, false);
      }).join('');
    } else {
      renderEmpty(els.boxManaged, '無資料');
    }

    // ③ 類別（checkbox 多選）
    if (Array.isArray(data.categories) && data.categories.length > 0) {
      els.boxCategory.innerHTML = data.categories.map(function (c) {
        return checkboxItem('category', c, c, false);
      }).join('');
    } else {
      renderEmpty(els.boxCategory, '無資料');
    }

    // ④ over65（checkbox 單選）
    var over65Opts = Array.isArray(data.over65) ? data.over65 : [
      { value: 'ALL', label: '不限' },
      { value: 'Y', label: '是' },
      { value: 'N', label: '否' }
    ];

    els.boxOver65.innerHTML = over65Opts.map(function (o) {
      return checkboxItem('over65', o.value, o.label, o.value === 'ALL');
    }).join('');

    enforceOver65Single(null);
    syncToCore(); // 初始套用一次（ALL）
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    loadOptions().catch(function () {
      renderEmpty(els.boxReside, '載入失敗');
      renderEmpty(els.boxManaged, '載入失敗');
      renderEmpty(els.boxCategory, '載入失敗');
      renderEmpty(els.boxOver65, '載入失敗');
    });
  });
})();
