# 地圖供應商切換

## 目前決策

- QR Code 登入不再納入需求。
- 主地圖預設改用 `MapLibre GL JS + MapTiler`。
- Google Maps 模組保留為備援，不先刪除。
- 地址搜尋與長按反查地址使用 MapTiler Geocoding API。
- 路線完成後仍外開 Google Maps directions URL，讓使用者用熟悉的 Google 地圖導航。

## `.env` 設定

```env
MAP_PROVIDER="maplibre"
MAPTILER_API_KEY="your_maptiler_api_key"
MAPTILER_STYLE_URL=""
```

`MAPTILER_STYLE_URL` 可留空，系統會自動使用：

```text
https://api.maptiler.com/maps/streets-v2/style.json?key=MAPTILER_API_KEY
```

若要切回 Google Maps：

```env
MAP_PROVIDER="google"
GOOGLE_MAPS_API_KEY="your_google_maps_api_key"
```

## MapTiler key 保護

MapTiler production key 應設定 Allowed HTTP Origins，例如：

```text
ml.jinghong.pw
```

不要填 `https://`，也不要加結尾 `/`。
