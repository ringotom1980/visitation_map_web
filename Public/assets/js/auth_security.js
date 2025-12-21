/**
 * Path: Public/assets/js/admin_auth_security.js
 * 說明: 安全中心（auth_security.php）— Admin 版 DOM 對齊
 *  - tabs: .admin-tab (data-tab="throttles|events")
 *  - panels: #tab-throttles / #tab-events
 *  - throttles inputs: #qT #onlyBlocked #limitT #btnSearchT #btnRefreshT #wrapThrottles #hintThrottles
 *  - events inputs: #qE #typeE #limitE #btnSearchE #btnRefreshE #wrapEvents #hintEvents
 *  - APIs:
 *      GET /api/admin/auth_throttles.php
 *      GET /api/admin/auth_events.php
 */

(function () {
    'use strict';

    var API_THROTTLES = '/api/admin/auth_throttles.php';
    var API_EVENTS = '/api/admin/auth_events.php';

    function qs(sel) { return document.querySelector(sel); }
    function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showHint(el, msg) {
        if (!el) return;
        el.textContent = msg || '';
        el.style.display = msg ? 'block' : 'none';
    }

    function buildQuery(params) {
        var parts = [];
        Object.keys(params || {}).forEach(function (k) {
            var v = params[k];
            if (v === null || v === undefined || v === '') return;
            parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
        });
        return parts.length ? ('?' + parts.join('&')) : '';
    }

    function apiGet(url) {
        // 若你有共用 api.js (window.Api.get)，就優先用它；沒有就 fallback fetch
        if (window.Api && typeof window.Api.get === 'function') {
            return window.Api.get(url).then(function (j) {
                if (!j || j.success !== true) {
                    var msg1 = (j && j.error && j.error.message) ? j.error.message : 'API error';
                    throw new Error(msg1);
                }
                return j.data;
            });
        }

        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                if (!j || j.success !== true) {
                    var msg2 = (j && j.error && j.error.message) ? j.error.message : 'API error';
                    throw new Error(msg2);
                }
                return j.data;
            });
    }

    // ===== Tabs =====
    function setActiveTab(tab) {
        qsa('.admin-tab').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-tab') === tab);
        });

        var pT = qs('#tab-throttles');
        var pE = qs('#tab-events');
        if (pT) pT.classList.toggle('active', tab === 'throttles');
        if (pE) pE.classList.toggle('active', tab === 'events');

        if (tab === 'throttles') loadThrottles();
        if (tab === 'events') loadEvents();
    }

    // ===== Throttles =====
    function renderThrottles(data) {
        var wrap = qs('#wrapThrottles');
        var hint = qs('#hintThrottles');
        if (!wrap) return;

        var items = (data && data.items) ? data.items : [];
        showHint(hint, '共 ' + items.length + ' 筆（僅封鎖=' + (data.only_blocked ? '是' : '否') + '）');

        if (!items.length) {
            wrap.innerHTML = '<div class="empty-hint">查無資料</div>';
            return;
        }

        var html = '';
        html += '<table><thead><tr>';
        html += '<th>狀態</th>';
        html += '<th>action</th>';
        html += '<th>scope</th>';
        html += '<th>ip</th>';
        html += '<th>email</th>';
        html += '<th>count</th>';
        html += '<th>window_start</th>';
        html += '<th>blocked_until</th>';
        html += '<th>updated_at</th>';
        html += '</tr></thead><tbody>';

        items.forEach(function (it) {
            var badge = it.is_blocked
                ? '<span class="badge badge-status-suspended">封鎖中</span>'
                : '<span class="badge badge-status-active">正常</span>';

            html += '<tr>';
            html += '<td>' + badge + '</td>';
            html += '<td>' + esc(it.action) + '</td>';
            html += '<td>' + esc(it.scope) + '</td>';
            html += '<td>' + esc(it.ip || '') + '</td>';
            html += '<td>' + esc(it.email || '') + '</td>';
            html += '<td>' + esc(it.count) + '</td>';
            html += '<td>' + esc(it.window_start) + '</td>';
            html += '<td>' + esc(it.blocked_until || '') + '</td>';
            html += '<td>' + esc(it.updated_at) + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        wrap.innerHTML = html;
    }

    function loadThrottles() {
        var qT = qs('#qT');
        var onlyBlocked = qs('#onlyBlocked');
        var limitT = qs('#limitT');
        var hint = qs('#hintThrottles');

        showHint(hint, '載入中…');

        var url = API_THROTTLES + buildQuery({
            q: qT ? (qT.value || '').trim() : '',
            only_blocked: (onlyBlocked && onlyBlocked.checked) ? 1 : 0,
            limit: limitT ? (limitT.value || '200') : '200'
        });

        apiGet(url)
            .then(function (data) {
                renderThrottles(data);
            })
            .catch(function (e) {
                showHint(hint, '錯誤：' + e.message);
                var wrap = qs('#wrapThrottles');
                if (wrap) wrap.innerHTML = '<div class="empty-hint">讀取失敗</div>';
            });
    }

    // ===== Events =====
    function renderEvents(data) {
        var wrap = qs('#wrapEvents');
        var hint = qs('#hintEvents');
        if (!wrap) return;

        var items = (data && data.items) ? data.items : [];
        showHint(hint, '共 ' + items.length + ' 筆');

        if (!items.length) {
            wrap.innerHTML = '<div class="empty-hint">查無資料</div>';
            return;
        }

        var html = '';
        html += '<table><thead><tr>';
        html += '<th>ts</th>';
        html += '<th>event_type</th>';
        html += '<th>user_id</th>';
        html += '<th>email</th>';
        html += '<th>ip</th>';
        html += '<th>detail</th>';
        html += '<th>ua</th>';
        html += '</tr></thead><tbody>';

        items.forEach(function (it) {
            html += '<tr>';
            html += '<td>' + esc(it.ts) + '</td>';
            html += '<td>' + esc(it.event_type) + '</td>';
            html += '<td>' + esc(it.user_id === null ? '' : it.user_id) + '</td>';
            html += '<td>' + esc(it.email || '') + '</td>';
            html += '<td>' + esc(it.ip || '') + '</td>';
            html += '<td>' + esc(it.detail || '') + '</td>';
            html += '<td>' + esc(it.ua || '') + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        wrap.innerHTML = html;
    }

    function loadEvents() {
        var qE = qs('#qE');
        var typeE = qs('#typeE');
        var limitE = qs('#limitE');
        var hint = qs('#hintEvents');

        showHint(hint, '載入中…');

        var url = API_EVENTS + buildQuery({
            q: qE ? (qE.value || '').trim() : '',
            type: typeE ? (typeE.value || '') : '',
            limit: limitE ? (limitE.value || '200') : '200'
        });

        apiGet(url)
            .then(function (data) {
                renderEvents(data);
            })
            .catch(function (e) {
                showHint(hint, '錯誤：' + e.message);
                var wrap = qs('#wrapEvents');
                if (wrap) wrap.innerHTML = '<div class="empty-hint">讀取失敗</div>';
            });
    }

    function setupLogout() {
        var btn = qs('#btnLogout');
        if (!btn) return;

        btn.addEventListener('click', function () {
            if (!confirm('確定要登出嗎？')) return;

            // 沿用你專案的 apiRequest 介面
            if (typeof window.apiRequest !== 'function') {
                // 若 api.js 尚未載入，仍然強制導回 login（避免卡死）
                window.location.href = '/login';
                return;
            }

            window.apiRequest('/auth/logout', 'POST', {})
                .catch(function () {
                    // ignore error, still redirect
                })
                .finally(function () {
                    window.location.href = '/login';
                });
        });
    }

    // ===== Bind =====
    function bind() {
        qsa('.admin-tab').forEach(function (b) {
            b.addEventListener('click', function () {
                setActiveTab(b.getAttribute('data-tab'));
            });
        });

        var btnSearchT = qs('#btnSearchT');
        var btnRefreshT = qs('#btnRefreshT');
        var btnSearchE = qs('#btnSearchE');
        var btnRefreshE = qs('#btnRefreshE');

        if (btnSearchT) btnSearchT.addEventListener('click', loadThrottles);
        if (btnRefreshT) btnRefreshT.addEventListener('click', loadThrottles);
        if (btnSearchE) btnSearchE.addEventListener('click', loadEvents);
        if (btnRefreshE) btnRefreshE.addEventListener('click', loadEvents);

        var qT = qs('#qT');
        var qE = qs('#qE');
        if (qT) qT.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadThrottles(); });
        if (qE) qE.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadEvents(); });

        var onlyBlocked = qs('#onlyBlocked');
        var limitT = qs('#limitT');
        var typeE = qs('#typeE');
        var limitE = qs('#limitE');

        if (onlyBlocked) onlyBlocked.addEventListener('change', loadThrottles);
        if (limitT) limitT.addEventListener('change', loadThrottles);
        if (typeE) typeE.addEventListener('change', loadEvents);
        if (limitE) limitE.addEventListener('change', loadEvents);
    }

    document.addEventListener('DOMContentLoaded', function () {
        bind();
        setupLogout();
        setActiveTab('throttles');
    });

})();
