# 工具列修正（尚未發布，透明效果待圖）

基線 b43c5b1e782a0cc7a9e34168e133b229b51ab9f8。沒有取得或看過使用者截圖；Library 403 下載阻擋已停止重試。本批只依隔離合成資料重現證據修正，產品差異僅 Public/assets/css/service.css，全部限定 app-page。資料、角色、事件、語義、部署／安全設定均未改；不含未推送報告提交 d67855b。

## 差異與證據

- 手機 grid 第一列垂直中心對齊：320×568、390×844、568×320 中心差 10→0px；844×390、1024×768、1440×1000 維持 0px。
- 四個按鈕維持各自 44px 以上 target，背景改成內縮 5px 的 34px 高膠囊；偽元素 pointer-events:none，無相鄰矩形重疊。命中測試包含透明上緣，沒有只量視覺尺寸。
- 搜尋建議與手機帳戶選單限制可視高度、內部捲動：320×568 建議底端 630.25→550px；568×320 建議 578.25→304px、選單 380.8→303px；844×390 建議 391.13→374px。
- 桌機保留原展開式帳戶區及原 matchMedia／Escape 行為，限制帳戶寬度並允許文字／項目換行。合成長帳戶在 1440 寬搜尋框 80→520px、帳戶右端 1497.38→1420px。1024 寬一般帳戶搜尋框約 307.88px。
- 桌機帳戶換行取捨：1440×1000 一般合成帳戶 toolbar 69→117px，1024×768 為165px；不遮住地圖而是正常分配較多高度。手機 toolbar 107px、橫向53px 均未增加，既有 toolbar-h 量測及面板界限隨之更新。桌機既有地圖／路線回歸通過，但長資料會使用較多工具列高度。

前後 PNG：基線 docs/qa/search-baseline-20261006/baseline-390x844.png；修正 docs/qa/toolbar-review-20261006/baseline-390x844.png（after 目錄中的 baseline 名稱表示初始瀏覽狀態，不代表修改前）。同目錄提供各尺寸、展開帳戶、搜尋建議與長帳戶畫面。

## QA

隔離 MariaDB 已核對 datadir，僅 loopback synthetic fixture；瀏覽器禁止所有非 loopback 請求。Chromium / Playwright 實際渲染、操作：

- 新增 geometry／命中與互動 109 項全部通過：6 viewport、44px target／34px visual、透明上緣命中、相鄰不重疊、長帳戶、捲動至最後搜尋建議並選取、帳戶 Escape 焦點返回、地圖拖動。
- 既有視覺／資訊面板／表單 79 項全部通過。
- 既有錯誤恢復／無資料／慢回應重複儲存 24 項全部通過。
- 既有手機／路線／觸控／搜尋／筛選／桌機／登出重登入 91 項全部通過，無 runtime exception。
- git diff --check 通過。只變 CSS，未重跑 PHP／HTTP 權限測試；既有角色與功能程式未動。

geometry driver 為本輪執行快照，依賴 /opt/codex/cua_node/lib/node_modules/playwright、/usr/bin/chromium、已核對隔離資料的 127.0.0.1:43417 preview，輸出 /tmp/visitation-search-after；不能對正式站執行。完整 JSON 與 driver 同 QA 目錄。

## 未完成

搜尋透明／霧面外觀仍未實作，等待可讀使用者截圖確認。父工具列目前不透明白底，單改子框無法看到地圖；不應以 opacity 淡化整個子樹。後續方案應有不透明預設，@supports 下加入 backdrop-filter／-webkit-backdrop-filter，並核對明暗／複雜底色對比。沒有聲稱已通過 Safari、真實裝置鍵盤或 unsupported fallback 渲染；沒有正式登入／資料測試。沒有部署。
