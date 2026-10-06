# 工具列修正（本機已完成三項，尚未發布）

基線 b43c5b1e782a0cc7a9e34168e133b229b51ab9f8。沒有取得或看過使用者截圖；Library 403 下載阻擋已停止重試。本批只依隔離合成資料重現證據修正，產品差異為 Public/assets/css/service.css 的 app-page 限定樣式，以及 navbar.php 三處現有文字的 title 提示。資料、角色、事件、語義、部署／安全設定均未改；不含未推送報告提交 d67855b。

## 差異與證據

- 手機 grid 第一列垂直中心對齊：320×568、390×844、568×320 中心差 10→0px；844×390、1024×768、1440×1000 維持 0px。
- 四個按鈕維持各自 44px 以上 target，背景改成內縮 5px 的 34px 高膠囊；偽元素 pointer-events:none，無相鄰矩形重疊。命中測試包含透明上緣，沒有只量視覺尺寸。
- 搜尋建議與手機帳戶選單限制可視高度、內部捲動：320×568 建議底端 630.25→550px；568×320 建議 578.25→304px、選單 380.8→303px；844×390 建議 391.13→374px。
- 桌機保留原展開式帳戶區及原 matchMedia／Escape 行為，單位／email／姓名以有限寬度 ellipsis 截斷，完整 DOM 文字供輔助技術讀取，原生 title 提示保留完整內容；手機選單仍完整換行。操作連結及登出不截斷、不換行，維持 44px 高度。合成長帳戶在 1440 寬搜尋框 80→492.98px、帳戶右端 1497.38→1420px；901、1024 寬搜尋框約217.14、256.5px。
- 桌機一般／極長合成帳戶（ADMIN／USER）12 組均維持原單列 69px，不以長名稱讓一般帳戶永久多一列。手機 toolbar 107px、橫向53px 均未增加。本輪沒有桌機 wrap 例外；901px 起套用單列截斷，900px 以下維持帳戶下拉。先前本機提交的換行版本會將一般帳戶增高，已修正且本輪 QA／圖片已更新至單列版本。

前後 PNG：基線 docs/qa/search-baseline-20261006/baseline-390x844.png；修正 docs/qa/toolbar-review-20261006/baseline-390x844.png（after 目錄中的 baseline 名稱表示初始瀏覽狀態，不代表修改前）。同目錄提供各尺寸、展開帳戶、搜尋建議與長帳戶畫面。

## QA

隔離 MariaDB 已核對 datadir，僅 loopback synthetic fixture；瀏覽器禁止所有非 loopback 請求。Chromium / Playwright 實際渲染、操作：

- 新增 geometry／命中與互動 109 項全部通過：6 viewport、44px target／34px visual、透明上緣命中、相鄰不重疊、長帳戶、捲動至最後搜尋建議並選取、帳戶 Escape 焦點返回、地圖拖動。
- 追加桌機 ADMIN／USER × 一般／極長名稱 × 901／1024／1440 寬的 12 組全部通過：69px toolbar、搜尋寬至少180px、所有操作44px且位於視窗內、帳戶文字保留完整提示及DOM，無 document overflow。QA 中 desktop-results.json、desktop.cjs 及每組 PNG 記錄結果。
- 既有視覺／資訊面板／表單 79 項全部通過。
- 既有錯誤恢復／無資料／慢回應重複儲存 24 項全部通過。
- 既有手機／路線／觸控／搜尋／筛選／桌機／登出重登入 91 項全部通過，無 runtime exception。
- git diff --check 與 navbar.php PHP syntax 通過。未重跑 HTTP 權限測試；既有角色與功能程式未動。

geometry driver 為本輪執行快照，依賴 /opt/codex/cua_node/lib/node_modules/playwright、/usr/bin/chromium、已核對隔離資料的 127.0.0.1:43417 preview，輸出 /tmp/visitation-search-after；不能對正式站執行。完整 JSON 與 driver 同 QA 目錄。

## 霧面搜尋列已完成

依使用者明確文字需求與合成頁面結構完成保守霧面效果，未再下載受阻圖片，也沒有看過使用者截圖。詳見 docs/frosted_review_20261006.md 及該次 QA；三项已在同一工作分支合併。Safari 前綴已加入，但真實 Safari／實機鍵盤未測。沒有正式登入／資料測試，沒有部署。
