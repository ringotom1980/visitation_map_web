# 搜尋列霧面與三項 UI 合併交付（本機，未發布）

遠端 main 重新 fetch 仍為 b43c5b1e782a0cc7a9e34168e133b229b51ab9f8；同一 ux-search-20261006 分支保留 fe5a2b6（對齊／扁膠囊）與473ade7（桌機69px），沒有混入純報告d67855b。沒有讀過使用者 Library 圖片，403 阻擋不再重試、不繞過；本輪以明確文字需求及已重現合成頁面完成，並非像素對照。

## 實作

新增產品差異僅 service.css 21行，限定 app-page。保留原實色 toolbar／search 作預設；@supports backdrop-filter 或 -webkit-backdrop-filter 的分支才採工具列白色80%＋10px blur、搜尋框既有淡色78%＋8px blur。搜尋框原主配色、尺寸及字體保留，文字/placeholder使用不透明深色。沒有使用祖先／整個子樹 opacity。

為避免半透明只能看見父白底，在同一支持分支讓地圖頂端延伸 toolbar-h、等量增高，app-main 解除對此上緣的裁切。toolbar 正常佔位與69px/107px/53px高度、面板定位以及狀態提示的原參考容器均不變；只讓地圖繪製在工具列背面。沒有新增圖片、第三方依賴、遙測、角色／資料流程或部署／安全設定。

不支持模糊時不執行上緣延伸，保持原實色背景與原地圖起點。搜尋建議、手機帳戶選單仍不透明白色，沒有因半透明而混入底圖。WebKit前綴涵蓋較早Safari的CSS支援；尚未使用真實Safari驗證，不能宣稱Safari已通過。

## 合成 QA

全部使用已驗證 datadir 的 loopback MariaDB fixture，瀏覽器阻擋非loopback請求；明亮／全黑／高對比複雜街道底圖均由原本地MapLibre圖層的paint修改產生，未使用定位或正式資料。

- 霧面＋模擬無模糊支援：84項全部通過。390×844、1440×1000，各3底圖＋2分支，確認完整不透明文字、高度不變、正確地圖起點、選單／建議可讀及選取。unsupported以測試攔截service.css將該@supports條件換成不存在屬性，實际驗證原有預設CSS，不是另加fallback override。
- 文字對比使用RGBA逐層合成、以純黑底計算保守下界：輸入、placeholder、標題、帳戶均≥4.5:1，最低4.77:1；不是把半透明背景誤當白色。明暗／複雜底圖畫面另已輸出、檢視。模糊本身不計入提高對比。
- 霧面／fallback下的模擬觸控與鍵盤12項全部通過：透明上緣44px命中、名單開關、帳戶Escape焦點返回、ArrowDown/Enter選取搜尋建議、資訊關閉。
- 重跑幾何109項、桌機ADMIN/USER／一般/長名稱12組、視覺79、恢復24、手機/路線91、權限UI23、移轉UI39、HTTP32+50+29=111、整站smoke37、auth-cache3項，全部通過；55檔PHP語法與git diff --check通過。

追加觸控測試第一次仍預期24個marker，當時整站fixture已重置為2個合成點而逾時；改為檢查已載入marker與相符合成搜尋字後，兩個分支12項通過。未為此改產品碼。

原HTTP測試及auth-cache寫死WindowsPHP路徑；只在/tmp測試副本替換成既有雲端PHP與session目錄後執行，產品／repo測試腳本未因此改寫。第一次執行遇環境路徑或session目錄錯誤，修正測試環境後重跑通過。fixture重置、既有移轉schema只作用於核對過的合成資料庫，沒有正式migration或寫入。

QA JSON／執行快照／PNG：docs/qa/frosted-review-20261006。修改前對照為docs/qa/search-baseline-20261006；前两項中間版本證據在toolbar-review，最新霧面版本結果以frosted-review為準。測試快照固定localhost與暫存輸出，不得对正式站執行。

## 限制與發布

真實Safari／iOS鍵盤、Google Maps外部provider分支、正式帳戶／OTP、GPS／外部導航未測；所有觀察為合成測試，沒有真實使用證據或持续監測。CSS新增模糊可能增加較舊裝置繪圖成本，無模糊支援走原實色分支，但尚無實機效能資料。沒有部署、沒有推送；父依授權协调同批發布與正式資產核對。
