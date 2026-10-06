# 搜尋區基線（等待使用者截圖）

基線 remote main `b43c5b1e782a0cc7a9e34168e133b229b51ab9f8`，分支 ux-search-20261006。沒有帶入純報告 d67855b；沒有修改產品程式或發布。使用者 Library 圖片下載受 403 tunnel 阻擋，沒有取得或看過該圖片；不再重試、不繞過。以下均為 Chromium 隔離合成資料，非使用者畫面／使用證據。

## 量測

| viewport | 帳戶中心比標題低 | 四按鈕高度 | 建議清單底端 |
|---|---:|---:|---:|
|320×568|10px|44px|630.25px|
|390×844|10px|44px|546.27px|
|568×320|10px|44px|578.25px|
|844×390|0px|44px|391.13px|
|1440×1000|0px|44px|502.27px|

手機 title y=6、height=24；account y=6、height=44，同列為頂端對齊而非垂直中心對齊。四按鈕相鄰 gap 手機 6px、桌機 10px，矩形命中區無重疊。窄／短畫面建議清單超出 viewport；568×320 帳戶選單底端 380.8px 也超出畫面。搜尋建議 z-index=3500、account menu=4000，但都受 toolbar=1000 的 stacking context 約束；不能只比較子層數字。

父 toolbar 為不透明白色，搜尋列 rgb(243,246,247)、opacity=1，沒有 backdrop-filter。地圖位於 toolbar 下方而非其背面；單把搜尋框變透明，只會看到父層白底。Chromium CSS.supports(backdrop-filter) 為 true；尚未測 Safari 或實際 unsupported fallback，沒有聲稱跨瀏覽器通過。

長帳戶／單位 DOM 合成情境：320／568 寬選單仍留右側 12px；1440 寬搜尋框縮至 80px，帳戶內容右端 1497.38px 超出 viewport（document scrollWidth 指標仍 false，不能以此宣稱未被裁切）。

## 最小改法（未實作）

1. 手機 grid 第一列 align-items:center／兩側 align-self:center，保持帳戶 44px 命中高度；驗證不改變 toolbar-h 的既有計算。
2. 四按鈕保留各自獨立 44px hitbox，用內縮的背景／border 視覺層呈現約 32–34px 膠囊，字體至少維持現有 13–14px，hitbox 不加外擴。不能直接縮成 32px 按鈕或讓偽元素接收事件。
3. 優先局部半透明背景、完整不透明文字，@supports 下增加 backdrop-filter 及 -webkit-backdrop-filter，預設提供不透明 fallback。要達到看見地圖的效果需處理父白底／地圖覆蓋範圍，待圖片確認後選最小方案，避免大改 toolbar 佈局。
4. 同批防止搜尋建議／帳戶選單超出可視高度，採 max-height 與內部捲動，長帳戶換行或合理收合，驗證焦點、搜尋選取、地圖拖動與面板互動。

原始 geometry JSON、重跑腳本與合成基線 PNG 位於 docs/qa/search-baseline-20261006。沒有 before/after 修正比較，沒有宣稱完成本輪修正。
