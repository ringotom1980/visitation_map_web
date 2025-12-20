// Path: Public/assets/js/focus_camera.js
// 說明: 鏡頭聚焦控制（點標註放大/對齊、關抽屜回復視角）
// - 不碰 UI、不碰抽屜 DOM，只做 map camera
// - 與 app.js / MapModule 解耦：以 init 注入依賴

(function (global) {
  'use strict';

  var FocusCamera = {
    _MapModule: null,

    // config
    _focusZoom: 16,

    // state
    _hasPrevView: false,
    _prevCenter: null,
    _prevZoom: null,
    _inFocusSession: false,

    init: function (opts) {
      opts = opts || {};
      this._MapModule = opts.MapModule || global.MapModule || null;
      if (opts.focusZoom !== undefined && opts.focusZoom !== null && isFinite(Number(opts.focusZoom))) {
        this._focusZoom = Number(opts.focusZoom);
      }
    },

    // 記錄目前視角（只記一次：避免連點不同點把回復視角洗掉）
    _capturePrevViewOnce: function () {
      if (this._inFocusSession) return;

      var map = this._MapModule && this._MapModule.getMap ? this._MapModule.getMap() : null;
      if (!map) return;

      var c = map.getCenter && map.getCenter();
      var z = map.getZoom && map.getZoom();

      if (!c || !isFinite(Number(z))) return;

      this._prevCenter = { lat: c.lat(), lng: c.lng() };
      this._prevZoom = Number(z);
      this._hasPrevView = true;
      this._inFocusSession = true;
    },

    // 點標註：放大到 focusZoom（只在目前 zoom 小於 focusZoom 時才放大，避免你手動放大後又被改小/改大）
    focusToPlace: function (place) {
      if (!place) return;
      var lat = Number(place.lat);
      var lng = Number(place.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;

      if (!this._MapModule || typeof this._MapModule.getMap !== 'function') return;
      var map = this._MapModule.getMap();
      if (!map) return;

      this._capturePrevViewOnce();

      // 先置中
      map.panTo({ lat: lat, lng: lng });

      // 再放大（只在不足時放大）
      var curZoom = map.getZoom && map.getZoom();
      if (isFinite(Number(curZoom)) && Number(curZoom) < this._focusZoom) {
        map.setZoom(this._focusZoom);
      }
    },

    // 關抽屜/點空白：回復到之前的視角
    restoreOverview: function () {
      if (!this._hasPrevView) {
        this._inFocusSession = false;
        return;
      }

      var map = this._MapModule && this._MapModule.getMap ? this._MapModule.getMap() : null;
      if (!map) {
        this._inFocusSession = false;
        return;
      }

      if (this._prevCenter) map.panTo(this._prevCenter);
      if (isFinite(Number(this._prevZoom))) map.setZoom(this._prevZoom);

      // reset
      this._inFocusSession = false;
      // 注意：保留 _hasPrevView 也可以；但這裡我們回復一次就清掉更直覺
      this._hasPrevView = false;
      this._prevCenter = null;
      this._prevZoom = null;
    },

    // 當你希望「新的點擊」重新建立回復點（例如你手動離開某個流程）
    resetSession: function () {
      this._inFocusSession = false;
      this._hasPrevView = false;
      this._prevCenter = null;
      this._prevZoom = null;
    }
  };

  global.FocusCamera = FocusCamera;
})(window);
