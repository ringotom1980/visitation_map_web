// Public/assets/js/map.js

// MapModule：專責管理 Google Map / 標記 / 搜尋 / 規劃模式
const MapModule = (function () {
  let map;
  let autocomplete;

  // id -> google.maps.Marker
  const markers = new Map();

  // 狀態
  let routeMode = false;
  let tempNewPlaceLatLng = null;

  function init(options) {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = new google.maps.Map(mapEl, {
      center: { lat: 23.7, lng: 120.9 }, // Taiwan center
      zoom: 7,
      // 手機/桌機操作行為盡量貼近 Google Map
      gestureHandling: 'greedy',
      scrollwheel: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    setupAutocomplete(options?.onSearchPlaceSelected);
    setupMapHandlers(options);
  }

  function setupAutocomplete(onPlaceSelected) {
    const input = document.getElementById('map-search-input');
    if (!input) return;

    // 先暫時維持舊版 Autocomplete（只是警告，不影響功能）
    autocomplete = new google.maps.places.Autocomplete(input, {
      fields: ['geometry', 'formatted_address', 'name'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.geometry || !place.geometry.location) return;

      map.panTo(place.geometry.location);
      map.setZoom(16);

      if (typeof onPlaceSelected === 'function') {
        onPlaceSelected(place);
      }
    });
  }

  function setupMapHandlers(options) {
    // 一般點擊目前沒有特別行為（之後可用來關閉資訊卡）
    map.addListener('click', () => {
      // if (routeMode) return;
    });

    // ★ 長按（手機）或右鍵（桌機）＝ 新增標記
    map.addListener('rightclick', (evt) => {
      tempNewPlaceLatLng = evt.latLng;

      if (typeof options?.onLongPressForNewPlace === 'function') {
        options.onLongPressForNewPlace(evt.latLng);
      }
    });
  }

  function enableRouteMode(enabled) {
    routeMode = enabled;
  }

  function getTempNewPlaceLatLng() {
    return tempNewPlaceLatLng;
  }

  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    // 清掉舊的
    markers.forEach((m) => m.setMap(null));
    markers.clear();

    placeList.forEach((p) => {
      const lat = parseFloat(p.lat);
      const lng = parseFloat(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const labelText = (p.soldier_name || '').toString().slice(0, 8);

      const marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: p.soldier_name || '',
        icon: chooseMarkerIcon(p),
        // 用文字 label 取代你剛剛看到的那種「框＋X」
        label: labelText
          ? {
              text: labelText,
              color: '#1b5e20',
              fontSize: '11px',
              fontWeight: '700',
            }
          : undefined,
      });

      marker.addListener('click', () => {
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
      strokeWeight: 2,
    };
  }

  function focusPlace(place) {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const pos = { lat, lng };
    if (!map) return;

    map.panTo(pos);
    map.setZoom(16);

    const m = markers.get(place.id);
    if (m) {
      m.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(() => m.setAnimation(null), 700);
    }
  }

  function buildDirectionsUrl(routePlaces) {
    if (!routePlaces || routePlaces.length < 2) return null;

    const origin = `${routePlaces[0].lat},${routePlaces[0].lng}`;
    const destination =
      `${routePlaces[routePlaces.length - 1].lat},` +
      `${routePlaces[routePlaces.length - 1].lng}`;
    const waypoints = routePlaces
      .slice(1, -1)
      .map((p) => `${p.lat},${p.lng}`)
      .join('|');

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(destination)}`;

    if (waypoints) {
      url += `&waypoints=${encodeURIComponent(waypoints)}`;
    }
    url += '&travelmode=driving';

    return url;
  }

  function panTo(latLng, zoom) {
    if (!map) return;
    map.panTo(latLng);
    if (zoom) {
      map.setZoom(zoom);
    }
  }

  return {
    init,
    setPlaces,
    focusPlace,
    enableRouteMode,
    getTempNewPlaceLatLng,
    buildDirectionsUrl,
    panTo,
  };
})();

window.MapController = MapModule;
