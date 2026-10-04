# 遺眷親訪地圖介面與權限改版

本次保留 PHP、原生 JavaScript、既有地圖與親訪資料模型，沒有新增套件、正式資料庫遷移或外部服務。

## 修改重點

- `config/auth.php`：session 只保留登入識別；每次請求以資料庫最新 ACTIVE 狀態與角色授權。停權、刪除帳戶會清除 session；降權立即失去下一次管理請求權限。同次請求含查無資料時最多查一次。
- 管理總覽：清楚的有效帳戶／地點／道路路線額度、帳戶搜尋與角色／狀態組合篩選、資料筆數、錯誤重試、具名確認與變更結果。本人降權／停權操作維持既有禁止規則。
- 手機帳戶改為卡片，保留桌機表格；共用行政服務配色、對比、44px 主要操作、焦點樣式與瀏覽器縮放。安全中心沿用原有頁籤與事件查詢。
- 登入、帳戶變更、親訪儲存與刪除防重複提交；表單取消／Escape／焦點控制；登出失敗保持可重試狀態。
- 地圖供應商載入失敗時顯示提示，保留身分、名單與既有地點編輯，不再讓整個介面停止初始化。
- 登入表單明確 POST 且 JavaScript 初始化完成後才啟用，防止尚未初始化時的原生 GET 提交。

## 本機試用

在專案根目錄執行：

```powershell
python scripts/local_preview.py --reset
```

開啟 `http://127.0.0.1:43417/login`；合成管理者 `admin@example.invalid`、密碼 `Preview-only-2026!`，一般帳戶 `user@example.invalid` 使用相同示範密碼。Ctrl+C 僅停止本任務服務。

僅使用 `%TEMP%\visitation-professional-preview` 專用 MariaDB 資料目錄，啟動後先驗證 `@@datadir`，才建立 `visitation_preview_synthetic`。所有服務只綁 loopback。原專案 `.env` 不會複製或讀取；Email mail() 停用、OTP 停用，沒有正式地圖 API key。`--reset` 只重建驗證過的合成資料；省略時保留本機示範資料。

預覽使用既有 `C:\xampp\php\php-cgi.exe`、MariaDB 12.0 與 Python 標準函式庫；沒有安裝新軟體。Windows PHP 開發伺服器的 idle socket 會間歇阻塞，因此測試入口用 Python HTTP server 逐請求執行 PHP CGI。此調整僅存在本機測試工具。

## 可重跑驗證

```powershell
python scripts/verify_auth_cache.py
python scripts/local_preview.py --verify --reset
```

第二個命令使用既有 Chrome headless 與 Node 內建 WebSocket；32 個 HTTP 與 30 個瀏覽器 UI 檢查通過。另有 3 個 ACTIVE、SUSPENDED、查無帳戶案例驗證每次請求只查一次。PHP `-l`、JavaScript `node --check` 與 Git whitespace 檢查皆通過。

HTTP 包含原登入 API、舊 session 停權／降權、CSRF、本人保護、恢復帳戶不復活 session、登出與重新登入、安全中心 API。UI 包含 1440px 桌機與 390px 手機、搜尋／組合篩選、空白／錯誤／重試、取消確認、連點單次更新、親訪表單驗證／取消／儲存、路線退出、安全中心頁籤、登出再登入。

證據均保留在 `%TEMP%\visitation-professional-preview`：`isolation.json`、`http-results.json`、`ui-results.json`、`before-*.png`、`after-*.png`。代表畫面為 `after-admin.png`、`after-admin-mobile.png`、`after-accounts-mobile.png`、`after-app-mobile.png`、`after-place-form-mobile.png`。

實際 Google／MapTiler 地圖底圖、外部導航與真實 GPS 未以正式 key 或真實位置測試；瀏覽器 QA 明確封鎖地圖供應商腳本，以驗證故障處理與保留的名單／親訪流程。不將此列為外部地圖服務通過。

## 發布與回復

使用既有 `main` push → GitHub Actions → FTPS 流程。改版前基準 `a592b57d639e78e8e6cf2e7ff96d72c676963eb1`。測試工具、文件與 Python 快取列入部署排除，不上傳合成資料或測試帳戶。需要回復時以本次提交的 revert 發布，無資料庫遷移需回退。
