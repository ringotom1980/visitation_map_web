// Public/assets/js/map.js
// MapModule：專責管理 Google Map / 標記 / 搜尋 / 規劃模式

var MapModule = (function () {
  var map;
  var autocomplete;
  var geocoder;

  // id -> google.maps.Marker
  var markers = new Map();
  var nameInfoWindows = [];

  // 目前位置 marker
  var myLocationMarker = null;

  // 狀態
  var routeMode = false;
  var tempNewPlaceLatLng = null;

  // 長按偵測
  var lastPointerDown = 0;
  var LONG_PRESS_MS = 600; // 至少 0.6 秒視為長按

  function init(options) {
    var mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = new google.maps.Map(mapEl, {
      center: { lat: 23.7, lng: 120.9 }, // Taiwan
      zoom: 7,

      // 手機：單指拖曳、雙指縮放
      gestureHandling: 'greedy',
      scrollwheel: true,

      // 桌機滑鼠游標：預設箭頭、拖曳時變 move
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

  /* ---------- 長按偵測：透過地圖 div 的事件量測按住時間 ---------- */
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
    lastPointerDown = 0; // 用過就清掉
    return diff >= LONG_PRESS_MS;
  }

  /* ---------- 搜尋框 Autocomplete ---------- */
  function setupAutocomplete(onPlaceSelected) {
    var input = document.getElementById('map-search-input');
    if (!input) return;

    // 目前仍沿用舊版 Autocomplete，警告先忽略即可
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

  /* ---------- 地圖點擊（含長按新增標記） ---------- */
  function setupMapClickHandlers(options) {
    var newPlaceCb =
      options &&
      (options.onMapLongPressForNewPlace || options.onMapClickForNewPlace);

    map.addListener('click', function (evt) {
      // 路線模式：點地圖本身不處理
      if (routeMode) return;

      // 不是長按就忽略（避免一點就跳視窗）
      if (!wasLongPress()) return;

      tempNewPlaceLatLng = evt.latLng;

      // 先反查地址，再回呼出去開表單
      if (geocoder) {
        geocoder.geocode({ location: evt.latLng }, function (results, status) {
          var addr = '';
          if (status === 'OK' && results && results[0]) {
            addr = results[0].formatted_address || '';
          }

          if (typeof newPlaceCb === 'function') {
            newPlaceCb(evt.latLng, addr);
          }
        });
      } else {
        if (typeof newPlaceCb === 'function') {
          newPlaceCb(evt.latLng, '');
        }
      }
    });
  }

  /* ---------- 對外狀態控制 ---------- */
  function enableRouteMode(enabled) {
    routeMode = !!enabled;
  }

  function getTempNewPlaceLatLng() {
    return tempNewPlaceLatLng;
  }

  /* ---------- 顯示「目前位置」 ---------- */
  function showMyLocation(lat, lng) {
    if (!map) return;
    var pos = { lat: lat, lng: lng };

    if (myLocationMarker) {
      myLocationMarker.setMap(null);
    }

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
      }
    });

    map.panTo(pos);
    map.setZoom(15);
  }

  /* ---------- 載入標記 ---------- */
  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    // 清舊 marker
    markers.forEach(function (m) {
      m.setMap(null);
    });
    markers.clear();

    // 清舊「姓名」泡泡
    nameInfoWindows.forEach(function (iw) {
      iw.close();
    });
    nameInfoWindows = [];

    if (!Array.isArray(placeList)) return;

    placeList.forEach(function (p) {
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
        }
      });

      marker.addListener('click', function () {
        if (routeMode) {
          if (typeof onMarkerRouteSelect === 'function') {
            onMarkerRouteSelect(p);
          }
        } else {
          if (typeof onMarkerClick === 'function') {
            onMarkerClick(p);
          }
        }
      });

      // 在旁邊顯示姓名（小泡泡）
      if (p.soldier_name) {
        var iw = new google.maps.InfoWindow({
          content:
            '<div style="font-size:12px;white-space:nowrap;">' +
            escapeHtml(p.soldier_name) +
            '</div>',
          position: { lat: lat, lng: lng },
          disableAutoPan: true
        });
        iw.open(map);
        nameInfoWindows.push(iw);
      }

      markers.set(p.id, marker);
    });
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
      setTimeout(function () {
        m.setAnimation(null);
      }, 700);
    }
  }

  /* ---------- 組 Google 導航 URL ---------- */
  function buildDirectionsUrl(routePlaces) {
    if (!routePlaces || routePlaces.length < 2) return null;

    var origin =
      routePlaces[0].lat + ',' + routePlaces[0].lng;
    var last = routePlaces[routePlaces.length - 1];
    var destination = last.lat + ',' + last.lng;

    var waypoints = routePlaces
      .slice(1, -1)
      .map(function (p) {
        return p.lat + ',' + p.lng;
      })
      .join('|');

    var url =
      'https://www.google.com/maps/dir/?api=1&origin=' +
      encodeURIComponent(origin) +
      '&destination=' +
      encodeURIComponent(destination);

    if (waypoints) {
      url += '&waypoints=' + encodeURIComponent(waypoints);
    }
    url += '&travelmode=driving';

    return url;
  }

  /* ---------- 小工具：escape HTML ---------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return {
    init: init,
    setPlaces: setPlaces,
    focusPlace: focusPlace,
    enableRouteMode: enableRouteMode,
    getTempNewPlaceLatLng: getTempNewPlaceLatLng,
    buildDirectionsUrl: buildDirectionsUrl,
    showMyLocation: showMyLocation
  };
})();

window.MapController = MapModule;
