# 系統管理員權限與後台重整

## 正式站啟用

本次不修改正式資料、不執行新 DDL，也不設定任何帳戶密碼。
正式 SQL 備份於 2026-10-04 03:34 的唯一匹配帳戶為：
`id=1`、`ringo_tom2007@yahoo.com.tw`、`ADMIN`、`ACTIVE`、`organization_id=6`。
此證據不是即時資料庫查詢。操作者須先由既有登入資訊或可信資料庫帳戶資料確認 ID 1 仍是本人，再於正式站私有 `.env` 新增或更新唯一一行：

```dotenv
OWNER_USER_ID=1
```

不需重新啟動；下一個請求會重新讀取設定。不要上傳或分享整份 `.env`。
FTPS 排除 `.env`，發布程式不會自動寫入此設定。
未設定時禁止帳戶角色、狀態、單位管理異動；一般地圖業務及一般使用者的單位申請仍可使用。
這避免將尚未辨識的最高帳戶交給其他 ADMIN 改動。

## 權限

OWNER 由固定 ID 推導，與可修改的 Email、單位無關，不改 USER/ADMIN enum。
OWNER 及 ADMIN 具全單位業務權限；僅 OWNER 可任免 ADMIN。
所有管理 API 保護 OWNER 的角色、狀態及單位；本人亦不能誤將自己降權或停權。
本次沒有提供 OWNER 自行改單位介面；該欄位僅為 metadata，不限制全域業務權限。
ADMIN 可審核及調整 USER 單位、啟停 USER；不能任免管理者或調整其他 ADMIN 帳戶。
行政重設密碼 API 已停用，所有帳戶自行走既有 OTP 密碼復原流程。
USER 無管理後台，個資頁僅可自行儲存姓名、Email、電話及職稱；權限、狀態、單位與目標 ID 注入一律拒絕。
待審異動不改原單位；審核與帳戶權限變更都鎖定並重新驗證操作者及目標。
每個請求重新驗證角色及狀態，撤權與停權立即作用於舊 session。

## 介面

共用分權卡片後台：帳戶與單位、單位異動待審、安全與操作紀錄；OWNER 另有管理者授權。
帳戶頁先呈現單位人數卡片，點選後才列人員，支援跨單位搜尋。
地圖帳戶選單顯示單位名稱、個資、USER 異動申請與進度，以及姓名和 Email。
保留既有手機 map-first 地圖與 `1a4e76d` 單位流程。

## 本機驗證

全部使用隔離 MariaDB datadir、虛構帳戶、loopback CGI HTTP 及本機 Chrome。
`python scripts/local_preview.py --reset --transfers`：50 項既有轉單位 HTTP、29 項三層權限 HTTP、39 項轉單位 UI。
`python scripts/local_preview.py --reset --transfers-preview --permissions-ui`：23 項桌機、390px/320px 權限與個資 UI。
`python scripts/local_preview.py --reset --mobile`：原有手機 map-first 回歸，共 91 項。
`python scripts/verify_auth_cache.py`：啟用、停權、缺失帳戶三項 session 查詢及快取驗證。
部署前執行所有 PHP 語法驗證；部署流程亦加入 PHP syntax gate。

未測範圍：正式帳戶即時 ID 確認與私有設定、真實多角色登入、正式 DB 並行寫入、真實 OTP Email、實體手機瀏覽器。
沒有使用真實帳戶操作來補足測試。
