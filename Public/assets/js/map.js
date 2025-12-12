// Path: Public/assets/js/map.js
// 說明: Google 地圖模組 — 標註顯示/隱藏策略（S1/S2/S3）、長按新增（僅 S1）、目前位置、路線線條（polyline 簡版）
//      ★S1：紅框白圓點 + 綠框內嵌 roc_logo.png + 右側姓名（正黑體/#ca02a9/白色陰影）
//      ★S2：只顯示已加入路線點（編號），其他完全隱藏
//      ★S3：顯示全部標註 + 路線線條
//      ★補齊 tempNewPlaceLatLng 暫存 + getter，供 app.js 新增/編輯存檔使用

var MapModule = (function () {
  var map;
  var autocomplete;
  var geocoder;

  // id -> { marker, place, kind: 'adv'|'classic' }
  var markers = new Map();

  // 目前位置 marker（維持 classic marker 即可）
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

  // ★請確認你的檔案實際路徑（很重要）
  // 你說的 roc_logo.png：建議放在 Public/assets/img/roc_logo.png
  var ROC_LOGO_URL = '/assets/img/roc_logo.png';

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

  /* =========================================================
     Marker 建立：優先用 AdvancedMarkerElement（可放 DOM + img）
     ========================================================= */

  function hasAdvancedMarker() {
    // 需要 Maps JS 有載入 marker library 才會有 google.maps.marker.AdvancedMarkerElement
    return !!(google && google.maps && google.maps.marker && google.maps.marker.AdvancedMarkerElement);
  }

  function buildS1MarkerContent(placeName) {
    // S1：紅框白圓點 + 綠框內嵌 logo + 右側姓名（正黑體/#ca02a9/白陰影）
    var root = document.createElement('div');
    root.style.display = 'inline-flex';
    root.style.alignItems = 'center';
    root.style.transform = 'translate(-8px, -8px)'; // 讓「點」落在座標上
    root.style.pointerEvents = 'auto';

    var dot = document.createElement('div');
    dot.style.width = '16px';
    dot.style.height = '16px';
    dot.style.borderRadius = '999px';
    dot.style.background = '#ffffff';
    dot.style.border = '3px solid #e53935'; // 紅框
    dot.style.boxSizing = 'border-box';
    dot.style.display = 'flex';
    dot.style.alignItems = 'center';
    dot.style.justifyContent = 'center';

    var inner = document.createElement('div');
    inner.style.width = '12px';
    inner.style.height = '12px';
    inner.style.borderRadius = '999px';
    inner.style.border = '2px solid #2e7d32'; // 綠框
    inner.style.boxSizing = 'border-box';
    inner.style.background = '#ffffff';
    inner.style.display = 'flex';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    inner.style.overflow = 'hidden';

    var img = document.createElement('img');
    img.src = ROC_LOGO_URL;
    img.alt = '';
    img.style.width = '10px';
    img.style.height = '10px';
    img.style.objectFit = 'contain';
    img.style.display = 'block';

    inner.appendChild(img);
    dot.appendChild(inner);

    var label = document.createElement('div');
    label.textContent = placeName || '';
    label.style.marginLeft = '6px';
    label.style.whiteSpace = 'nowrap';
    label.style.fontFamily = '"Microsoft JhengHei","Noto Sans TC",sans-serif';
    label.style.fontSize = '16px';
    label.style.fontWeight = '700';
    label.style.color = '#ca02a9';
    // 白色陰影（像 Google 地名那種可讀性）
    label.style.textShadow = '0 1px 0 #ffffff, 0 0 2px #ffffff, 0 2px 6px rgba(255,255,255,.9)';

    root.appendChild(dot);
    if (placeName) root.appendChild(label);

    return root;
  }

  function buildS2MarkerContent(indexNumber) {
    // S2：綠底白字編號圓點（只顯示已加入路線）
    var root = document.createElement('div');
    root.style.transform = 'translate(-10px, -10px)';
    root.style.pointerEvents = 'auto';

    var dot = document.createElement('div');
    dot.style.width = '20px';
    dot.style.height = '20px';
    dot.style.borderRadius = '999px';
    dot.style.background = '#4ca771';
    dot.style.border = '2px solid #ffffff';
    dot.style.boxShadow = '0 2px 8px rgba(0,0,0,.18)';
    dot.style.display = 'flex';
    dot.style.alignItems = 'center';
    dot.style.justifyContent = 'center';
    dot.style.boxSizing = 'border-box';

    var t = document.createElement('div');
    t.textContent = String(indexNumber || '');
    t.style.color = '#ffffff';
    t.style.fontSize = '12px';
    t.style.fontWeight = '800';
    t.style.fontFamily = '"Microsoft JhengHei","Noto Sans TC",sans-serif';
    t.style.lineHeight = '1';

    dot.appendChild(t);
    root.appendChild(dot);
    return root;
  }

  function createMarkerForPlace(p, onMarkerClick, onMarkerRouteSelect) {
    var lat = parseFloat(p.lat);
    var lng = parseFloat(p.lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;

    var pos = { lat: lat, lng: lng };

    // click handler（依模式分流）
    function handleClick() {
      if (mode === 'ROUTE_PLANNING') {
        if (typeof onMarkerRouteSelect === 'function') onMarkerRouteSelect(p);
      } else if (mode === 'BROWSE') {
        if (typeof onMarkerClick === 'function') onMarkerClick(p);
      } else {
        // ROUTE_READY：規格禁止直接加入路線（不做事）
      }
    }

    if (hasAdvancedMarker()) {
      var content = buildS1MarkerContent(p.soldier_name ? String(p.soldier_name) : '');
      var adv = new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: pos,
        content: content,
        title: p.soldier_name || ''
      });

      adv.addListener('gmp-click', function () {
        handleClick();
      });

      return { marker: adv, kind: 'adv' };
    }

    // fallback：classic marker（做不到 logo 內嵌，只能退回）
    var marker = new google.maps.Marker({
      map: map,
      position: pos,
      title: p.soldier_name || '',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: '#ffffff',
        fillOpacity: 1,
        strokeColor: '#e53935',
        strokeWeight: 3
      },
      label: (p.soldier_name ? {
        text: String(p.soldier_name),
        color: '#ca02a9',
        fontSize: '16px',
        fontWeight: '700',
        fontFamily: '"Microsoft JhengHei","Noto Sans TC",sans-serif'
      } : null)
    });

    marker.addListener('click', handleClick);
    return { marker: marker, kind: 'classic' };
  }

  /* ---------- 載入標記（不使用 InfoWindow） ---------- */
  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    // 清舊 marker
    markers.forEach(function (wrap) {
      if (!wrap || !wrap.marker) return;
      if (wrap.kind === 'adv') {
        wrap.marker.map = null;
      } else {
        wrap.marker.setMap(null);
      }
    });
    markers.clear();

    placesCache = Array.isArray(placeList) ? placeList : [];

    placesCache.forEach(function (p) {
      var wrap = createMarkerForPlace(p, onMarkerClick, onMarkerRouteSelect);
      if (!wrap) return;
      markers.set(p.id, { marker: wrap.marker, kind: wrap.kind, place: p });
    });

    // 依目前 mode 立即套用顯示策略
    applyMarkersByMode([]);
  }

  /* ---------- 依模式調整標註顯示 ---------- */
  function applyMarkersByMode(routePoints) {
    // helper：顯示/隱藏
    function setVisible(wrap, visible) {
      if (!wrap || !wrap.marker) return;
      if (wrap.kind === 'adv') {
        wrap.marker.map = visible ? map : null;
      } else {
        wrap.marker.setVisible(!!visible);
      }
    }

    // helper：更新外觀（adv / classic）
    function setS1Style(wrap) {
      if (!wrap || !wrap.marker) return;
      var p = wrap.place || {};
      var name = p.soldier_name ? String(p.soldier_name) : '';

      if (wrap.kind === 'adv') {
        wrap.marker.content = buildS1MarkerContent(name);
      } else {
        // classic fallback
        wrap.marker.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#ffffff',
          fillOpacity: 1,
          strokeColor: '#e53935',
          strokeWeight: 3
        });
        wrap.marker.setLabel(name ? {
          text: name,
          color: '#ca02a9',
          fontSize: '16px',
          fontWeight: '700',
          fontFamily: '"Microsoft JhengHei","Noto Sans TC",sans-serif'
        } : null);
      }
    }

    function setS2Style(wrap, idxNumber) {
      if (!wrap || !wrap.marker) return;
      if (wrap.kind === 'adv') {
        wrap.marker.content = buildS2MarkerContent(idxNumber);
      } else {
        wrap.marker.setLabel({
          text: String(idxNumber || ''),
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '800'
        });
        wrap.marker.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4ca771',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        });
      }
    }

    // 先全部隱藏
    markers.forEach(function (wrap) {
      setVisible(wrap, false);
    });

    if (mode === 'BROWSE') {
      // S1：顯示全部標註（Google 感：點 + 姓名）
      markers.forEach(function (wrap) {
        setVisible(wrap, true);
        setS1Style(wrap);
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
        var wrap = markers.get(id);
        if (!wrap) return;
        setVisible(wrap, true);

        var idx = findRouteIndex(routePoints, id);
        var numberText = idx >= 0 ? (idx + 1) : '';
        setS2Style(wrap, numberText);
      });

      return;
    }

    if (mode === 'ROUTE_READY') {
      // S3：顯示全部標註（同 S1 樣式）
      markers.forEach(function (wrap) {
        setVisible(wrap, true);
        setS1Style(wrap);
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

    var wrap = markers.get(place.id);
    if (wrap && wrap.kind !== 'adv') {
      // classic marker 才能 bounce（adv 沒這個動畫）
      wrap.marker.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(function () { wrap.marker.setAnimation(null); }, 700);
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
