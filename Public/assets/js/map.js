// Path: Public/assets/js/map.js
// 說明: Google 地圖模組 — 標註顯示/隱藏策略（S1/S2/S3）、長按新增（僅 S1）、目前位置、路線線條（polyline 簡版）
//      ★補齊 tempNewPlaceLatLng 暫存 + getter，供 app.js 新增/編輯存檔使用
//      ★B2/B3/B4：自訂標註 icon（紅框白底+綠框+roc_logo.png）＋OverlayView 姓名 label（含白色陰影由 CSS 控制）
//      ★S2 只顯示加入路線的點並顯示編號（起點不算；第一個拜訪點=1）

var MapModule = (function () {
  var map;
  var autocomplete;
  var geocoder;

  // id -> google.maps.Marker
  var markers = new Map();

  // id -> NameLabelOverlay
  var labelOverlays = new Map();

  // 目前位置 marker
  var myLocationMarker = null;

  // 路線 polyline（簡版：依 routePoints 順序連線）
  var routeLine = null;

  // 狀態（由 app.js 設定）
  var mode = 'BROWSE';

  // 長按偵測
  var lastPointerDown = 0;
  var LONG_PRESS_MS = 600;

  // places 快取
  var placesCache = [];

  // ★暫存「長按新增」的點位（提供 app.js 取用）
  var tempNewPlaceLatLng = null;

  // ★自訂 ROC icon dataURL 快取
  var rocMarkerIconUrl = null;
  var rocMarkerIconReady = false;
  var rocMarkerIconWaiters = [];

  function init(options) {
    var mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = new google.maps.Map(mapEl, {
      center: { lat: 23.7, lng: 120.9 },
      zoom: 7,
      gestureHandling: 'greedy',
      scrollwheel: true,
      draggableCursor: 'default',
      draggingCursor: 'move',
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });

    geocoder = new google.maps.Geocoder();

    setupLongPressDetector();
    setupAutocomplete(options && options.onSearchPlaceSelected);
    setupMapClickHandlers(options);

    // 預先啟動 icon 生成（不阻塞）
    ensureRocIcon(function () {});
  }

  /* ---------- 對外：切換模式 + 顯示策略 ---------- */
  function setMode(nextMode, routePoints) {
    mode = nextMode || 'BROWSE';

    // 1) Marker 顯示策略
    applyMarkersByMode(routePoints || []);

    // 2) 路線顯示策略：僅 S3 顯示線條
    if (mode === 'ROUTE_READY') {
      drawRouteLine(routePoints || []);
    } else {
      clearRouteLine();
    }
  }

  /* ---------- 長按偵測 ---------- */
  function setupLongPressDetector() {
    if (!map) return;
    var mapDiv = map.getDiv();

    function onDown() {
      lastPointerDown = Date.now();
    }

    mapDiv.addEventListener('mousedown', onDown);
    mapDiv.addEventListener('touchstart', onDown, { passive: true });
  }

  function wasLongPress() {
    if (!lastPointerDown) return false;
    var diff = Date.now() - lastPointerDown;
    lastPointerDown = 0;
    return diff >= LONG_PRESS_MS;
  }

  /* ---------- Autocomplete ---------- */
  function setupAutocomplete(onPlaceSelected) {
    var input = document.getElementById('map-search-input');
    if (!input) return;

    autocomplete = new google.maps.places.Autocomplete(input, {
      fields: ['geometry', 'formatted_address', 'name']
    });

    autocomplete.addListener('place_changed', function () {
      var place = autocomplete.getPlace();
      if (!place.geometry || !place.geometry.location) return;

      map.panTo(place.geometry.location);
      map.setZoom(16);

      if (typeof onPlaceSelected === 'function') {
        onPlaceSelected(place);
      }
    });
  }

  /* ---------- 地圖點擊（長按新增：僅 S1） ---------- */
  function setupMapClickHandlers(options) {
    var newPlaceCb =
      options &&
      (options.onMapLongPressForNewPlace || options.onMapClickForNewPlace);

    map.addListener('click', function (evt) {
      // 規格：S2/S3 點地圖空白不做「關抽屜」行為；這裡也不做新增
      if (mode !== 'BROWSE') return;

      // 不是長按就忽略
      if (!wasLongPress()) return;

      // ★暫存本次新增點位
      tempNewPlaceLatLng = evt.latLng;

      // 反查地址後回呼
      if (geocoder) {
        geocoder.geocode({ location: evt.latLng }, function (results, status) {
          var addr = '';
          if (status === 'OK' && results && results[0]) {
            addr = results[0].formatted_address || '';
          }
          if (typeof newPlaceCb === 'function') newPlaceCb(evt.latLng, addr);
        });
      } else {
        if (typeof newPlaceCb === 'function') newPlaceCb(evt.latLng, '');
      }
    });
  }

  /* ---------- 供 app.js 使用：取得/清除暫存點位 ---------- */
  function getTempNewPlaceLatLng() {
    return tempNewPlaceLatLng;
  }

  function clearTempNewPlaceLatLng() {
    tempNewPlaceLatLng = null;
  }

  /* ---------- 目前位置 ---------- */
  function showMyLocation(lat, lng) {
    if (!map) return;
    if (!isFinite(lat) || !isFinite(lng)) return;

    var pos = { lat: lat, lng: lng };

    if (myLocationMarker) myLocationMarker.setMap(null);

    myLocationMarker = new google.maps.Marker({
      map: map,
      position: pos,
      title: '目前位置',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: '#1976d2',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2
      },
      label: {
        text: '起',
        color: '#1976d2',
        fontSize: '12px',
        fontWeight: '700'
      }
    });

    map.panTo(pos);
    map.setZoom(15);
  }

  /* =========================================================
     B2：姓名 Label Overlay（不用 InfoWindow / 不用 Marker label）
     - 由 CSS .map-name-label 負責字型、顏色、陰影
     ========================================================= */
  function NameLabelOverlay(mapRef, latLng, text) {
    this.map = mapRef;
    this.latLng = latLng;
    this.text = text || '';
    this.div = null;
    this.setMap(mapRef);
  }
  NameLabelOverlay.prototype = Object.create(google.maps.OverlayView.prototype);

  NameLabelOverlay.prototype.onAdd = function () {
    var div = document.createElement('div');
    div.className = 'map-name-label';
    div.textContent = this.text;
    this.div = div;

    // overlayMouseTarget：可跟著地圖縮放移動；pointer-events 由 CSS 控制為 none
    var panes = this.getPanes();
    panes.overlayMouseTarget.appendChild(div);
  };

  NameLabelOverlay.prototype.draw = function () {
    if (!this.div) return;
    var proj = this.getProjection();
    if (!proj) return;

    var pos = proj.fromLatLngToDivPixel(this.latLng);
    if (!pos) return;

    this.div.style.left = pos.x + 'px';
    this.div.style.top = pos.y + 'px';
  };

  NameLabelOverlay.prototype.onRemove = function () {
    if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
    this.div = null;
  };

  NameLabelOverlay.prototype.setText = function (t) {
    this.text = t || '';
    if (this.div) this.div.textContent = this.text;
  };

  NameLabelOverlay.prototype.setLatLng = function (latLng) {
    this.latLng = latLng;
    this.draw();
  };

  NameLabelOverlay.prototype.setVisible = function (v) {
    if (this.div) this.div.style.display = v ? 'block' : 'none';
  };

  /* =========================================================
     B2：ROC Icon（紅框白底圓點 + 綠框 + 置中 roc_logo.png）
     - 只生成一次 dataURL，全 marker 共用
     ========================================================= */
  function ensureRocIcon(cb) {
    if (rocMarkerIconReady) {
      if (typeof cb === 'function') cb(rocMarkerIconUrl);
      return;
    }

    if (typeof cb === 'function') rocMarkerIconWaiters.push(cb);
    if (rocMarkerIconWaiters.length > 1) return; // 已在生成中

    var img = new Image();
    img.onload = function () {
      try {
        var size = 46;
        var cx = size / 2;
        var cy = size / 2;

        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        var ctx = canvas.getContext('2d');

        // 外圈：白底 + 紅框
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#d32f2f';
        ctx.stroke();

        // 內圈：白底 + 綠框
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#2e7d32';
        ctx.stroke();

        // logo（置中縮放 18x18）
        ctx.drawImage(img, cx - 9, cy - 9, 18, 18);

        rocMarkerIconUrl = canvas.toDataURL('image/png');
      } catch (e) {
        rocMarkerIconUrl = null;
      }

      rocMarkerIconReady = true;
      flushRocIconWaiters();
    };

    img.onerror = function () {
      rocMarkerIconUrl = null;
      rocMarkerIconReady = true;
      flushRocIconWaiters();
    };

    img.src = '/assets/img/roc_logo.png';
  }

  function flushRocIconWaiters() {
    var list = rocMarkerIconWaiters.slice();
    rocMarkerIconWaiters = [];
    list.forEach(function (fn) {
      try { fn(rocMarkerIconUrl); } catch (e) {}
    });
  }

  function buildRocMarkerIcon() {
    // 若 icon 還沒好，暫用 fallback（之後不補更新，以簡化；通常 init 時就已生成）
    if (!rocMarkerIconUrl) {
      return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#ffffff',
        fillOpacity: 1,
        strokeColor: '#d32f2f',
        strokeWeight: 3
      };
    }

    return {
      url: rocMarkerIconUrl,
      scaledSize: new google.maps.Size(34, 34),
      anchor: new google.maps.Point(17, 17)
    };
  }

  function buildRouteNumberIcon() {
    // S2：編號點（用綠色圓點即可，避免 icon 過於花）
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: '#4ca771',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2
    };
  }

  /* ---------- 載入標記（不使用 InfoWindow；S1/S3 用 Overlay label 呈現姓名） ---------- */
  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    // 清舊 marker
    markers.forEach(function (m) { m.setMap(null); });
    markers.clear();

    // 清舊 overlay
    labelOverlays.forEach(function (ov) { if (ov) ov.setMap(null); });
    labelOverlays.clear();

    placesCache = Array.isArray(placeList) ? placeList : [];

    // 確保 icon ready 後再建立 marker（避免一開始 iconUrl 還沒生成）
    ensureRocIcon(function () {
      placesCache.forEach(function (p) {
        var lat = parseFloat(p.lat);
        var lng = parseFloat(p.lng);
        if (!isFinite(lat) || !isFinite(lng)) return;

        var pos = new google.maps.LatLng(lat, lng);

        var marker = new google.maps.Marker({
          map: map,
          position: { lat: lat, lng: lng },
          title: p.soldier_name || '',
          icon: buildRocMarkerIcon(),
          label: null
        });

        marker.addListener('click', function () {
          if (mode === 'ROUTE_PLANNING') {
            if (typeof onMarkerRouteSelect === 'function') onMarkerRouteSelect(p);
          } else if (mode === 'BROWSE') {
            if (typeof onMarkerClick === 'function') onMarkerClick(p);
          } else {
            // ROUTE_READY：規格禁止直接加入路線（不做事）
          }
        });

        markers.set(p.id, marker);

        // 姓名 overlay（S1/S3 才顯示；S2 會全部隱藏）
        if (p.soldier_name) {
          var ov = new NameLabelOverlay(map, pos, String(p.soldier_name));
          ov.setVisible(false); // 交給 applyMarkersByMode 控制
          labelOverlays.set(p.id, ov);
        }
      });

      // 建完立即套用一次目前狀態（避免首次不顯示）
      applyMarkersByMode([]);
    });
  }

  /* ---------- 依模式調整標註顯示 ---------- */
  function applyMarkersByMode(routePoints) {
    // 先全部隱藏 marker
    markers.forEach(function (m) { m.setVisible(false); });

    // 先全部隱藏 overlay
    labelOverlays.forEach(function (ov) { if (ov) ov.setVisible(false); });

    if (mode === 'BROWSE') {
      // S1：顯示所有標註（ROC icon + 姓名 overlay）
      markers.forEach(function (m, id) {
        m.setVisible(true);
        m.setLabel(null);
        m.setIcon(buildRocMarkerIcon());

        var ov = labelOverlays.get(id);
        if (ov) ov.setVisible(true);
      });
      return;
    }

    if (mode === 'ROUTE_PLANNING') {
      // S2：只顯示已加入路線的點（編號），其他完全不顯示；姓名 overlay 全隱藏
      var ids = new Set();
      (routePoints || []).forEach(function (p) {
        if (p && p.id && p.id !== '__me') ids.add(p.id);
      });

      ids.forEach(function (id) {
        var m = markers.get(id);
        if (!m) return;

        m.setVisible(true);

        // routePoints 內 index=0 是 __me 起點
        // 第一個拜訪點 index=1 要顯示 "1"
        var idx = findRouteIndex(routePoints, id);
        var numberText = (idx >= 1) ? String(idx) : '';

        m.setLabel(numberText ? {
          text: numberText,
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '700'
        } : null);

        m.setIcon(buildRouteNumberIcon());
      });

      return;
    }

    if (mode === 'ROUTE_READY') {
      // S3：顯示所有標註（ROC icon + 姓名 overlay）＋ polyline（由 setMode 控制）
      markers.forEach(function (m, id) {
        m.setVisible(true);
        m.setLabel(null);
        m.setIcon(buildRocMarkerIcon());

        var ov = labelOverlays.get(id);
        if (ov) ov.setVisible(true);
      });

      return;
    }
  }

  function findRouteIndex(routePoints, id) {
    if (!Array.isArray(routePoints)) return -1;
    for (var i = 0; i < routePoints.length; i++) {
      if (routePoints[i] && routePoints[i].id === id) return i;
    }
    return -1;
  }

  /* ---------- 路線線條：簡版 polyline（僅 S3） ---------- */
  function drawRouteLine(routePoints) {
    clearRouteLine();

    if (!Array.isArray(routePoints) || routePoints.length < 2) return;

    var path = [];
    for (var i = 0; i < routePoints.length; i++) {
      var p = routePoints[i];
      if (!p) continue;

      var lat = (typeof p.lat === 'function') ? p.lat() : parseFloat(p.lat);
      var lng = (typeof p.lng === 'function') ? p.lng() : parseFloat(p.lng);

      if (!isFinite(lat) || !isFinite(lng)) continue;
      path.push({ lat: lat, lng: lng });
    }

    if (path.length < 2) return;

    routeLine = new google.maps.Polyline({
      path: path,
      geodesic: true,
      strokeOpacity: 0.9,
      strokeWeight: 4,
      strokeColor: '#1a73e8'
    });

    routeLine.setMap(map);

    try {
      var bounds = new google.maps.LatLngBounds();
      path.forEach(function (pt) { bounds.extend(pt); });
      map.fitBounds(bounds, 60);
    } catch (e) {
      // ignore
    }
  }

  function clearRouteLine() {
    if (routeLine) {
      routeLine.setMap(null);
      routeLine = null;
    }
  }

  /* ---------- 聚焦某個地點 ---------- */
  function focusPlace(place) {
    var lat = parseFloat(place.lat);
    var lng = parseFloat(place.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;

    var pos = { lat: lat, lng: lng };
    map.panTo(pos);
    map.setZoom(16);

    var m = markers.get(place.id);
    if (m) {
      m.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(function () { m.setAnimation(null); }, 700);
    }
  }

  /* ---------- 組 Google 導航 URL ---------- */
  function buildDirectionsUrl(routePlaces) {
    if (!routePlaces || routePlaces.length < 2) return null;

    var oLat = parseFloat(routePlaces[0].lat);
    var oLng = parseFloat(routePlaces[0].lng);
    if (!isFinite(oLat) || !isFinite(oLng)) return null;

    var origin = oLat + ',' + oLng;

    var last = routePlaces[routePlaces.length - 1];
    var dLat = parseFloat(last.lat);
    var dLng = parseFloat(last.lng);
    if (!isFinite(dLat) || !isFinite(dLng)) return null;

    var destination = dLat + ',' + dLng;

    var waypoints = routePlaces
      .slice(1, -1)
      .map(function (p) {
        var wLat = parseFloat(p.lat);
        var wLng = parseFloat(p.lng);
        if (!isFinite(wLat) || !isFinite(wLng)) return null;
        return wLat + ',' + wLng;
      })
      .filter(Boolean)
      .join('|');

    var url =
      'https://www.google.com/maps/dir/?api=1&origin=' +
      encodeURIComponent(origin) +
      '&destination=' +
      encodeURIComponent(destination);

    if (waypoints) url += '&waypoints=' + encodeURIComponent(waypoints);
    url += '&travelmode=driving';

    return url;
  }

  return {
    init: init,
    setPlaces: setPlaces,
    setMode: setMode,
    focusPlace: focusPlace,
    buildDirectionsUrl: buildDirectionsUrl,
    showMyLocation: showMyLocation,
    getTempNewPlaceLatLng: getTempNewPlaceLatLng,
    clearTempNewPlaceLatLng: clearTempNewPlaceLatLng
  };
})();

window.MapController = MapModule;
