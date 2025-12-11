// Public/assets/js/map.js
// MapModule：專責管理 Google Map / 標記 / 搜尋 / 規劃模式（不使用新語法）

var MapModule = (function () {
  var map;
  var autocomplete;

  // id -> google.maps.Marker
  var markers = new Map();

  // 狀態
  var routeMode = false;
  var addPlaceMode = false;
  var tempNewPlaceLatLng = null;

  function init(options) {
    var mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = new google.maps.Map(mapEl, {
      center: { lat: 23.7, lng: 120.9 }, // Taiwan center
      zoom: 7,

      // 手機可單指拖曳 + 雙指縮放
      gestureHandling: 'greedy',
      scrollwheel: true,

      // 調整滑鼠游標：預設箭頭，比較像一般網站，而不是永遠手掌
      draggableCursor: 'default',
      draggingCursor: 'move',

      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });

    setupAutocomplete(options && options.onSearchPlaceSelected);
    setupMapClickHandlers(options);
  }

  function setupAutocomplete(onPlaceSelected) {
    var input = document.getElementById('map-search-input');
    if (!input) return;

    // 這裡還是用舊的 Autocomplete，警告可以先忍受，之後再改新版 Web Component
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

  function setupMapClickHandlers(options) {
    map.addListener('click', function (evt) {
      // 新增模式：點一下地圖，記住座標，叫外面開表單
      if (addPlaceMode) {
        tempNewPlaceLatLng = evt.latLng;

        if (options && typeof options.onMapClickForNewPlace === 'function') {
          options.onMapClickForNewPlace(evt.latLng);
        }

        // 不自動關閉新增模式，使用者可以重點一次覆蓋
        return;
      }

      // 路線規劃模式：點地圖本身不做事（點 marker 另有 handler）
      if (routeMode) return;
    });
  }

  function enableRouteMode(enabled) {
    routeMode = !!enabled;
  }

  function enableAddPlaceMode() {
    addPlaceMode = true;
    tempNewPlaceLatLng = null;
  }

  function getTempNewPlaceLatLng() {
    return tempNewPlaceLatLng;
  }

  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    // 清掉舊 marker
    markers.forEach(function (m) {
      m.setMap(null);
    });
    markers.clear();

    if (!Array.isArray(placeList)) return;

    placeList.forEach(function (p) {
      var lat = parseFloat(p.lat);
      var lng = parseFloat(p.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;

      // 仍然使用 google.maps.Marker，警告可先忽略
      var marker = new google.maps.Marker({
        map: map,
        position: { lat: lat, lng: lng },
        title: p.soldier_name || '',
        icon: chooseMarkerIcon(p)
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

      markers.set(p.id, marker);
    });
  }

  function chooseMarkerIcon(place) {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: '#4ca771',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2
    };
  }

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

  return {
    init: init,
    setPlaces: setPlaces,
    focusPlace: focusPlace,
    enableRouteMode: enableRouteMode,
    enableAddPlaceMode: enableAddPlaceMode,
    getTempNewPlaceLatLng: getTempNewPlaceLatLng,
    buildDirectionsUrl: buildDirectionsUrl
  };
})();

// 讓 app.js 可以透過 window.MapController 使用
window.MapController = MapModule;
