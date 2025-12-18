// Path: Public/assets/js/map.js
// 說明: Google 地圖模組 — 標註顯示/隱藏策略（S1/S2/S3）、長按新增（僅 S1）、目前位置、路線線條（polyline 簡版）
//      ★補齊 tempNewPlaceLatLng 暫存 + getter，供 app.js 新增/編輯存檔使用
//      ★本版重點：為了同時顯示「點內數字」+「旁邊姓名」，姓名改用 OverlayView；Marker label 專注顯示數字

var MapModule = (function () {
  var map;
  var autocomplete;
  var geocoder;
  var initOptions = {};

  // id -> { marker: google.maps.Marker, nameOv: NameLabelOverlay, data: place }
  var markersById = new Map();
  var searchPinMarker = null;
  var searchPinLatLng = null;

  // 目前位置 marker
  var myLocationMarker = null;
  var myLocationOverlay = null;

  // 路線 polyline（簡版：依 routePoints 順序連線）
  var routeLine = null;

  // 狀態（由 app.js 設定）
  var mode = 'BROWSE';
  var currentRoutePoints = [];

  // places 快取
  var placesCache = [];
  // ===== 篩選狀態（由 filters.js 設定）=====
  // null => 不啟用篩選（全部視為可見）
  var filterVisibleIdSet = null; // Set(placeId)
  var filterRouteKeepIdSet = new Set(); // 路線點永遠顯示（即使不符合篩選）


  // ★暫存「長按新增」的點位（提供 app.js 取用）
  var tempNewPlaceLatLng = null;
  // ★Projection Helper：提供 containerPixel <-> LatLng 精準轉換
  var projHelper = null;

  function ensureProjectionHelper() {
    if (projHelper) return;
    function PH() { this.setMap(map); }
    PH.prototype = new google.maps.OverlayView();
    PH.prototype.onAdd = function () { };
    PH.prototype.draw = function () { };
    PH.prototype.onRemove = function () { };
    projHelper = new PH();
  }

  function containerPixelToLatLng(clientX, clientY) {
    if (!projHelper) return null;
    var proj = projHelper.getProjection();
    if (!proj) return null;

    var rect = map.getDiv().getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;

    return proj.fromContainerPixelToLatLng(new google.maps.Point(x, y));
  }

  function latLngToContainerPixel(latLng) {
    if (!projHelper || !latLng) return null;
    var proj = projHelper.getProjection();
    if (!proj) return null;
    return proj.fromLatLngToContainerPixel(latLng);
  }

  function distPx(p1, p2) {
    if (!p1 || !p2) return Infinity;
    var dx = p1.x - p2.x;
    var dy = p1.y - p2.y;
    return Math.hypot(dx, dy);
  }

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
    // ✅ 一定要用 floatPane，保證在 marker/label 上面
    panes.floatPane.appendChild(div);

    // ✅ 保底：再拉高一點，避免被其他 overlay 壓
    div.style.zIndex = '99999';

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
    initOptions = options || {};   // ★★★ 這一行一定要有
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
    // ★新增：建立投影工具（用來精準換算座標）
    ensureProjectionHelper();
    setupLongPressDetector();
    setupAutocomplete(initOptions.onSearchPlaceSelected);
    setupMapClickHandlers(initOptions);
  }

  /* ---------- 對外：切換模式 + 顯示策略 ---------- */
  function setMode(nextMode, routePoints) {
    mode = nextMode || 'BROWSE';
    currentRoutePoints = Array.isArray(routePoints) ? routePoints : [];

    // 1) Marker 顯示策略
    applyMarkersByMode(currentRoutePoints);

    // 2) 路線顯示策略：僅 S3 顯示線條
    if (mode === 'ROUTE_READY') {
      drawRouteLine(currentRoutePoints);
    } else {
      clearRouteLine();
    }
  }
  // ===== 長按新增（0.6s 到就立刻觸發）=====
  var LONG_PRESS_MS = 600;
  var longPressTimer = null;
  var longPressFired = false;
  var downPoint = null;
  var activePointers = new Set();   // 追蹤目前有幾根手指

  function setupLongPressDetector() {
    if (!map) return;
    var mapDiv = map.getDiv();

    mapDiv.addEventListener('pointerdown', function (e) {
      if (mode !== 'BROWSE') return;

      // ★紀錄目前活躍的 pointer（手指）
      activePointers.add(e.pointerId);

      // ❌ 只允許「單指」
      if (activePointers.size !== 1) {
        clearLongPress();
        return;
      }

      longPressFired = false;
      downPoint = { x: e.clientX, y: e.clientY };

      longPressTimer = setTimeout(function () {
        // ★再次確認仍然只有一指
        if (activePointers.size !== 1) return;

        longPressFired = true;

        // ✅ 正確：用 Projection 做精準換算
        var latLng = containerPixelToLatLng(e.clientX, e.clientY);
        if (!latLng) return;

        // ✅ 需求：長按「搜尋 Pin」要精準落在 Pin 上（snap）
        // 只要手指壓的位置離 pin 像素點夠近，就直接用 searchPinLatLng
        if (searchPinLatLng) {
          var pressPx = latLngToContainerPixel(latLng);
          var pinPx = latLngToContainerPixel(searchPinLatLng);

          // 半徑可調：24~32 都合理（手指粗度）
          if (distPx(pressPx, pinPx) <= 26) {
            latLng = searchPinLatLng;
          }
        }

        tempNewPlaceLatLng = latLng;

        if (geocoder) {
          geocoder.geocode({ location: latLng }, function (results, status) {
            var addr = '';
            if (status === 'OK' && results && results[0]) {
              addr = results[0].formatted_address || '';
            }
            if (initOptions && typeof initOptions.onMapLongPressForNewPlace === 'function') {
              initOptions.onMapLongPressForNewPlace(latLng, addr);
            }
          });
        } else {
          if (initOptions && typeof initOptions.onMapLongPressForNewPlace === 'function') {
            initOptions.onMapLongPressForNewPlace(latLng, '');
          }
        }
      }, LONG_PRESS_MS);
    });

    mapDiv.addEventListener('pointermove', function (e) {
      if (!downPoint || longPressFired) return;

      // ★一旦變成多指，直接取消
      if (activePointers.size !== 1) {
        clearLongPress();
        return;
      }

      var dx = e.clientX - downPoint.x;
      var dy = e.clientY - downPoint.y;
      if (Math.hypot(dx, dy) > 8) {
        clearLongPress();
      }
    });

    mapDiv.addEventListener('pointerup', function (e) {
      activePointers.delete(e.pointerId);
      clearLongPress();
    });

    mapDiv.addEventListener('pointercancel', function (e) {
      activePointers.delete(e.pointerId);
      clearLongPress();
    });
  }

  function clearLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    downPoint = null;
  }

  // ====== 搜尋後 Pin：顯示 / 清除 ======
  function showSearchPin(latLng) {
    if (!map || !latLng) return;

    searchPinLatLng = latLng;

    if (!searchPinMarker) {
      // 不指定 icon => Google 預設紅色大頭針
      searchPinMarker = new google.maps.Marker({
        map: map,
        position: latLng,
        clickable: true,
        zIndex: 9999
      });
    } else {
      searchPinMarker.setPosition(latLng);
      searchPinMarker.setMap(map);
    }
  }

  function clearSearchPin() {
    searchPinLatLng = null;
    if (searchPinMarker) {
      searchPinMarker.setMap(null);
    }
  }

  // ====== 允許「沒選到下拉選項」也能按放大鏡搜尋：用 Geocoder 找最近結果 ======
  function searchByText(query, cb) {
    if (!geocoder || !map) {
      if (typeof cb === 'function') cb(new Error('geocoder/map not ready'));
      return;
    }

    var q = (query || '').toString().trim();
    if (!q) {
      if (typeof cb === 'function') cb(new Error('empty query'));
      return;
    }

    // 用目前視窗 bounds 當作偏好範圍（符合你說的「查不到精準就以附近為主」）
    var req = { address: q };
    var b = map.getBounds();
    if (b) req.bounds = b;

    geocoder.geocode(req, function (results, status) {
      if (status !== 'OK' || !results || !results[0] || !results[0].geometry) {
        if (typeof cb === 'function') cb(new Error('not found'));
        return;
      }

      var loc = results[0].geometry.location;
      map.panTo(loc);
      map.setZoom(16);
      showSearchPin(loc);

      if (typeof cb === 'function') {
        cb(null, {
          formatted_address: results[0].formatted_address || q,
          location: loc,
          raw: results[0]
        });
      }
    });
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
      var loc = place.geometry.location;
      map.panTo(loc);
      map.setZoom(16);
      showSearchPin(loc);

      if (typeof onPlaceSelected === 'function') {
        onPlaceSelected(place);
      }
    });
  }

  /* ---------- 地圖點擊（長按新增：僅 S1） ---------- */
  function setupMapClickHandlers(options) {
    map.addListener('click', function (evt) {

      if (evt && evt.placeId) {
        evt.stop();

        if (mode === 'BROWSE') {
          var service = new google.maps.places.PlacesService(map);
          service.getDetails(
            {
              placeId: evt.placeId,
              fields: ['name', 'formatted_address', 'geometry', 'photos']
            },
            function (place, status) {
              if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return;

              document.dispatchEvent(new CustomEvent('map:poiClick', {
                detail: place   // ★重點：直接丟完整 place
              }));
            }
          );
        }

        return;
      }

      // === B) 點地圖空白 ===
      // S2：路線規劃模式下，點地圖空白 → 離開規劃（維持你原本規格）
      if (mode === 'ROUTE_PLANNING') {
        document.dispatchEvent(new CustomEvent('map:blankClick'));
        return;
      }

      // 規格確認：
      // - S1（BROWSE）：點地圖空白「不做任何事」（新增只靠長按）
      // - S3（ROUTE_READY）：點地圖空白不做事
      //（是否關閉任何資訊抽屜，交給 app.js 依 UX 規格統一處理）
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

    var pos = new google.maps.LatLng(lat, lng);

    // 先清掉舊的 marker（如果你之前用 marker）
    if (myLocationMarker) {
      myLocationMarker.setMap(null);
      myLocationMarker = null;
    }

    // 清掉舊 overlay
    if (myLocationOverlay) {
      myLocationOverlay.setMap(null);
      myLocationOverlay = null;
    }

    // Overlay：Google-like pulsing dot
    function MyLocationOverlay(position) {
      this.position = position;
      this.div = null;
      this.setMap(map);
    }
    MyLocationOverlay.prototype = new google.maps.OverlayView();

    MyLocationOverlay.prototype.onAdd = function () {
      var div = document.createElement('div');
      div.className = 'my-location-dot';

      var img = document.createElement('img');
      img.className = 'my-location-dot__logo';
      img.alt = 'ROC';
      img.src = '/assets/img/roc_logo.png';   // 先寫死最穩

      div.appendChild(img);

      this.div = div;
      var panes = this.getPanes();
      panes.overlayMouseTarget.appendChild(div);
    };


    MyLocationOverlay.prototype.draw = function () {
      if (!this.div) return;
      var proj = this.getProjection();
      if (!proj) return;

      var point = proj.fromLatLngToDivPixel(this.position);
      if (!point) return;

      this.div.style.left = point.x + 'px';
      this.div.style.top = point.y + 'px';
      this.div.style.transform = 'translate(-50%, -50%)';

    };

    MyLocationOverlay.prototype.onRemove = function () {
      if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    };

    MyLocationOverlay.prototype.setPosition = function (position) {
      this.position = position;
      this.draw();
    };

    myLocationOverlay = new MyLocationOverlay(pos);

    // map.panTo({ lat: lat, lng: lng });
    // map.setZoom(15);
  }

  /* ---------- 載入標記 ---------- */
  function setPlaces(placeList, onMarkerClick, onMarkerRouteSelect) {
    // 清舊 marker/overlay
    markersById.forEach(function (obj) {
      if (obj && obj.marker) obj.marker.setMap(null);
      if (obj && obj.nameOv) obj.nameOv.setMap(null);
    });
    markersById.clear();

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

      markersById.set(p.id, { marker: marker, nameOv: nameOv, data: p });
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

  function setObjDimmed(obj, dim) {
    if (!obj) return;

    // marker 本體
    if (obj.marker) {
      obj.marker.setOpacity(dim ? 0.35 : 1);
    }

    // overlay 文字
    if (obj.nameOv && obj.nameOv.div) {
      obj.nameOv.div.style.opacity = dim ? '0.45' : '1';
    } else if (obj.nameOv) {
      // div 還沒 ready 時，等 draw 後自然會套不到；不影響功能
    }
  }

  function isIdVisibleByFilter(id) {
    if (!filterVisibleIdSet) return true;
    return filterVisibleIdSet.has(id);
  }

  /* ---------- 依模式調整標註顯示 ---------- */
  function applyMarkersByMode(routePoints) {
    // 先全部隱藏 + 清淡化
    markersById.forEach(function (obj) {
      if (!obj || !obj.marker) return;
      obj.marker.setVisible(false);
      obj.marker.setLabel(null);
      if (obj.nameOv) obj.nameOv.setVisible(false);
      setObjDimmed(obj, false);
    });

    // routeIdSet：優先用「當前 routePoints」；若呼叫端沒傳，fallback 用「filterRouteKeepIdSet」
    var routeIdSet = new Set();

    if (Array.isArray(routePoints) && routePoints.length > 0) {
      routePoints.forEach(function (p) {
        if (!p || p.id === null || p.id === undefined || p.id === '__me') return;
        routeIdSet.add(Number(p.id));
      });
    } else if (typeof filterRouteKeepIdSet !== 'undefined' && filterRouteKeepIdSet) {
      // ✅ 這個 set 由 setFilterVisibility(visibleIds, routeKeepIds) 設定
      filterRouteKeepIdSet.forEach(function (id) {
        routeIdSet.add(Number(id));
      });
    }

    // 決定某個 id 在當前 mode 下是否應顯示（先看 mode 規則，再看 filter 規則）
    function shouldShow(id) {
      id = Number(id);

      // S3：只顯示路線點
      if (mode === 'ROUTE_READY') return routeIdSet.has(id);

      // S1/S2：篩選未啟用（null）→ 全顯示
      if (filterVisibleIdSet === null) return true;

      // ✅ 篩選啟用時：符合篩選 => 顯示
      if (filterVisibleIdSet.has(id)) return true;

      // ✅ 不符合篩選：若是路線點 => 仍顯示（但要淡化）
      if (routeIdSet.has(id)) return true;

      // 其餘 => 隱藏
      return false;
    }

    function shouldDim(id) {
      id = Number(id);

      // 只有在篩選啟用，且該點不符合篩選，但又因為路線保留而顯示時，才淡化
      if (filterVisibleIdSet === null) return false;
      if (filterVisibleIdSet.has(id)) return false;
      return routeIdSet.has(id);
    }

    if (mode === 'BROWSE') {
      markersById.forEach(function (obj, id) {
        id = Number(id);
        if (!shouldShow(id)) return;

        obj.marker.setVisible(true);
        if (obj.nameOv) obj.nameOv.setVisible(true);

        // 路線點標記
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

        setObjDimmed(obj, shouldDim(id));
      });
      return;
    }

    if (mode === 'ROUTE_PLANNING') {
      markersById.forEach(function (obj, id2) {
        id2 = Number(id2);
        if (!shouldShow(id2)) return;

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

        setObjDimmed(obj, shouldDim(id2));
      });
      return;
    }

    if (mode === 'ROUTE_READY') {
      markersById.forEach(function (obj3, id3) {
        id3 = Number(id3);
        if (!shouldShow(id3)) return; // 只會顯示路線點

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

        // S3 仍允許「不符篩選而淡化」（但不會隱藏路線點）
        setObjDimmed(obj3, shouldDim(id3));
      });
      return;
    }
  }

  // ✅ 路線編號：只對「拜訪點」編號（排除 __me 起點）
  function routeOrderNumber(routePoints, id) {
    if (!Array.isArray(routePoints)) return 0;

    // 統一型別：__me 保留字串，其它一律轉數字比對
    var targetId = (id === '__me') ? '__me' : Number(id);

    var n = 0;
    for (var i = 0; i < routePoints.length; i++) {
      var p = routePoints[i];
      if (!p || p.id === '__me' || p.id === null || p.id === undefined) continue;

      var pid = (p.id === '__me') ? '__me' : Number(p.id);
      if (!isFinite(pid)) continue; // 防呆：非數字 id 直接略過

      n++;
      if (pid === targetId) return n;
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

    var obj = markersById.get(place.id);
    if (obj && obj.marker) {
      obj.marker.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(function () { obj.marker.setAnimation(null); }, 700);
    }
  }

  function panToLatLng(lat, lng, zoom) {
    if (!map) return;
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return;

    map.panTo({ lat: lat, lng: lng });
    if (zoom !== undefined && zoom !== null && isFinite(Number(zoom))) {
      map.setZoom(Number(zoom));
    }
  }

  function panBy(dx, dy) {
    if (!map) return;
    map.panBy(Number(dx) || 0, Number(dy) || 0);
  }

  function getMap() {
    return map || null;
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

  function setFilterVisibility(visibleIds, routeKeepIds) {
    if (visibleIds === null) {
      filterVisibleIdSet = null;
    } else {
      filterVisibleIdSet = new Set((visibleIds || []).map(function (x) {
        return Number(x);
      }));
    }

    filterRouteKeepIdSet = new Set((routeKeepIds || []).map(function (x) {
      return Number(x);
    }));

    // ✅ 只重畫顯示/淡化，不碰路線順序
    applyMarkersByMode(currentRoutePoints);
  }

  return {
    init: init,
    setPlaces: setPlaces,
    setMode: setMode,
    focusPlace: focusPlace,
    panToLatLng: panToLatLng,
    buildDirectionsUrl: buildDirectionsUrl,
    showMyLocation: showMyLocation,
    getTempNewPlaceLatLng: getTempNewPlaceLatLng,
    clearTempNewPlaceLatLng: clearTempNewPlaceLatLng,
    setFilterVisibility: setFilterVisibility,
    // ★搜尋列用
    showSearchPin: showSearchPin,
    clearSearchPin: clearSearchPin,
    searchByText: searchByText,
    panBy: panBy,
    getMap: getMap,
    _markersById: markersById,
  };
})();

window.MapModule = MapModule;
window.markersById = MapModule._markersById;
