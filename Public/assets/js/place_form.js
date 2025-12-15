// Path: Public/assets/js/place_form.js
// 說明: 新增/編輯標記 Modal 表單控制器（從 app.js 拆出）
// - 接手 open/close modal、回填、驗證、送出（PlacesApi.create/update）
// - 管理「列管鄉鎮市區」下拉與 hidden 欄位（managed_district / managed_town_code / managed_county_code）

(function (global) {
  'use strict';

  var PlaceForm = {
    // 外部依賴（由 app.js 注入）
    _MapModule: null,
    _PlacesApi: null,
    _apiRequest: null,

    // DOM
    _form: null,
    _modalId: 'modal-place-form',

    _selectTown: null,
    _hidDistrict: null,
    _hidTownCode: null,
    _hidCountyCode: null,

    // state
    _me: null,
    _townOptionsLoaded: false,

    init: function (deps) {
      deps = deps || {};
      this._MapModule = deps.MapModule || global.MapModule || null;
      this._PlacesApi = deps.PlacesApi || global.PlacesApi || null;
      this._apiRequest = deps.apiRequest || global.apiRequest || null;

      this._form = document.getElementById('place-form');

      this._selectTown = document.getElementById('place-managed-district-select');
      this._hidDistrict = document.getElementById('place-managed-district');
      this._hidTownCode = document.getElementById('place-managed-town-code');
      this._hidCountyCode = document.getElementById('place-managed-county-code');

      // 綁定：選單選到哪一筆，就同步 hidden 三欄
      if (this._selectTown) {
        this._selectTown.addEventListener('change', this._onTownChanged.bind(this));
      }

      // 全站委派：點 backdrop / data-modal-close 關閉
      document.body.addEventListener('click', function (evt) {
        var t = evt.target;
        if (!t) return;

        if (t.matches && (t.matches('[data-modal-close]') || t.matches('.modal__backdrop'))) {
          var id = t.getAttribute('data-modal-close') || 'modal-place-form';
          PlaceForm.closeModal(id);
          if (PlaceForm._MapModule && PlaceForm._MapModule.clearTempNewPlaceLatLng) {
            PlaceForm._MapModule.clearTempNewPlaceLatLng();
          }
        }
      });
    },

    // 由 app.js 注入 me（避免 place_form.js 自己再打一次 /auth/me 造成競態）
    setMe: function (me) {
      this._me = me || null;
    },

    // 新增：由 app.js 的長按事件呼叫
    openForCreate: function (latLng, address) {
      if (!this._form) return;

      if (this._form.reset) this._form.reset();

      // 預設值
      this._setValue('place-id', '');
      this._setValue('place-address-text', address || '');

      var over65 = document.getElementById('place-beneficiary-over65');
      if (over65) over65.value = 'N';

      var titleEl = document.getElementById('modal-place-title');
      if (titleEl) titleEl.textContent = '新增標記';

      // 清空列管 hidden
      this._setTownHidden('', '', '');

      // 確保選單載入（若尚未載入）
      this._ensureTownOptionsLoaded().finally(function () {
        PlaceForm._syncSelectFromHidden(); // 讓 UI 跟 hidden 同步（目前是空）
        PlaceForm.openModal('modal-place-form');
      });
    },

    // 編輯：由 app.js 的「編輯」按鈕呼叫
    openForEdit: function (place) {
      if (!place) return;

      // 回填表單欄位
      this._setValue('place-id', place.id);
      this._setValue('place-serviceman-name', place.serviceman_name || place.soldier_name || '');
      this._setValue('place-category', place.category || '');
      this._setValue('place-visit-name', place.visit_name || '');
      this._setValue('place-visit-target', place.visit_target || place.target_name || '');
      this._setValue('place-condolence-order-no', place.condolence_order_no || '');

      var over65 = document.getElementById('place-beneficiary-over65');
      if (over65) over65.value = (place.beneficiary_over65 || 'N');

      this._setValue('place-address-text', place.address_text || place.address || '');
      this._setValue('place-note', place.note || '');

      // 列管：三欄回填（後端若還沒有 town_code / county_code，也不會壞，會是空字串）
      this._setTownHidden(
        (place.managed_district || ''),
        (place.managed_town_code || ''),
        (place.managed_county_code || '')
      );

      var titleEl = document.getElementById('modal-place-title');
      if (titleEl) titleEl.textContent = '編輯標記';

      this._ensureTownOptionsLoaded().finally(function () {
        PlaceForm._syncSelectFromHidden();
        PlaceForm.openModal('modal-place-form');
      });
    },

    // 儲存：由 app.js 的「儲存」按鈕呼叫
    submit: async function (currentPlaceForEditFallback) {
      if (!this._form) return;
      if (!this._PlacesApi) {
        alert('PlacesApi 未載入，無法儲存');
        return;
      }

      var formData = new FormData(this._form);
      var id = (formData.get('id') || '').toString().trim();

      // 注意：列管欄位一律從 hidden 取（select 只是 UI）
      var payload = {
        serviceman_name: (formData.get('serviceman_name') || '').toString().trim(),
        category: (formData.get('category') || '').toString().trim(),
        visit_name: (formData.get('visit_name') || '').toString().trim(),
        visit_target: (formData.get('visit_target') || '').toString().trim(),
        condolence_order_no: (formData.get('condolence_order_no') || '').toString().trim(),
        beneficiary_over65: (formData.get('beneficiary_over65') || 'N').toString().trim().toUpperCase(),

        managed_district: (formData.get('managed_district') || '').toString().trim(),
        managed_town_code: (formData.get('managed_town_code') || '').toString().trim(),
        managed_county_code: (formData.get('managed_county_code') || '').toString().trim(),

        address_text: (formData.get('address_text') || '').toString().trim(),
        note: (formData.get('note') || '').toString().trim()
      };

      // alias 相容（你原本就有）
      payload.soldier_name = payload.serviceman_name;
      payload.target_name = payload.visit_target;
      payload.address = payload.address_text;

      // 基本驗證
      if (!payload.serviceman_name || !payload.category) {
        alert('官兵姓名與類別為必填欄位。');
        return;
      }
      if (!payload.visit_name) {
        alert('受益人姓名為必填欄位。');
        return;
      }
      if (payload.beneficiary_over65 !== 'Y' && payload.beneficiary_over65 !== 'N') {
        payload.beneficiary_over65 = 'N';
      }

      // 如果你要求列管必選，可打開這段：
      // if (!payload.managed_district) { alert('請選擇列管鄉鎮市區'); return; }

      var latLng = (this._MapModule && this._MapModule.getTempNewPlaceLatLng)
        ? this._MapModule.getTempNewPlaceLatLng()
        : null;

      try {
        if (id) {
          // 編輯：lat/lng 若沒有新點就沿用 currentPlace
          var base = currentPlaceForEditFallback || null;

          var baseLat = base ? (base.lat !== undefined ? base.lat : base.latitude) : null;
          var baseLng = base ? (base.lng !== undefined ? base.lng : base.longitude) : null;

          payload.lat = latLng ? latLng.lat() : (baseLat !== null ? baseLat : null);
          payload.lng = latLng ? latLng.lng() : (baseLng !== null ? baseLng : null);

          if (payload.lat === null || payload.lng === null) {
            alert('編輯時缺少座標資訊，請在地圖上重新長按選擇位置後再儲存。');
            return;
          }

          await this._PlacesApi.update(id, payload);
        } else {
          if (!latLng) {
            alert('請在地圖上長按選擇位置後再儲存。');
            return;
          }
          payload.lat = latLng.lat();
          payload.lng = latLng.lng();

          await this._PlacesApi.create(payload);
        }

        this.closeModal('modal-place-form');
        if (this._MapModule && this._MapModule.clearTempNewPlaceLatLng) {
          this._MapModule.clearTempNewPlaceLatLng();
        }

        // 交由 app.js 決定要不要 refreshPlaces（比較乾淨）
        document.dispatchEvent(new CustomEvent('placeForm:saved'));
      } catch (err) {
        console.error(err);
        alert((err && err.message) ? err.message : '儲存失敗');
      }
    },

    // ========== Modal open/close（把 iOS body lock 一起搬來）==========
    _scrollY: 0,

    openModal: function (id) {
      var el = document.getElementById(id);
      if (!el) return;

      el.classList.add('modal--open');
      el.setAttribute('aria-hidden', 'false');

      document.body.classList.add('is-modal-open');
      this._lockBodyScroll();
    },

    closeModal: function (id) {
      var el = document.getElementById(id);
      if (!el) return;

      el.classList.remove('modal--open');
      el.setAttribute('aria-hidden', 'true');

      document.body.classList.remove('is-modal-open');
      this._unlockBodyScroll();
    },

    _lockBodyScroll: function () {
      this._scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = (-this._scrollY) + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    },

    _unlockBodyScroll: function () {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, this._scrollY || 0);
    },

    // ========== 列管鄉鎮市區選單 ==========
    _ensureTownOptionsLoaded: function () {
      var self = this;

      if (!self._selectTown) return Promise.resolve();
      if (self._townOptionsLoaded) return Promise.resolve();

      // 沒有 apiRequest 或後端 endpoint 就先降級：只顯示「未提供」
      if (!self._apiRequest) {
        self._setSelectOptions([{ value: '', label: '（無法載入選單）' }]);
        self._townOptionsLoaded = true;
        return Promise.resolve();
      }

      return self._apiRequest('/managed_towns/list', 'GET')
        .then(function (json) {
          // 期待格式：{ success:true, data:[{town_code,town_name,county_code,county_name}] }
          var list = (json && json.success && Array.isArray(json.data)) ? json.data : [];

          if (!list.length) {
            self._setSelectOptions([{ value: '', label: '（此單位無可選鄉鎮市區）' }]);
            self._townOptionsLoaded = true;
            return;
          }

          var opts = [{ value: '', label: '請選擇' }];
          list.forEach(function (it) {
            var townCode = (it.town_code || '').toString();
            var townName = (it.town_name || '').toString();
            var countyCode = (it.county_code || '').toString();
            var countyName = (it.county_name || '').toString();

            // option value 用 town_code（穩定），顯示用名稱
            opts.push({
              value: townCode,
              label: (countyName ? (countyName + ' ') : '') + townName,
              town_name: townName,
              county_code: countyCode
            });
          });

          self._setSelectOptions(opts);
          self._townOptionsLoaded = true;
        })
        .catch(function (err) {
          console.warn('managed_towns/list fail:', err);
          self._setSelectOptions([{ value: '', label: '（載入失敗）' }]);
          self._townOptionsLoaded = true;
        });
    },

    _setSelectOptions: function (opts) {
      if (!this._selectTown) return;

      this._selectTown.innerHTML = '';
      (opts || []).forEach(function (o) {
        var op = document.createElement('option');
        op.value = o.value;
        op.textContent = o.label;

        // 附加資料（給 change 時同步 hidden 用）
        if (o.town_name !== undefined) op.dataset.townName = o.town_name;
        if (o.county_code !== undefined) op.dataset.countyCode = o.county_code;

        this._selectTown.appendChild(op);
      }, this);
    },

    _onTownChanged: function () {
      if (!this._selectTown) return;

      var val = this._selectTown.value || '';
      var sel = this._selectTown.options[this._selectTown.selectedIndex];

      // town_code = val
      var townCode = val;
      var townName = (sel && sel.dataset && sel.dataset.townName) ? sel.dataset.townName : '';
      var countyCode = (sel && sel.dataset && sel.dataset.countyCode) ? sel.dataset.countyCode : '';

      // managed_district 顯示名稱（你目前 places 表格顯示的是這個）
      this._setTownHidden(townName, townCode, countyCode);
    },

    _setTownHidden: function (district, townCode, countyCode) {
      if (this._hidDistrict) this._hidDistrict.value = district || '';
      if (this._hidTownCode) this._hidTownCode.value = townCode || '';
      if (this._hidCountyCode) this._hidCountyCode.value = countyCode || '';
    },

    _syncSelectFromHidden: function () {
      // 用 town_code 對回 select（最穩定）
      if (!this._selectTown) return;

      var townCode = (this._hidTownCode && this._hidTownCode.value) ? this._hidTownCode.value : '';
      if (!townCode) {
        this._selectTown.value = '';
        return;
      }
      this._selectTown.value = townCode;
    },

    _setValue: function (id, v) {
      var el = document.getElementById(id);
      if (!el) return;
      el.value = (v === undefined || v === null) ? '' : String(v);
    }
  };

  global.PlaceForm = PlaceForm;
})(window);
