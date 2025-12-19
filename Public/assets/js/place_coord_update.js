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

      // ✅ A) 先擋 Plus Code：避免把 "HR6C+X3 ..." 的 6、3 抓去當座標
      // Plus Code 常見：XXXX+XX 或更長（可含空白後地址）
      // 字元集多為 2-9 + C F G H J M P Q R V W X
      var plusCodeRe = /(?:^|\s)([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})(?:\s|$)/i;
      if (plusCodeRe.test(text) || text.indexOf('+') !== -1) {
        // 只要疑似 Plus Code/含 +，就交給 Geocoder
        return null;
      }

      // ✅ B) 最常見： "lat,lng" or "lat lng"
      // 這種格式最安全，直接解析
      var m = text.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
      if (m) {
        var a = parseFloat(m[1]);
        var b = parseFloat(m[2]);
        if (this._isLatLng(a, b)) return { lat: a, lng: b };
      }

      // ✅ C) 只在「明確出現 lat/lng 文字」時，才允許用 fallback 抓前兩個數字
      // 避免地址門牌、Plus Code、其他代碼誤判
      var hasLatLngHint = /(lat|lng|latitude|longitude|緯度|經度)/i.test(text);
      if (hasLatLngHint) {
        var nums = text.match(/-?\d+(?:\.\d+)?/g) || [];
        if (nums.length >= 2) {
          var x = parseFloat(nums[0]);
          var y = parseFloat(nums[1]);
          if (this._isLatLng(x, y)) return { lat: x, lng: y };
        }
      }

      return null;
    },

    _extractLatLngFromGoogleUrl: function (text) {
      // 支援：
      // - https://www.google.com/maps/.../@lat,lng,....
      // - .../place/.../data=!3dLAT!4dLNG
      // - ?q=lat,lng 或 ?query=lat,lng 或 ?ll=lat,lng
      // - /?api=1&destination=lat,lng
      var s = (text || '').toString();

      // @lat,lng
      var m1 = s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
      if (m1) return { lat: parseFloat(m1[1]), lng: parseFloat(m1[2]) };

      // !3dLAT!4dLNG（注意有時候順序也可能 !4d !3d）
      var m2 = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      if (m2) return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]) };

      var m2b = s.match(/!4d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/);
      if (m2b) return { lat: parseFloat(m2b[2]), lng: parseFloat(m2b[1]) };

      // q= / query= / ll= / destination=
      var m3 = s.match(/[?&](?:q|query|ll|destination|daddr)=\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i);
      if (m3) return { lat: parseFloat(m3[1]), lng: parseFloat(m3[2]) };

      return null;
    },

    _parseDMS: function (text) {
      // 支援常見 DMS：
      // 25°02'31.5"N 121°33'12.1"E
      // 25 02 31.5 N, 121 33 12.1 E
      // 25°02.525'N 121°33.201'E（分可帶小數）
      var s = (text || '').toString().toUpperCase();

      // 把各種符號統一成空白
      s = s
        .replace(/[°º]/g, ' ')
        .replace(/[′’']/g, ' ')
        .replace(/[″”"]/g, ' ')
        .replace(/,/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // 嘗試抓兩組： (deg min sec? [N/S]) (deg min sec? [E/W])
      // 允許 sec 缺省、允許 min 帶小數、sec 帶小數
      var re = /(\d{1,3}(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)\s*(\d{1,3}(?:\.\d+)?)?\s*([NS])\s+(\d{1,3}(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)\s*(\d{1,3}(?:\.\d+)?)?\s*([EW])/;
      var m = s.match(re);
      if (!m) return null;

      var latDeg = parseFloat(m[1]);
      var latMin = parseFloat(m[2]);
      var latSec = (m[3] !== undefined) ? parseFloat(m[3]) : 0;
      var latHem = m[4];

      var lngDeg = parseFloat(m[5]);
      var lngMin = parseFloat(m[6]);
      var lngSec = (m[7] !== undefined) ? parseFloat(m[7]) : 0;
      var lngHem = m[8];

      if (!isFinite(latDeg) || !isFinite(latMin) || !isFinite(latSec)) return null;
      if (!isFinite(lngDeg) || !isFinite(lngMin) || !isFinite(lngSec)) return null;

      // 若使用者貼的是「度 分.分」且沒有 sec，re 會把 sec 缺省為 0，OK
      var lat = this._dmsToDecimal(latDeg, latMin, latSec, latHem);
      var lng = this._dmsToDecimal(lngDeg, lngMin, lngSec, lngHem);

      return { lat: lat, lng: lng };
    },

    _parseLooseNESW: function (text) {
      // 非標準但常見的貼法：
      // "N 25.033964 E 121.564468"
      // "25.033964 N 121.564468 E"
      // "S 25 2 31  E 121 33 12"
      var s = (text || '').toString().toUpperCase().replace(/,/g, ' ');
      s = s.replace(/\s{2,}/g, ' ').trim();

      // 先嘗試：lat...N/S...lng...E/W（各段抓出第一個可用數字）
      var m = s.match(/([NS])\s*([-\d.\s]+)\s*([EW])\s*([-\d.\s]+)/);
      if (m) {
        var latPart = (m[2].match(/-?\d+(?:\.\d+)?/g) || []);
        var lngPart = (m[4].match(/-?\d+(?:\.\d+)?/g) || []);
        if (latPart.length >= 1 && lngPart.length >= 1) {
          var lat = parseFloat(latPart[0]);
          var lng = parseFloat(lngPart[0]);
          if (m[1] === 'S') lat = -Math.abs(lat);
          if (m[3] === 'W') lng = -Math.abs(lng);
          return { lat: lat, lng: lng };
        }
      }

      // 再嘗試：數字 N/S 數字 E/W
      var m2 = s.match(/(-?\d+(?:\.\d+)?)\s*([NS])\s+(-?\d+(?:\.\d+)?)\s*([EW])/);
      if (m2) {
        var lat2 = parseFloat(m2[1]);
        var lng2 = parseFloat(m2[3]);
        if (m2[2] === 'S') lat2 = -Math.abs(lat2);
        if (m2[4] === 'W') lng2 = -Math.abs(lng2);
        return { lat: lat2, lng: lng2 };
      }

      return null;
    },

    _dmsToDecimal: function (deg, min, sec, hem) {
      var v = Math.abs(Number(deg)) + (Number(min) / 60) + (Number(sec) / 3600);
      if (hem === 'S' || hem === 'W') v = -v;
      return v;
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
          id: Number(this._placeId),
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
        var finalLat = (saved && saved.lat != null) ? Number(saved.lat) : Number(pos.lat);
        var finalLng = (saved && saved.lng != null) ? Number(saved.lng) : Number(pos.lng);

        document.dispatchEvent(new CustomEvent('placeCoordUpdate:saved', {
          detail: {
            id: Number(this._placeId),
            lat: finalLat,
            lng: finalLng,
            place: saved
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
