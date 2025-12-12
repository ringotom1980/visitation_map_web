// Path: Public/assets/js/map.js
// 說明: Google 地圖模組 — 標註顯示/隱藏策略（S1/S2/S3）、長按新增（僅 S1）、目前位置、路線線條（polyline 簡版）
//      ★補齊 tempNewPlaceLatLng 暫存 + getter，供 app.js 新增/編輯存檔使用

var MapModule = (function () {
  var map;
  var autocomplete;
  var geocoder;

  // id -> google.maps.Marker
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

  /* ---------- 載入標記（不使用 InfoWindow；用 marker label 呈現姓名） ---------- */
  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    // 清舊 marker
    markers.forEach(function (m) { m.setMap(null); });
    markers.clear();

    placesCache = Array.isArray(placeList) ? placeList : [];

    placesCache.forEach(function (p) {
      var lat = parseFloat(p.lat);
      var lng = parseFloat(p.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;

      var marker = new google.maps.Marker({
        map: map,
        position: { lat: lat, lng: lng },
        title: p.soldier_name || '',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#4ca771',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        },
        // S1：姓名以 label 顯示（無框、無底色）
        label: (p.soldier_name ? {
          text: String(p.soldier_name),
          color: '#1f2937',
          fontSize: '13px',
          fontWeight: '600'
        } : null)
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
    });
  }

  /* ---------- 依模式調整標註顯示 ---------- */
  function applyMarkersByMode(routePoints) {
    // 先全部隱藏
    markers.forEach(function (m) { m.setVisible(false); });

    if (mode === 'BROWSE') {
      // S1：顯示所有標註（圓點+姓名 label）
      markers.forEach(function (m) { m.setVisible(true); });

      markers.forEach(function (m) {
        var t = m.getTitle() || '';
        if (t) {
          m.setLabel({
            text: t,
            color: '#1f2937',
            fontSize: '13px',
            fontWeight: '600'
          });
        } else {
          m.setLabel(null);
        }
        m.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#4ca771',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        });
      });

      return;
    }

    if (mode === 'ROUTE_PLANNING') {
      // S2：只顯示已加入路線的點（編號），其他完全不顯示
      var ids = new Set();
      (routePoints || []).forEach(function (p) {
        if (p && p.id && p.id !== '__me') ids.add(p.id);
      });

      ids.forEach(function (id) {
        var m = markers.get(id);
        if (!m) return;
        m.setVisible(true);

        var idx = findRouteIndex(routePoints, id);
        var numberText = idx >= 0 ? String(idx + 1) : '';

        m.setLabel({
          text: numberText,
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '700'
        });

        m.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#4ca771',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        });
      });

      return;
    }

    if (mode === 'ROUTE_READY') {
      // S3：顯示所有標註（姓名 label）
      markers.forEach(function (m) { m.setVisible(true); });

      markers.forEach(function (m) {
        var t2 = m.getTitle() || '';
        m.setLabel(t2 ? {
          text: t2,
          color: '#1f2937',
          fontSize: '13px',
          fontWeight: '600'
        } : null);

        m.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#4ca771',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        });
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
