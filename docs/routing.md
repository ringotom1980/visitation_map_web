# 道路路線規劃

## 目前決策

第一階段只在系統內畫出「道路路線」，正式導航仍保留外開 Google Maps。

使用供應商：

- openrouteservice Directions API
- profile: `driving-car`

## 官方免費額度與限制

openrouteservice Standard 免費方案目前 Directions 額度為：

- 2,000 requests / day
- 40 requests / minute

Directions backend 另有限制：

- Route waypoints 最多 50 個

系統預設本機防呆上限為 1,900 requests/day，保留 100 次緩衝，避免撞到官方上限。

## `.env` 設定

```env
ROUTING_PROVIDER="openrouteservice"
OPENROUTESERVICE_API_KEY="your_openrouteservice_api_key"
ROUTING_DAILY_LIMIT=1900
```

若達到本機每日上限，後端會回傳：

```text
今日免費額度已用完
```

前端會提示使用者建議直接用 Google 導航。

## DB 計數表

`/api/routing/route` 第一次使用時會自動建立：

```sql
routing_usage_daily
```

用來記錄每日 openrouteservice request 次數。
