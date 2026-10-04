# 手機地圖操作修正（2026-10-04）

已親自檢視使用者提供的 iPhone 原圖。原圖只保留於私人暫存區；測試與代表畫面均使用合成資料，未將姓名、地址或原圖加入專案。

## 實際改動

- 手機頂部為品牌／帳戶與搜尋兩列；管理、使用者名稱、登出收進帳戶選單。
- 定位、規劃、篩選、名單維持 44px 觸控高度，短標籤與數量徽章避免窄螢幕換行。
- 手機進入規劃預設收合，底部狀態列顯示已選數量、展開清單與完成。
- 路線清單為有上限的底部面板，長清單內部捲動。收合與點地圖空白保留規劃模式及選點。
- 點姓名查看地圖位置；上下箭頭支援手機排序，桌機仍可拖曳。移除按鈕獨立操作。
- 退出保留路線；清空獨立確認，取消不刪除；未選地點時完成／清空不可用。
- 規劃中名單可連續加入／取消，並顯示已選狀態；搜尋既有地點也保留規劃。
- 篩選與名單在手機為有高度上限的抽屜，互斥展開，完成／關閉回到地圖。
- 支援 safe-area、橫向與 VisualViewport 鍵盤縮小可視區；不限制使用者縮放。

修改程式：`Public/app.php`、`Public/partials/navbar.php`、`Public/assets/css/service.css`、`Public/assets/js/app.js`、`Public/assets/js/filters_ui.js`。

## 測試與量測

最終手機 QA：91 項通過，無瀏覽器執行例外。代表畫面與逐項證據另存 docs/qa/mobile-map/，全部為合成資料。

使用專用 MariaDB datadir 及 `visitation_preview_synthetic`，啟動前檢查實際 datadir，服務只綁 127.0.0.1。不讀專案 `.env`，不改正式 DB。24 個合成地點與測試帳戶，不需服務金鑰。

實際安裝的 Chrome、Node 內建 WebSocket、既有 MapLibre 5.12.0 渲染器與本機合成 GeoJSON 底圖；無新套件／付費服務。測試工具改以 gzip 及分塊回應，解決本機大型 JavaScript 傳輸不完整。

390×844 直向視窗，地圖可操作高度扣除頂部控制及底部面板：

| 狀態 | 改版前 | 改版後 |
| --- | ---: | ---: |
| 頂部高度 | 145px | 107px |
| 已選 4／20 點，預設畫面 | 270px（32%） | 611px（72%，清單收合） |
| 已選 20 點，清單展開 | 270px（32%） | 約 280px（33%，內部捲動） |
| 844×390 橫向，已選 20 點收合 | — | 235px（60%） |
| 橫向清單展開 | — | 約 102px（26%，內部捲動） |

0、1、4、5、10、20 點皆驗證直向／橫向、收合保留選點及地圖面積。額外驗證觸控拖圖、查看位置、箭頭排序、移除、名單續選、清空取消／確認、退出保留、完成／重新規劃、320px 寬度、長姓名／地址、登出再登入。

最終逐項結果位於 `%TEMP%\visitation-professional-preview\mobile-verify-results.json`；改版前量測位於 `mobile-before-results.json`。同區域有 `mobile-before-*.png`、`mobile-after-*.png`，全部為合成資料。

既有 HTTP 回歸 32 項、管理／表單 UI 回歸 30 項及 auth cache 3 項已通過。撤權案例保持舊停權 session 回傳 401、降權後 admin API 回傳 403，正常使用者功能保留。PHP／JavaScript 語法與 git diff whitespace 檢查通過。

限制：未使用真實 iPhone／Safari 硬體。鍵盤測試是可視區模擬，safe-area 為 34px 模擬；不宣稱實機通過。正式底圖、GPS 定位及外部 Google 導航未測；本機 MapLibre 渲染、鏡頭聚焦與觸控平移已測。

## 本機試用與重跑

```powershell
python scripts/local_preview.py --mobile-preview --reset
```

開啟 `http://127.0.0.1:43417/login`，`admin@example.invalid`／`Preview-only-2026!`。登入後由管理頁返回地圖。

```powershell
python scripts/local_preview.py --stop
python scripts/local_preview.py --reset --verify
python scripts/local_preview.py --mobile-before --reset
python scripts/local_preview.py --mobile --reset
python scripts/verify_auth_cache.py
```

一次啟動一個預覽／測試。`--stop` 只要求此專用預覽結束，再由程式停止它啟動的 DB。QA 程式與 docs 已由既有部署工作流排除。此次改版僅完成本機版本，未推送／部署；部署由主對話協調。
