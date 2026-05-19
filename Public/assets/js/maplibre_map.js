// Path: Public/assets/js/maplibre_map.js
// 說明: MapLibre + MapTiler 地圖模組，維持與舊版 map.js 相同的 MapModule 對外介面

var MapModule = (function () {
  var map;
  var initOptions = {};
  var markersById = new Map();
  var placesCache = [];
  var routeLineSourceId = 'route-line-source';
  var routeLineLayerId = 'route-line-layer';
  var searchPinMarker = null;
  var searchPinLatLng = null;
  var myLocationMarker = null;
  var tempNewPlaceLatLng = null;
  var mode = 'BROWSE';
  var currentRoutePoints = [];
  var filterVisibleIdSet = null;
  var filterRouteKeepIdSet = new Set();

  var config = window.MAP_CONFIG || {};

  function hasMapLibre() {
    return !!(window.maplibregl && typeof maplibregl.Map === 'function');
  }

  function maptilerKey() {
    return String(config.maptilerKey || '');
  }

  function styleUrl() {
    return String(config.maptilerStyleUrl || '');
  }

  function makeLatLng(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    return {
      lat: function () { return lat; },
      lng: function () { return lng; },
      toArray: function () { return [lng, lat]; }
    };
  }

  function normalizeLngLat(input) {
    if (!input) return null;
    if (Array.isArray(input) && input.length >= 2) {
      return { lng: Number(input[0]), lat: Number(input[1]) };
    }
    if (typeof input.lng === 'function' && typeof input.lat === 'function') {
      return { lng: Number(input.lng()), lat: Number(input.lat()) };
    }
    if (input.lng !== undefined && input.lat !== undefined) {
      return { lng: Number(input.lng), lat: Number(input.lat) };
    }
    return null;
  }

  function isValidLatLng(lat, lng) {
    return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function init(options) {
    initOptions = options || {};
    var mapEl = document.getElementById('map');
    if (!mapEl) return;

    if (!hasMapLibre()) {
      console.error('MapLibre GL JS 未載入。');
      return;
    }

    var url = styleUrl();
    if (!url) {
      console.error('MAPTILER_STYLE_URL / MAPTILER_API_KEY 未設定，無法載入 MapLibre 地圖。');
      mapEl.innerHTML = '<div style="padding:16px;background:#fff;color:#b91c1c;">地圖設定未完成：缺少 MapTiler API key。</div>';
      return;
    }

    map = new maplibregl.Map({
      container: 'map',
      style: url,
      center: [120.9, 23.7],
      zoom: 7,
      attributionControl: true
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right');

    map.on('load', function () {
      applyMarkersByMode(currentRoutePoints);
      if (mode === 'ROUTE_READY') drawRouteLine(currentRoutePoints);
    });

    setupLongPressDetector();
    setupMapClickHandlers();
  }

  function setupMapClickHandlers() {
    if (!map) return;
    map.on('click', function (evt) {
      if (mode === 'ROUTE_PLANNING') {
        document.dispatchEvent(new CustomEvent('map:blankClick'));
      }
    });
  }

  var LONG_PRESS_MS = 600;
  var longPressTimer = null;
  var downPoint = null;
  var activePointers = new Set();

  function setupLongPressDetector() {
    if (!map) return;
    var canvas = map.getCanvas();

    canvas.addEventListener('pointerdown', function (e) {
      if (mode !== 'BROWSE') return;
      activePointers.add(e.pointerId);
      if (activePointers.size !== 1) {
        clearLongPress();
        return;
      }

      downPoint = { x: e.clientX, y: e.clientY };
      longPressTimer = setTimeout(function () {
        if (activePointers.size !== 1 || !downPoint) return;

        var rect = canvas.getBoundingClientRect();
        var pt = [e.clientX - rect.left, e.clientY - rect.top];
        var ll = map.unproject(pt);
        tempNewPlaceLatLng = makeLatLng(ll.lat, ll.lng);

        reverseGeocode(ll.lat, ll.lng).then(function (address) {
          if (initOptions && typeof initOptions.onMapLongPressForNewPlace === 'function') {
            initOptions.onMapLongPressForNewPlace(tempNewPlaceLatLng, address || '');
          }
        }).catch(function () {
          if (initOptions && typeof initOptions.onMapLongPressForNewPlace === 'function') {
            initOptions.onMapLongPressForNewPlace(tempNewPlaceLatLng, '');
          }
        });
      }, LONG_PRESS_MS);
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!downPoint) return;
      if (activePointers.size !== 1) {
        clearLongPress();
        return;
      }
      var dx = e.clientX - downPoint.x;
      var dy = e.clientY - downPoint.y;
      if (Math.hypot(dx, dy) > 8) clearLongPress();
    });

    canvas.addEventListener('pointerup', function (e) {
      activePointers.delete(e.pointerId);
      clearLongPress();
    });

    canvas.addEventListener('pointercancel', function (e) {
      activePointers.delete(e.pointerId);
      clearLongPress();
    });
  }

  function clearLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    downPoint = null;
  }

  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    markersById.forEach(function (obj) {
      if (obj && obj.marker) obj.marker.remove();
    });
    markersById.clear();

    placesCache = Array.isArray(placeList) ? placeList : [];

    placesCache.forEach(function (p) {
      var lat = Number(p.lat);
      var lng = Number(p.lng);
      if (!isValidLatLng(lat, lng)) return;

      var el = buildMarkerElement(p, false, '');
      var marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);

      el.addEventListener('click', function (evt) {
        evt.stopPropagation();
        if (mode === 'ROUTE_PLANNING') {
          if (typeof onMarkerRouteSelect === 'function') onMarkerRouteSelect(p);
        } else if (mode === 'BROWSE' || mode === 'ROUTE_READY') {
          if (typeof onMarkerClick === 'function') onMarkerClick(p);
        }
      });

      var pid = Number(p.id);
      if (!isFinite(pid)) return;

      var obj = { marker: marker, element: el, data: p };
      markersById.set(pid, obj);
      markersById.set(String(pid), obj);
    });

    applyMarkersByMode(currentRoutePoints);
  }

  function buildMarkerElement(place, inRoute, label) {
    var wrap = document.createElement('div');
    wrap.className = 'ml-marker';

    var dot = document.createElement('div');
    dot.className = 'ml-marker__dot';
    if (inRoute) dot.classList.add('ml-marker__dot--route');
    dot.textContent = label || '';

    var name = document.createElement('div');
    name.className = 'ml-marker__name';
    name.textContent = (place.serviceman_name || place.soldier_name || '').toString();

    wrap.appendChild(dot);
    wrap.appendChild(name);
    return wrap;
  }

  function updateMarkerElement(obj, inRoute, label, dimmed) {
    if (!obj || !obj.element) return;
    var dot = obj.element.querySelector('.ml-marker__dot');
    if (dot) {
      dot.classList.toggle('ml-marker__dot--route', !!inRoute);
      dot.textContent = label || '';
    }
    obj.element.classList.toggle('ml-marker--dimmed', !!dimmed);
  }

  function setMode(nextMode, routePoints) {
    mode = nextMode || 'BROWSE';
    currentRoutePoints = Array.isArray(routePoints) ? routePoints : [];
    applyMarkersByMode(currentRoutePoints);
    if (mode === 'ROUTE_READY') drawRouteLine(currentRoutePoints);
    else clearRouteLine();
  }

  function applyMarkersByMode(routePoints) {
    if (!map) return;

    var routeIdSet = new Set();
    if (Array.isArray(routePoints) && routePoints.length > 0) {
      routePoints.forEach(function (p) {
        if (!p || p.id === '__me' || p.id === null || p.id === undefined) return;
        routeIdSet.add(Number(p.id));
      });
    } else if (filterRouteKeepIdSet) {
      filterRouteKeepIdSet.forEach(function (id) { routeIdSet.add(Number(id)); });
    }

    function shouldShow(id) {
      id = Number(id);
      if (mode === 'ROUTE_READY') return routeIdSet.has(id);
      if (filterVisibleIdSet === null) return true;
      if (filterVisibleIdSet.has(id)) return true;
      if (routeIdSet.has(id)) return true;
      return false;
    }

    function shouldDim(id) {
      id = Number(id);
      if (filterVisibleIdSet === null) return false;
      if (filterVisibleIdSet.has(id)) return false;
      return routeIdSet.has(id);
    }

    markersById.forEach(function (obj, id) {
      if (!obj || !obj.marker || !obj.element) return;
      id = Number(id);
      if (!isFinite(id)) return;

      var show = shouldShow(id);
      obj.element.style.display = show ? '' : 'none';
      if (!show) return;

      var inRoute = routeIdSet.has(id);
      var label = inRoute ? String(routeOrderNumber(routePoints, id) || '') : '';
      updateMarkerElement(obj, inRoute, label, shouldDim(id));
    });
  }

  function routeOrderNumber(routePoints, id) {
    if (!Array.isArray(routePoints)) return 0;
    var targetId = Number(id);
    var n = 0;
    for (var i = 0; i < routePoints.length; i++) {
      var p = routePoints[i];
      if (!p || p.id === '__me' || p.id === null || p.id === undefined) continue;
      var pid = Number(p.id);
      if (!isFinite(pid)) continue;
      n++;
      if (pid === targetId) return n;
    }
    return 0;
  }

  function drawRouteLine(routePoints) {
    clearRouteLine();
    if (!map || !map.isStyleLoaded() || !Array.isArray(routePoints) || routePoints.length < 2) return;

    var coords = [];
    routePoints.forEach(function (p) {
      if (!p) return;
      var lat = (typeof p.lat === 'function') ? Number(p.lat()) : Number(p.lat);
      var lng = (typeof p.lng === 'function') ? Number(p.lng()) : Number(p.lng);
      if (isValidLatLng(lat, lng)) coords.push([lng, lat]);
    });

    if (coords.length < 2) return;

    map.addSource(routeLineSourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {}
      }
    });

    map.addLayer({
      id: routeLineLayerId,
      type: 'line',
      source: routeLineSourceId,
      paint: {
        'line-color': '#1a73e8',
        'line-width': 4,
        'line-opacity': 0.9
      }
    });

    try {
      var bounds = coords.reduce(function (b, c) {
        return b.extend(c);
      }, new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
    } catch (e) {}
  }

  function clearRouteLine() {
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer(routeLineLayerId)) map.removeLayer(routeLineLayerId);
    if (map.getSource(routeLineSourceId)) map.removeSource(routeLineSourceId);
  }

  function showSearchPin(lngLat) {
    if (!map || !lngLat) return;
    var ll = normalizeLngLat(lngLat);
    if (!ll || !isValidLatLng(ll.lat, ll.lng)) return;
    searchPinLatLng = makeLatLng(ll.lat, ll.lng);

    if (!searchPinMarker) {
      var el = document.createElement('div');
      el.className = 'ml-search-pin';
      searchPinMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([ll.lng, ll.lat]).addTo(map);
    } else {
      searchPinMarker.setLngLat([ll.lng, ll.lat]);
      searchPinMarker.addTo(map);
    }
  }

  function clearSearchPin() {
    searchPinLatLng = null;
    if (searchPinMarker) searchPinMarker.remove();
    searchPinMarker = null;
  }

  function searchByText(query, cb) {
    geocodeForward(query).then(function (result) {
      if (!result) throw new Error('not found');
      panToLatLng(result.lat, result.lng, 16);
      showSearchPin({ lat: result.lat, lng: result.lng });
      if (typeof cb === 'function') cb(null, result);
    }).catch(function (err) {
      if (typeof cb === 'function') cb(err || new Error('not found'));
    });
  }

  function geocodeText(query) {
    return geocodeForward(query);
  }

  function geocodeForward(query) {
    query = String(query || '').trim();
    if (!query) return Promise.reject(new Error('empty query'));
    if (!maptilerKey()) return Promise.reject(new Error('MapTiler API key missing'));

    var params = new URLSearchParams();
    params.set('key', maptilerKey());
    params.set('language', config.language || 'zh');
    params.set('limit', '1');
    params.set('country', config.country || 'tw');

    var url = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(query) + '.json?' + params.toString();
    return fetch(url, { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('Geocoding failed');
        return res.json();
      })
      .then(function (json) {
        var f = json && json.features && json.features[0];
        if (!f || !Array.isArray(f.center)) return null;
        return {
          lat: Number(f.center[1]),
          lng: Number(f.center[0]),
          name: f.text || '',
          formatted_address: f.place_name || f.text || query,
          raw: f
        };
      });
  }

  function reverseGeocode(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isValidLatLng(lat, lng)) return Promise.resolve('');
    if (!maptilerKey()) return Promise.resolve('');

    var params = new URLSearchParams();
    params.set('key', maptilerKey());
    params.set('language', config.language || 'zh');
    params.set('limit', '1');

    var url = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(lng + ',' + lat) + '.json?' + params.toString();
    return fetch(url, { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) return '';
        return res.json();
      })
      .then(function (json) {
        var f = json && json.features && json.features[0];
        return f ? (f.place_name || f.text || '') : '';
      })
      .catch(function () { return ''; });
  }

  function showMyLocation(lat, lng) {
    if (!map) return;
    lat = Number(lat);
    lng = Number(lng);
    if (!isValidLatLng(lat, lng)) return;

    if (myLocationMarker) myLocationMarker.remove();

    var el = document.createElement('div');
    el.className = 'my-location-dot';
    var img = document.createElement('img');
    img.className = 'my-location-dot__logo';
    img.alt = 'ROC';
    img.src = '/assets/img/roc_logo.png';
    el.appendChild(img);

    myLocationMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map);
  }

  function panToLatLng(lat, lng, zoom) {
    if (!map) return;
    lat = Number(lat);
    lng = Number(lng);
    if (!isValidLatLng(lat, lng)) return;
    if (zoom !== undefined && zoom !== null && isFinite(Number(zoom))) {
      map.easeTo({ center: [lng, lat], zoom: Number(zoom), duration: 250 });
    } else {
      map.panTo([lng, lat]);
    }
  }

  function panBy(dx, dy) {
    if (!map) return;
    map.panBy([Number(dx) || 0, Number(dy) || 0], { duration: 0 });
  }

  function focusPlace(place) {
    if (!place) return;
    panToLatLng(place.lat, place.lng);
  }

  function getSheetTop(sheetId) {
    var sheet = document.getElementById(sheetId || 'sheet-place');
    if (!sheet) return null;
    var inner = sheet.querySelector('.bottom-sheet__inner') || sheet;
    var h = inner.offsetHeight || (inner.getBoundingClientRect && inner.getBoundingClientRect().height) || 0;
    h = Number(h);
    if (!isFinite(h) || h <= 0) return null;
    return window.innerHeight - h;
  }

  function focusToPlaceWithSheetOffset(place, opts) {
    if (!map || !place) return;

    opts = opts || {};
    var lat = Number(place.lat);
    var lng = Number(place.lng);
    if (!isValidLatLng(lat, lng)) return;

    var zoom = isFinite(Number(opts.zoom)) ? Number(opts.zoom) : 16;
    var gapPx = isFinite(Number(opts.gapPx)) ? Number(opts.gapPx) : 32;

    var currentZoom = Number(map.getZoom());
    var targetZoom = isFinite(currentZoom) ? Math.max(currentZoom, zoom) : zoom;

    function apply() {
      var canvas = map.getCanvas();
      if (!canvas) {
        panToLatLng(lat, lng, targetZoom);
        return;
      }

      var rect = canvas.getBoundingClientRect();
      var sheetTop = getSheetTop(opts.sheetId || 'sheet-place');
      if (!isFinite(sheetTop)) {
        panToLatLng(lat, lng, targetZoom);
        return;
      }

      var targetY = Math.max(80, (sheetTop - rect.top) - gapPx);
      var offsetY = targetY - (rect.height / 2);

      map.easeTo({
        center: [lng, lat],
        zoom: targetZoom,
        offset: [0, offsetY],
        duration: 280
      });
    }

    if (!map.isStyleLoaded()) {
      map.once('load', apply);
      return;
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(apply);
    });
  }

  function updatePlacePosition(placeId, lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isValidLatLng(lat, lng)) return false;

    var obj = markersById.get(Number(placeId)) || markersById.get(String(placeId));
    if (!obj || !obj.marker) return false;

    obj.marker.setLngLat([lng, lat]);
    if (obj.data) {
      obj.data.lat = lat;
      obj.data.lng = lng;
    }

    placesCache.forEach(function (p) {
      if (String(p.id) === String(placeId)) {
        p.lat = lat;
        p.lng = lng;
      }
    });

    if (mode === 'ROUTE_READY') drawRouteLine(currentRoutePoints);
    applyMarkersByMode(currentRoutePoints);
    return true;
  }

  function buildDirectionsUrl(routePlaces) {
    if (!routePlaces || routePlaces.length < 2) return null;

    var first = routePlaces[0];
    var last = routePlaces[routePlaces.length - 1];
    var oLat = Number(typeof first.lat === 'function' ? first.lat() : first.lat);
    var oLng = Number(typeof first.lng === 'function' ? first.lng() : first.lng);
    var dLat = Number(typeof last.lat === 'function' ? last.lat() : last.lat);
    var dLng = Number(typeof last.lng === 'function' ? last.lng() : last.lng);
    if (!isValidLatLng(oLat, oLng) || !isValidLatLng(dLat, dLng)) return null;

    var url = 'https://www.google.com/maps/dir/?api=1&origin=' +
      encodeURIComponent(oLat + ',' + oLng) +
      '&destination=' + encodeURIComponent(dLat + ',' + dLng);

    var waypoints = routePlaces.slice(1, -1).map(function (p) {
      var lat = Number(typeof p.lat === 'function' ? p.lat() : p.lat);
      var lng = Number(typeof p.lng === 'function' ? p.lng() : p.lng);
      return isValidLatLng(lat, lng) ? (lat + ',' + lng) : null;
    }).filter(Boolean).join('|');

    if (waypoints) url += '&waypoints=' + encodeURIComponent(waypoints);
    return url + '&travelmode=driving';
  }

  function setFilterVisibility(visibleIds, routeKeepIds) {
    if (visibleIds === null) {
      filterVisibleIdSet = null;
    } else {
      filterVisibleIdSet = new Set((visibleIds || []).map(function (x) { return Number(x); }));
    }

    filterRouteKeepIdSet = new Set((routeKeepIds || []).map(function (x) { return Number(x); }));
    applyMarkersByMode(currentRoutePoints);
  }

  function getTempNewPlaceLatLng() {
    return tempNewPlaceLatLng;
  }

  function clearTempNewPlaceLatLng() {
    tempNewPlaceLatLng = null;
  }

  function getProjection() {
    return null;
  }

  function getMap() {
    if (!map) return null;
    return {
      _raw: map,
      getCenter: function () {
        var c = map.getCenter();
        return { lat: function () { return c.lat; }, lng: function () { return c.lng; } };
      },
      getZoom: function () { return map.getZoom(); },
      setZoom: function (z) { map.setZoom(Number(z)); },
      panTo: function (center) {
        var ll = normalizeLngLat(center);
        if (ll && isValidLatLng(ll.lat, ll.lng)) map.panTo([ll.lng, ll.lat]);
      },
      panBy: function (x, y) {
        if (Array.isArray(x)) map.panBy(x, y || {});
        else map.panBy([Number(x) || 0, Number(y) || 0]);
      }
    };
  }

  return {
    init: init,
    setPlaces: setPlaces,
    setMode: setMode,
    focusPlace: focusPlace,
    focusToPlaceWithSheetOffset: focusToPlaceWithSheetOffset,
    updatePlacePosition: updatePlacePosition,
    panToLatLng: panToLatLng,
    buildDirectionsUrl: buildDirectionsUrl,
    showMyLocation: showMyLocation,
    getTempNewPlaceLatLng: getTempNewPlaceLatLng,
    clearTempNewPlaceLatLng: clearTempNewPlaceLatLng,
    setFilterVisibility: setFilterVisibility,
    showSearchPin: showSearchPin,
    clearSearchPin: clearSearchPin,
    searchByText: searchByText,
    geocodeText: geocodeText,
    reverseGeocode: reverseGeocode,
    panBy: panBy,
    getMap: getMap,
    getProjection: getProjection,
    _markersById: markersById
  };
})();

window.MapModule = MapModule;
window.markersById = MapModule._markersById;
