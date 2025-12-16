// Path: Public/assets/js/filters.js
// 說明: 篩選核心（不管 UI），只負責：
// - 收到 places + routePoints + mode
// - 依條件計算 visibleIds + dimIds
// - 呼叫 MapModule.setFilterVisibility(...)

(function () {
    'use strict';

    var FilterCore = {
        state: {
            logic: 'AND',               // AND | OR
            managedTowns: [],           // managed_town_code array
            categories: [],             // category array
            over65: 'ALL',              // ALL | Y | N
            keyword: ''                 // text search
        },
        places: [],
        routePoints: [],
        mode: 'BROWSE'
    };

    function norm(s) {
        return (s == null ? '' : String(s)).trim();
    }

    function includesText(hay, needle) {
        hay = norm(hay).toLowerCase();
        needle = norm(needle).toLowerCase();
        if (!needle) return true;
        return hay.indexOf(needle) !== -1;
    }

    function matchPlace(p, st) {
        // 若都沒選條件 => 視為全符合
        var hasAny =
            (st.managedTowns && st.managedTowns.length) ||
            (st.categories && st.categories.length) ||
            (st.over65 && st.over65 !== 'ALL') ||
            (st.keyword && st.keyword.trim() !== '');

        if (!hasAny) return true;

        var conds = [];

        // 1) 列管鄉鎮（用 managed_town_code）
        if (st.managedTowns && st.managedTowns.length) {
            conds.push(st.managedTowns.indexOf(norm(p.managed_town_code)) >= 0);
        }

        // 2) 居住鄉鎮（address_town_code）
        if (st.resideTowns && st.resideTowns.length) {
            conds.push(st.resideTowns.indexOf(norm(p.address_town_code)) >= 0);
        }

        // 3) 類別
        if (st.categories && st.categories.length) {
            conds.push(st.categories.indexOf(norm(p.category)) >= 0);
        }

        // 4) 65+
        if (st.over65 && st.over65 !== 'ALL') {
            conds.push(norm(p.beneficiary_over65) === st.over65);
        }

        // 5) 關鍵字：姓名 / 受益人 / 地址（含 legacy alias）
        if (st.keyword && st.keyword.trim() !== '') {
            var k = st.keyword.trim();
            var ok =
                includesText(p.serviceman_name || p.soldier_name, k) ||
                includesText(p.visit_name, k) ||
                includesText(p.address_text || p.address, k) ||
                includesText(p.managed_district, k) ||
                includesText(p.condolence_order_no, k);
            conds.push(ok);
        }

        if (!conds.length) return true;

        if (st.logic === 'OR') {
            for (var i = 0; i < conds.length; i++) if (conds[i]) return true;
            return false;
        }

        // AND
        for (var j = 0; j < conds.length; j++) if (!conds[j]) return false;
        return true;
    }

    function apply() {
        var st = FilterCore.state;
        var places = Array.isArray(FilterCore.places) ? FilterCore.places : [];
        var routePoints = Array.isArray(FilterCore.routePoints) ? FilterCore.routePoints : [];

        // route id set
        var routeIdSet = new Set();
        for (var r = 0; r < routePoints.length; r++) {
            var rp = routePoints[r];
            if (rp && rp.id && rp.id !== '__me') routeIdSet.add(Number(rp.id));
        }

        var visibleIds = [];
        var dimIds = [];

        // 若沒有任何條件 => 停用 filter（null）
        var hasAny =
            (st.managedTowns && st.managedTowns.length) ||
            (st.categories && st.categories.length) ||
            (st.over65 && st.over65 !== 'ALL') ||
            (st.keyword && st.keyword.trim() !== '');

        if (!hasAny) {
            // 仍要更新 UI 計數用
            document.dispatchEvent(new CustomEvent('filters:stats', {
                detail: { visible: places.length, dimmed: 0 }
            }));

            if (window.MapModule && typeof window.MapModule.setFilterVisibility === 'function') {
                window.MapModule.setFilterVisibility(null, []);
            }
            return;
        }

        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (!p || p.id == null) continue;

            var id = Number(p.id);
            var ok = matchPlace(p, st);

            if (ok) {
                visibleIds.push(id);
            } else if (routeIdSet.has(id)) {
                // ✅ 路線保留：不符合也要顯示（由 map.js 去決定淡化）
                dimIds.push(id);
            }
        }

        document.dispatchEvent(new CustomEvent('filters:stats', {
            detail: { visible: visibleIds.length, dimmed: dimIds.length }
        }));

        if (window.MapModule && typeof window.MapModule.setFilterVisibility === 'function') {
            window.MapModule.setFilterVisibility(visibleIds, dimIds);
        }
    }

    // ===== 對外：供 UI 設定條件 =====
    FilterCore.setState = function (next) {
        next = next || {};
        var st = FilterCore.state;

        if (next.logic === 'AND' || next.logic === 'OR') st.logic = next.logic;
        if (Array.isArray(next.managedTowns)) st.managedTowns = next.managedTowns.slice(0);
        if (Array.isArray(next.categories)) st.categories = next.categories.slice(0);
        if (typeof next.over65 === 'string') st.over65 = next.over65;
        if (typeof next.keyword === 'string') st.keyword = next.keyword;

        apply();
    };

    FilterCore.setPlaces = function (places) {
        FilterCore.places = Array.isArray(places) ? places : [];
        apply();
    };

    FilterCore.setRoutePoints = function (routePoints) {
        FilterCore.routePoints = Array.isArray(routePoints) ? routePoints : [];
        apply();
    };

    FilterCore.setMode = function (mode) {
        FilterCore.mode = mode || 'BROWSE';
        apply();
    };

    FilterCore.apply = apply;

    window.FilterCore = FilterCore;

    // ===== 接收 app.js 派送的事件（你只要在 app.js 加兩段 dispatch）=====
    document.addEventListener('places:loaded', function (e) {
        var places = e && e.detail ? e.detail.places : [];
        FilterCore.setPlaces(places || []);
    });

    document.addEventListener('route:changed', function (e) {
        var rp = e && e.detail ? e.detail.routePoints : [];
        FilterCore.setRoutePoints(rp || []);
    });

    document.addEventListener('mode:changed', function (e) {
        var m = e && e.detail ? e.detail.mode : 'BROWSE';
        FilterCore.setMode(m);
    });
})();
