// Public/assets/js/map.js

// MapModule：專責管理 Google Map / 標記 / 搜尋 / 規劃模式
const MapModule = (function () {
  let map;
  let autocomplete;

  // id -> google.maps.Marker
  const markers = new Map();

  // 狀態
  let routeMode = false;
  let addPlaceMode = false;
  let tempNewPlaceLatLng = null;

  function init(options) {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = new google.maps.Map(mapEl, {
      center: { lat: 23.7, lng: 120.9 }, // Taiwan center
      zoom: 7,

      // ======= 重要修正 =======
      gestureHandling: 'greedy',    // 手機可單指拖曳，雙指縮放
      scrollwheel: true,            // 桌機滑鼠滾輪可直接縮放
      // =========================

      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    setupAutocomplete(options?.onSearchPlaceSelected);
    setupMapClickHandlers(options);
  }

  function setupAutocomplete(onPlaceSelected) {
    const input = document.getElementById('map-search-input');
    if (!input) return;

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

  function setupMapClickHandlers(options) {
    map.addListener('click', (evt) => {
      // 新增模式
      if (addPlaceMode) {
        tempNewPlaceLatLng = evt.latLng;

        if (typeof options?.onMapClickForNewPlace === 'function') {
          options.onMapClickForNewPlace(evt.latLng);
        }

        // 新增後不自動關閉，讓使用者點錯可以再選
        // 若你要一次後關閉，把下一行打開
        // addPlaceMode = false;

        return;
      }

      // 路線規劃模式：點地圖本身不做事
      if (routeMode) return;
    });
  }

  function enableRouteMode(enabled) {
    routeMode = enabled;
  }

  function enableAddPlaceMode() {
    addPlaceMode = true;
    tempNewPlaceLatLng = null;
  }

  function getTempNewPlaceLatLng() {
    return tempNewPlaceLatLng;
  }

  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    markers.forEach((m) => m.setMap(null));
    markers.clear();

    placeList.forEach((p) => {
      const lat = parseFloat(p.lat);
      const lng = parseFloat(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: p.soldier_name || '',
        icon: chooseMarkerIcon(p),
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
      `${routePlaces[routePlaces.length - 1].lat},${routePlaces[routePlaces.length - 1].lng}`;
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

  return {
    init,
    setPlaces,
    focusPlace,
    enableRouteMode,
    enableAddPlaceMode,
    getTempNewPlaceLatLng,
    buildDirectionsUrl,
  };
})();
