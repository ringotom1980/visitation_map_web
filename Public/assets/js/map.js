// Path: Public/assets/js/map.js
// 說明: Google 地圖模組 — 標註顯示/隱藏策略（S1/S2/S3）、長按新增（僅 S1）、目前位置、路線線條（polyline 簡版）
//      ★補齊 tempNewPlaceLatLng 暫存 + getter，供 app.js 新增/編輯存檔使用
//      ★本版重點：為了同時顯示「點內數字」+「旁邊姓名」，姓名改用 OverlayView；Marker label 專注顯示數字

var MapModule = (function () {
  var map;
  var autocomplete;
  var geocoder;

  // id -> { marker: google.maps.Marker, nameOv: NameLabelOverlay, data: place }
  var markers = new Map();

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

  // ===== Overlay：姓名標籤（使用你 app.css 的 .map-name-label）=====
  function NameLabelOverlay(position, text) {
    this.position = position;
    this.text = text || '';
    this.div = null;
    this.setMap(map);
  }
  NameLabelOverlay.prototype = new google.maps.OverlayView();
  NameLabelOverlay.prototype.onAdd = function () {
    var div = document.createElement('div');
    div.className = 'map-name-label';
    div.textContent = this.text;
    this.div = div;

    var panes = this.getPanes();
    panes.overlayMouseTarget.appendChild(div); // 讓文字能正確疊在 marker 上方（但 CSS pointer-events: none）
  };
  NameLabelOverlay.prototype.draw = function () {
    if (!this.div) return;

    var proj = this.getProjection();
    if (!proj || !this.position) return;

    var point = proj.fromLatLngToDivPixel(this.position);
    if (!point) return;

    this.div.style.left = point.x + 'px';
    this.div.style.top = point.y + 'px';
  };
  NameLabelOverlay.prototype.onRemove = function () {
    if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
    this.div = null;
  };
  NameLabelOverlay.prototype.setText = function (t) {
    this.text = t || '';
    if (this.div) this.div.textContent = this.text;
  };
  NameLabelOverlay.prototype.setPosition = function (pos) {
    this.position = pos;
    this.draw();
  };
  NameLabelOverlay.prototype.setVisible = function (visible) {
    if (!this.div) return;
    this.div.style.display = visible ? 'block' : 'none';
  };

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
      if (mode === 'ROUTE_PLANNING') {
        document.dispatchEvent(new CustomEvent('map:blankClick'));
      }
      // 規格：S2/S3 點地圖空白不做行為；這裡也不做新增
      if (mode !== 'BROWSE') return;

      if (!wasLongPress()) return;

      tempNewPlaceLatLng = evt.latLng;

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

    // ✅ 用 SVG 固定起點樣式：藍底白字「起」
    var svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">',
      '  <circle cx="22" cy="22" r="11" fill="#3902ffff" stroke="#ffffff" stroke-width="3" />',
      '</svg>'
    ].join('');

    myLocationMarker = new google.maps.Marker({
      map: map,
      position: pos,
      title: '目前位置',
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(44, 44),
        anchor: new google.maps.Point(22, 22)
      },
      zIndex: 999999
    });

    map.panTo(pos);
    map.setZoom(15);
  }


  /* ---------- 載入標記 ---------- */
  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    // 清舊 marker/overlay
    markers.forEach(function (obj) {
      if (obj && obj.marker) obj.marker.setMap(null);
      if (obj && obj.nameOv) obj.nameOv.setMap(null);
    });
    markers.clear();

    placesCache = Array.isArray(placeList) ? placeList : [];

    placesCache.forEach(function (p) {
      var lat = parseFloat(p.lat);
      var lng = parseFloat(p.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;

      var pos = new google.maps.LatLng(lat, lng);

      // marker：預設不帶 label（label 由模式/是否在路線決定）
      var marker = new google.maps.Marker({
        map: map,
        position: pos,
        title: p.soldier_name || '',
        icon: normalIcon()
      });

      // name overlay：永遠顯示姓名（可依 mode/策略隱藏）
      var nameOv = new NameLabelOverlay(pos, p.soldier_name ? String(p.soldier_name) : '');

      marker.addListener('click', function () {
        if (mode === 'ROUTE_PLANNING') {
          if (typeof onMarkerRouteSelect === 'function') onMarkerRouteSelect(p);
        } else if (mode === 'BROWSE') {
          if (typeof onMarkerClick === 'function') onMarkerClick(p);
        } else if (mode === 'ROUTE_READY') {
          if (typeof onMarkerClick === 'function') onMarkerClick(p);
        }

      });

      markers.set(p.id, { marker: marker, nameOv: nameOv, data: p });
    });
  }

  function normalIcon() {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: '#4ca771',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2
    };
  }

  function routeIcon() {
    // ✅ 路線點：紅色（你要的）
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: '#e53935',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2
    };
  }

  /* ---------- 依模式調整標註顯示 ---------- */
  function applyMarkersByMode(routePoints) {
    // 先全部隱藏
    markers.forEach(function (obj) {
      if (!obj || !obj.marker) return;
      obj.marker.setVisible(false);
      obj.marker.setLabel(null);
      if (obj.nameOv) obj.nameOv.setVisible(false);
    });

    var routeIdSet = new Set();
    (routePoints || []).forEach(function (p) {
      if (p && p.id && p.id !== '__me') routeIdSet.add(p.id);
    });

    if (mode === 'BROWSE') {
      // S1：所有點都顯示；已加入路線者顯示紅圓點白字數字，且名字不消失
      markers.forEach(function (obj, id) {
        obj.marker.setVisible(true);
        if (obj.nameOv) obj.nameOv.setVisible(true);

        if (routeIdSet.has(id)) {
          var num = routeOrderNumber(routePoints, id);
          obj.marker.setIcon(routeIcon());
          obj.marker.setLabel({
            text: num ? String(num) : '',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: '800'
          });
        } else {
          obj.marker.setIcon(normalIcon());
          obj.marker.setLabel(null);
        }
      });
      return;
    }

    if (mode === 'ROUTE_PLANNING') {
      // S2：所有點仍顯示（方便點選加入/移除）
      //     已加入路線者：紅圓點白字數字；未加入：綠圓點；名字都顯示
      markers.forEach(function (obj, id2) {
        obj.marker.setVisible(true);
        if (obj.nameOv) obj.nameOv.setVisible(true);

        if (routeIdSet.has(id2)) {
          var num2 = routeOrderNumber(routePoints, id2);
          obj.marker.setIcon(routeIcon());
          obj.marker.setLabel({
            text: num2 ? String(num2) : '',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: '800'
          });
        } else {
          obj.marker.setIcon(normalIcon());
          obj.marker.setLabel(null);
        }
      });
      return;
    }

    if (mode === 'ROUTE_READY') {
      // S3：只顯示已加入路線的點；未加入一律隱藏
      markers.forEach(function (obj3, id3) {
        if (!routeIdSet.has(id3)) return;

        obj3.marker.setVisible(true);
        if (obj3.nameOv) obj3.nameOv.setVisible(true);

        var num3 = routeOrderNumber(routePoints, id3);
        obj3.marker.setIcon(routeIcon());
        obj3.marker.setLabel({
          text: num3 ? String(num3) : '',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '800'
        });
      });
      return;
    }
  }

  // ✅ 路線編號：只對「拜訪點」編號（排除 __me 起點）
  function routeOrderNumber(routePoints, id) {
    if (!Array.isArray(routePoints)) return 0;
    var n = 0;
    for (var i = 0; i < routePoints.length; i++) {
      var p = routePoints[i];
      if (!p || !p.id || p.id === '__me') continue;
      n++;
      if (p.id === id) return n;
    }
    return 0;
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

    var obj = markers.get(place.id);
    if (obj && obj.marker) {
      obj.marker.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(function () { obj.marker.setAnimation(null); }, 700);
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

window.MapModule = MapModule;

