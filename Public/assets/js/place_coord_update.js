// Path: Public/assets/js/place_coord_update.js
// 說明: 「更新座標」新功能（僅 S1=BROWSE 可用）
// - 編輯標記 Modal 增加單行 input（可貼上含換行/空白的內容）
// - 點擊「更新座標」：
//    1) 解析輸入（優先抓出 lat,lng）
//    2) 若無法解析 → 使用 Google Geocoder 嘗試（支援 Plus Code/地址文字）
//    3) 以 PlacesApi.update() 寫入 DB（先成功才關閉）
//    4) 成功後送出事件 placeCoordUpdate:saved（由 app.js 接手 refreshPlaces + 聚焦）

(function (global) {
  'use strict';

  var PlaceCoordUpdate = {
    // deps (optional)
    _PlacesApi: null,
    _PlaceForm: null,

    // DOM
    _row: null,
    _input: null,
    _btn: null,

    // state
    _enabled: true,
    _placeId: null,

    init: function (opts) {
      opts = opts || {};
      this._PlacesApi = opts.PlacesApi || global.PlacesApi || null;
      this._PlaceForm = opts.PlaceForm || global.PlaceForm || null;

      this._row = document.getElementById('place-coord-row');
      this._input = document.getElementById('place-coord-text');
      this._btn = document.getElementById('btn-place-update-coord');

      if (!this._row || !this._input || !this._btn) return;

      // 單行 input：允許貼上含換行 → 轉空白（避免驗證干擾）
      this._input.addEventListener('paste', function () {
        // 讓瀏覽器先貼上，再做清理
        setTimeout(function () {
          var v = (PlaceCoordUpdate._input.value || '');
          PlaceCoordUpdate._input.value = PlaceCoordUpdate._normalizeText(v);
        }, 0);
      });

      this._btn.addEventListener('click', function () {
        PlaceCoordUpdate._onClickUpdate();
      });

      this.setEnabled(true);
      this.onOpenCreate(); // default hidden
    },

    setEnabled: function (enabled) {
      this._enabled = !!enabled;
      this._applyEnabledState();
    },

    onOpenCreate: function () {
      this._placeId = null;
      this._setVisible(false);
      this._setError('');
      if (this._input) this._input.value = '';
      this._applyEnabledState();
    },

    onOpenEdit: function (place) {
      place = place || {};
      this._placeId = place.id || null;

      // 只在編輯視窗顯示
      this._setVisible(true);
      this._setError('');

      var lat = (place.lat !== undefined && place.lat !== null) ? String(place.lat) : '';
      var lng = (place.lng !== undefined && place.lng !== null) ? String(place.lng) : '';
      if (this._input) this._input.value = this._normalizeText((lat && lng) ? (lat + ', ' + lng) : '');

      this._applyEnabledState();
    },

    onModalClosed: function () {
      // 避免下次開啟時殘留
      this._placeId = null;
      this._setError('');
      if (this._input) this._input.value = '';
      this._setVisible(false);
    },

    // --------------------
    // Internal
    // --------------------
    _applyEnabledState: function () {
      if (!this._btn || !this._input) return;

      var canUse = this._enabled && !!this._placeId;
      this._btn.disabled = !canUse;
      this._input.disabled = !canUse;
      if (!canUse) this._setError('');
    },

    _setVisible: function (visible) {
      if (!this._row) return;
      this._row.style.display = visible ? '' : 'none';
    },

    _normalizeText: function (s) {
      s = (s || '').toString();
      // 把換行、tab、多重空白統一成單一空白
      return s.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    },

    _parseLatLng: function (text) {
      text = this._normalizeText(text);

      // 1) 最常見： "lat,lng" or "lat lng"
      var m = text.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
      if (m) {
        var a = parseFloat(m[1]);
        var b = parseFloat(m[2]);
        if (this._isLatLng(a, b)) return { lat: a, lng: b };
      }

      // 2) 退一步：抓出前兩個數字（避免 "lat: xx lng: yy"）
      var nums = text.match(/-?\d+(?:\.\d+)?/g) || [];
      if (nums.length >= 2) {
        var x = parseFloat(nums[0]);
        var y = parseFloat(nums[1]);
        if (this._isLatLng(x, y)) return { lat: x, lng: y };
      }

      return null;
    },

    _isLatLng: function (lat, lng) {
      if (!isFinite(lat) || !isFinite(lng)) return false;
      if (lat < -90 || lat > 90) return false;
      if (lng < -180 || lng > 180) return false;
      return true;
    },

    _geocode: function (query) {
      return new Promise(function (resolve, reject) {
        if (!global.google || !google.maps || !google.maps.Geocoder) {
          reject(new Error('Google Maps Geocoder 未載入'));
          return;
        }
        var geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: query }, function (results, status) {
          if (status === 'OK' && results && results[0] && results[0].geometry && results[0].geometry.location) {
            var loc = results[0].geometry.location;
            resolve({ lat: loc.lat(), lng: loc.lng() });
            return;
          }
          reject(new Error('Geocode failed: ' + status));
        });
      });
    },

    _setError: function (msg) {
      var el = document.getElementById('place-coord-error');
      if (!el) return;
      el.textContent = msg || '';
      el.style.display = msg ? '' : 'none';
    },

    _onClickUpdate: async function () {
      if (!this._enabled) return;
      if (!this._placeId) return;

      if (!this._PlacesApi || !this._PlacesApi.update || !this._PlacesApi.get) {
        alert('PlacesApi 未載入，無法更新座標');
        return;
      }

      var raw = this._input ? this._input.value : '';
      var text = this._normalizeText(raw);

      if (!text) {
        this._setError('請輸入座標或貼上 Google 地圖座標');
        return;
      }

      this._btn.disabled = true;
      this._setError('');

      try {
        // 1) 解析輸入：先嘗試 lat,lng；不行再走 Geocoder（Plus Code / 地址文字）
        var pos = this._parseLatLng(text);
        if (!pos) {
          pos = await this._geocode(text);
        }

        // 2) 先從 DB 抓完整資料，避免表單沒回填 / 不在 form / name 缺漏造成必填欄位不足
        var curJson = await this._PlacesApi.get(this._placeId);
        var cur = (curJson && curJson.data) ? curJson.data : null;
        if (!cur) throw new Error('找不到要更新的標記資料');

        // 3) 用 DB 現值當 payload 基底（只覆寫 lat/lng）
        //    注意：update.php 會檢核「官兵姓名、類別、撫卹令號」必填，所以必須帶齊。
        var payload = {
          serviceman_name: (cur.serviceman_name || '').toString(),
          category: (cur.category || '').toString(),
          visit_name: (cur.visit_name || '').toString(),
          visit_target: (cur.visit_target || '').toString(),
          condolence_order_no: (cur.condolence_order_no || '').toString(),
          beneficiary_over65: ((cur.beneficiary_over65 || 'N').toString().toUpperCase() === 'Y') ? 'Y' : 'N',
          note: (cur.note || '').toString(),
          address_text: (cur.address_text || '').toString(),
          managed_district: (cur.managed_district || '').toString(),
          managed_town_code: (cur.managed_town_code || '').toString(),
          managed_county_code: (cur.managed_county_code || '').toString(),

          // ✅ 只更新座標
          lat: pos.lat,
          lng: pos.lng
        };

        // legacy aliases（保險：後端也支援）
        payload.soldier_name = payload.serviceman_name;
        payload.target_name = payload.visit_target;
        payload.address = payload.address_text;

        // 4) ✅ 存 DB
        var updJson = await this._PlacesApi.update(this._placeId, payload);
        var saved = (updJson && updJson.data) ? updJson.data : null;

        // 5) 關閉 modal（先成功才關）
        if (this._PlaceForm && typeof this._PlaceForm.closeModal === 'function') {
          this._PlaceForm.closeModal('modal-place-form');
        } else {
          // fallback
          var modal = document.getElementById('modal-place-form');
          if (modal) {
            modal.classList.remove('modal--open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('is-modal-open');
          }
        }

        // 6) ✅ 通知 app.js：用 update 回傳的最新 row 為準（不再 GET）
        document.dispatchEvent(new CustomEvent('placeCoordUpdate:saved', {
          detail: {
            id: this._placeId,
            lat: pos.lat,
            lng: pos.lng,
            place: saved // ★最重要：DB 最新那筆（含 lat/lng/updated_at）
          }
        }));

      } catch (e) {
        console.warn('update coord fail:', e);
        this._setError('輸入位置錯誤，請直接複製google map座標貼上');
      } finally {
        this._applyEnabledState();
      }
    }

  };

  global.PlaceCoordUpdate = PlaceCoordUpdate;
})(window);
