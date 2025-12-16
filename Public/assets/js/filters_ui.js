// Path: Public/assets/js/filters_ui.js
// 說明: 篩選 UI（只管 DOM + 事件），實際運算交給 FilterCore

(function () {
    'use strict';

    function qs(id) { return document.getElementById(id); }
    function valList(selectEl) {
        var res = [];
        if (!selectEl) return res;
        for (var i = 0; i < selectEl.options.length; i++) {
            var opt = selectEl.options[i];
            if (opt.selected && opt.value !== '') res.push(opt.value);
        }
        return res;
    }

    function setOptions(selectEl, items, getValue, getLabel) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var opt = document.createElement('option');
            opt.value = getValue(it);
            opt.textContent = getLabel(it);
            selectEl.appendChild(opt);
        }
    }

    function openPanel() {
        var panel = qs('filter-panel');
        if (!panel) return;
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
    }

    function closePanel() {
        var panel = qs('filter-panel');
        if (!panel) return;
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
    }

    function readStateFromUI() {
        var logic = 'AND';
        var radios = document.querySelectorAll('input[name="filter-logic"]');
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) logic = radios[i].value;
        }

        return {
            logic: logic,
            managedTowns: valList(qs('filter-managed-town')),
            categories: (function () {
                var res = [];
                var inputs = document.querySelectorAll('#filter-category input[data-filter-category]:checked');
                for (var i = 0; i < inputs.length; i++) {
                    res.push(inputs[i].value);
                }
                return res;
            })(),
            over65: (qs('filter-over65') ? qs('filter-over65').value : 'ALL'),
            keyword: (qs('filter-keyword') ? qs('filter-keyword').value : '')
        };
    }

    function applyFromUI() {
        if (!window.FilterCore) return;
        window.FilterCore.setState(readStateFromUI());
    }

    function clearUI() {
        var mt = qs('filter-managed-town');
        var cat = qs('filter-category');
        var over = qs('filter-over65');
        var kw = qs('filter-keyword');

        if (mt) for (var i = 0; i < mt.options.length; i++) mt.options[i].selected = false;
        if (cat) for (var j = 0; j < cat.options.length; j++) cat.options[j].selected = false;
        if (over) over.value = 'ALL';
        if (kw) kw.value = '';

        // logic reset to AND
        var radios = document.querySelectorAll('input[name="filter-logic"]');
        for (var r = 0; r < radios.length; r++) radios[r].checked = (radios[r].value === 'AND');

        var cats = document.querySelectorAll('#filter-category input[data-filter-category]');
        for (var k = 0; k < cats.length; k++) cats[k].checked = false;
        applyFromUI();
    }

    function bindUI() {
        var btn = qs('btn-filter');
        if (btn) btn.addEventListener('click', openPanel);

        // close triggers
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t) return;
            if (t.getAttribute && t.getAttribute('data-filter-close') === '1') closePanel();
        });

        var btnClose = qs('btn-filter-close');
        if (btnClose) btnClose.addEventListener('click', closePanel);

        var btnClear = qs('btn-filter-clear');
        if (btnClear) btnClear.addEventListener('click', clearUI);

        // change listeners
        var mt = qs('filter-managed-town');
        var cat = qs('filter-category');
        var over = qs('filter-over65');
        var kw = qs('filter-keyword');

        if (mt) mt.addEventListener('change', applyFromUI);
        if (cat) cat.addEventListener('change', applyFromUI);
        if (over) over.addEventListener('change', applyFromUI);

        // keyword: input 即時
        if (kw) kw.addEventListener('input', function () {
            // 小節流：避免每個 keypress 都重算太重（你點數不會太多，但保險）
            clearTimeout(kw._t);
            kw._t = setTimeout(applyFromUI, 120);
        });

        var radios = document.querySelectorAll('input[name="filter-logic"]');
        for (var i = 0; i < radios.length; i++) {
            radios[i].addEventListener('change', applyFromUI);
        }

        // stats update
        document.addEventListener('filters:stats', function (e) {
            var d = e && e.detail ? e.detail : { visible: 0, dimmed: 0 };
            var v = qs('filter-count-visible');
            var m = qs('filter-count-dimmed');
            if (v) v.textContent = String(d.visible || 0);
            if (m) m.textContent = String(d.dimmed || 0);
        });
    }

    function loadManagedTowns() {
        var sel = qs('filter-managed-town');
        if (sel) sel.innerHTML = '<option value="">載入中...</option>';

        apiRequest('/managed_towns/list', 'GET')
            .then(function (res) {
                var rows = (res && res.success) ? res.data : [];
                setOptions(sel, rows,
                    function (r) { return String(r.town_code || ''); },
                    function (r) {
                        return (r.county_name ? r.county_name + ' ' : '') + r.town_name;
                    }
                );
            })
            .catch(function () {
                if (sel) sel.innerHTML = '<option value="">載入失敗</option>';
            });
    }


    function loadCategoriesFromPlaces(places) {
        var set = new Set();
        for (var i = 0; i < (places || []).length; i++) {
            var c = (places[i] && places[i].category)
                ? String(places[i].category).trim()
                : '';
            if (c) set.add(c);
        }

        var categories = Array.from(set).sort();
        var wrap = qs('filter-category');
        if (!wrap) return;

        wrap.innerHTML = '';

        if (!categories.length) {
            wrap.innerHTML = '<div class="filter-empty">（沒有可用類別）</div>';
            return;
        }

        for (var j = 0; j < categories.length; j++) {
            var val = categories[j];
            var id = 'filter-category-' + j;

            var label = document.createElement('label');
            label.className = 'filter-checkbox';

            var input = document.createElement('input');
            input.type = 'checkbox';
            input.value = val;
            input.setAttribute('data-filter-category', '1');

            input.addEventListener('change', applyFromUI);

            var span = document.createElement('span');
            span.textContent = val;

            label.appendChild(input);
            label.appendChild(span);
            wrap.appendChild(label);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindUI();
        loadManagedTowns();

        // 從 places:loaded 事件建立 category options
        document.addEventListener('places:loaded', function (e) {
            var places = e && e.detail ? e.detail.places : [];
            loadCategoriesFromPlaces(places || []);
        });

        // 初始套用一次（避免面板統計空白）
        if (window.FilterCore && typeof window.FilterCore.apply === 'function') {
            window.FilterCore.apply();
        }
    });
})();
