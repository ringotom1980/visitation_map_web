# 單位異動：結構與上線前提

現有權限：`ADMIN` 是全系統管理者，帳戶管理 API 列出所有單位的人員；沒有單位別管理者範圍。`USER` 的親訪資料依目前 `users.organization_id` 限制。`organizations.is_active=1` 已用於註冊頁選项。沒有既有單位異動申請表／流程；原 `/profile` 只是返回地圖。`places.organization_id` 是親訪紀錄歸屬，異動帳戶不搬移它。

新增流程沿用全系統管理者的既有範圍，只核准／直接調整啟用的一般使用者；管理者不能審核或調整本人。可退回停權／角色已變更的舊申請，該操作不變更單位。一般使用者只能查看／撤回本人的申請。所有寫入檢查 CSRF、最新角色／狀態，鎖定帳戶及申請列並在交易內更新，異動與稽核同時提交／回滾。每人唯一待審以資料庫 unique generated column 強制。

## 必須確認的正式 DB 差異

請先核准新增兩張表，精確 SQL 在 `database_migration_organization_transfers.sql`：

- `organization_transfer_requests`：使用者與原／新單位 ID／名稱快照、申請原因、PENDING／APPROVED／REJECTED／WITHDRAWN／SUPERSEDED 狀態、審核者／原因／時間、每人唯一待審鍵及歷史／狀態索引。
- `organization_change_audit`：使用者及操作者 ID／名稱、原／新單位 ID／名稱快照、異動原因、APPROVED_REQUEST／DIRECT 類型、對應申請 ID、時間及查詢索引。

這是新增表的非破壞性 migration，不 ALTER／DELETE 既有 users、organizations、places，也不搬移任何親訪紀錄。需要 MySQL 5.7+ 或 MariaDB 10.2+、InnoDB 交易。沒有外鍵型別假設，既有表 ID 型別不需變更；API 在鎖定交易內驗證參照。

正式執行前，由具有 DB 管理權限的維運者確認目標 DB／版本／InnoDB、檢查表名未被使用，先完整備份（例如使用現有管理介面匯出結構與資料，或現有 mysqldump 工具以安全 credential profile 執行；不在命令列輸出密碼），驗證備份可還原，再以既有 DB 管理介面／mysql client 執行此 SQL。兩個 CREATE TABLE DDL 不具整批 rollback 原子性，若第二張失敗，保持功能關閉並查清原因後完成缺少的表，不可直接重跑整份 SQL。

程式預設 `ORGANIZATION_TRANSFERS_ENABLED=false`；完成 migration 並檢查兩張表後，維運者才在正式環境設定 `ORGANIZATION_TRANSFERS_ENABLED=true`。普通頁面與 API 不建立／修改 schema；未啟用或缺表回傳 503，核心地圖／既有管理功能不需新增表。

回復方式：先把開關改回 false、回復前一版程式；保留新增表與稽核紀錄，無需刪表。若一定要撤除表，先匯出新增兩表並由維運者另行確認；不得默默 DROP 稽核。已完成的帳戶單位異動不應隨程式 rollback 自動反向修改。

## 正式執行安排與剩餘阻礙

已查證 `.github/workflows/deploy.yml` 只以 FTPS 上傳程式，排除 docs、.env 與隔離測試腳本；沒有 SSH 或 SQL migration 步驟。既有軟刪除 migration 文件使用 phpMyAdmin 手動執行，沿用這條管理路徑；不增加公開 DDL endpoint 或索取新憑證。

既有 DB 管理者在網站的 phpMyAdmin 核對所選 DB 後執行唯讀檢查：
```sql
SELECT DATABASE() AS selected_database, VERSION() AS version;
SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
 ('users','organizations','places','organization_transfer_requests','organization_change_audit');
SHOW COLUMNS FROM organizations LIKE 'is_active';
SHOW GRANTS FOR CURRENT_USER;
```
users、organizations、places 需 InnoDB；若不是，停止並另案評估引擎 ALTER。本次未授權修改既有表引擎。organizations.is_active 必須存在，新表不得同名存在。版本須支援 stored generated column 與其 unique index。

DDL 精確範圍為兩個 CREATE TABLE。申請表：PK(id)、unique(pending_user_id)、(user_id,id)、(status,id)；稽核表：PK(id)、(user_id,id)、(request_id)。沒有外鍵或 ALTER 舊表，避免臆測舊 ID 型別；參照在 API 鎖定交易中驗證。執行 migration 帳戶需 CREATE 權限，索引隨 CREATE 建立；網站執行帳戶需申請表 SELECT/INSERT/UPDATE、稽核表 SELECT/INSERT、既有 users SELECT/UPDATE、organizations SELECT 與 places 原有 CRUD，不需要稽核 UPDATE/DELETE 或新表 DROP/ALTER。

備份選取 DB 的**全部結構及資料**，含 users、organizations、places、auth 與既有關聯物件。以既有 phpMyAdmin 自訂匯出 SQL，下載至操作者私人離線位置、網站根目錄以外。建議 `%LOCALAPPDATA%\visitation_map_web\backups\organization-transfer\<UTC時間>\before.sql`；這是建議位置，尚未建立或取得正式備份。不得放 repo、Public、Library 或上傳第三方。備份帳戶須可 SELECT 全 DB 資料；若有 view／trigger／event／routine，也須具備各物件匯出所需 SHOW VIEW、TRIGGER、EVENT 或版本相應的 routine metadata 權限。缺少任何物件不得視為完整備份。先核對匯出完整性（此輪由使用者私人保留備份，不要求另建 DB），再以現有 phpMyAdmin 執行本機 `docs/database_migration_organization_transfers.sql`。兩表 DDL 不具整批原子 rollback；若第二表失敗，保留開關 false，先檢查已建部分，不盲目重跑。

兩表及索引確認後，原網站環境設定維護者才在既有私有設定加入 `ORGANIZATION_TRANSFERS_ENABLED=true`，不提交實際 .env。正式帳戶異動驗收需另行授權。

### 2026-10-04 管理入口的只讀調查

工作流名稱明確為 Deploy to Hostinger via FTP；實際 host 與目標目錄只引用 GitHub secrets，沒有讀取或輸出其內容。這支持網站部署使用 Hostinger，**尚不足以證明 DB 也託管於 Hostinger**；db.php 的 DB_HOST／DB_NAME 來自私有設定，正式設定沒有讀取。Hostinger 已安裝 app 只有 AI Builder 網站工具，沒有這個 PHP 網站的 hPanel／MySQL／SSH 管理 action。

本機有 ssh.exe、MariaDB client 與 mysqldump，但沒有執行中的 ssh／PuTTY／Windows Terminal，使用者目錄的 `.ssh/config`、`.my.cnf`、`.mylogin.cnf` 不存在，SSH_AUTH_SOCK 未設定。這不代表主機沒有 SSH，只代表沒有已查證可直接沿用的本機連線設定。未探測猜測的主機、讀取私鑰或建立 persistent access。

Chrome／Edge 程式存在，但此次委派工具沒有 node_repl 或 Browser Use；已完整閱讀 computer-use 初始化及限制，它要求所有 Windows app 操作使用 node_repl。不能以自製 PowerShell UI Automation 或擷取瀏覽器 cookies／profile 替代。因此**未能驗證是否已有 hPanel／phpMyAdmin 登入 session**，不能宣稱沒有 session。

目前最小的人工一步：在既有瀏覽器開啟 **Hostinger hPanel 的該網站資料庫管理頁，再開啟該 DB 的 phpMyAdmin，執行本文件唯讀 preflight SQL**。若工具可用的主對話能接手既有 session，由主對話完成此步；否則操作者只需回報 DB provider、版本、三表引擎、is_active 是否存在及 CREATE 權限是否足夠，**不要貼 SHOW GRANTS 原文、連線字串、cookie、密碼或 token**。這一步不執行 DDL、不異動資料，不要求建立新帳號或授權。

### 可沿用原網站連線的 CLI 方案（有既有授權 SSH 時）

只有在現有 hPanel 顯示已啟用 SSH，且已有授權 session 或既有連線方式時才採用；目前尚未查證。由原站專案根目錄執行 PHP CLI，`require 'config/db.php'; $pdo=db();` 可沿用原網站連線，憑證只在程序內載入，無需重配或傳回。不要誤用 `$pdo=require 'config/db.php'`：該檔只定義函式、不回傳 PDO。普通 API bootstrap 不適合 migration，會做 session／HTTP 認證；不得以 web request 代替 CLI。

唯讀核對可在原 SSH terminal 執行下列命令（不得在本機 workspace 對正式 .env 執行）：
```sh
php -r 'require "config/db.php"; $p=db(); echo json_encode($p->query("SELECT DATABASE() AS selected_database, VERSION() AS version")->fetch(), JSON_UNESCAPED_UNICODE), PHP_EOL;'
```
在核對 DB 與引擎、完整私人備份及**另行授權正式 DDL**後，才使用 CLI-only runner；runner 須先檢查 PHP_SAPI===cli、明確核對 operator 指定目標 DB、檢查表不存在／引擎／is_active、固定讀取已審核 SQL，不接收任意 SQL，不自動建立或修補舊表、不印憑證。SQL 因 docs 被 FTPS 排除，需操作者從本機已審核檔以既有私有傳輸上傳至 webroot 以外暫存位置。完成後核對兩表與索引，再處理開關。**目前沒有既有 CLI migration runner，也未假裝已可遠端執行；沒有新增或執行正式 runner。**

### 功能開關的精確位置

config/bootstrap.php 的 load_env() 每次讀取與 config 同級的專案根目錄 `.env`，並以其值覆蓋 putenv／$_ENV／$_SERVER。在原有主機檔案管理或既有私有部署方式中，只把該檔的 `ORGANIZATION_TRANSFERS_ENABLED=false` 改成 `ORGANIZATION_TRANSFERS_ENABLED=true`（不存在則新增一行，禁止重複 key），不修改其他設定、不回傳整份 .env。網站請求會重新讀取，不需 PHP 服務重啟。若 `.env` 已有 false，只改外部程序環境變數會被覆蓋。FTPS workflow 排除 .env，不會替操作者開啟功能。兩表未確認前保持 false；回復同一行為 false。

版本與引擎已由下列正式 dump 結構確認；正式 DB provider、權限與實際備份狀態仍需沿既有管理介面確認。尚未讀取正式 .env、改正式帳戶或執行正式 DDL／開關。

## 本機驗證

50 項隔離 HTTP（含並行審核、舊 session 撤權、稽核失敗回滾）及 39 項實際 Chrome UI 通過；UI 涵蓋 1440/390/320px、取消/Escape、連點、申請退回核准直接調整、讀取失敗重試、登入中單位改變後地圖舊資料與路線清除。既有 32 項 HTTP、30 項管理／表單 UI、91 項地圖回歸及 3 項 auth 快取查詢檢查全部通過。52 個 PHP、24 個 JavaScript 語法檢查通過。Chrome 響應尺寸與 VisualViewport 模擬已測，沒有宣稱新流程已在實體 iPhone Safari 驗證。

重現：`python scripts/local_preview.py --transfers --reset`；預覽：`python scripts/local_preview.py --transfers-preview --reset`。僅 loopback 43417、合成資料 DB 43416，每次寫入前核對實際 datadir。示範管理者 `admin@example.invalid`、一般使用者 `user@example.invalid`，密碼均為 `Preview-only-2026!`。


## 正式結構截圖後的補正：既有 user_applications

使用者提供截圖，主對話已確認選取 DB 為 `u327657097_visitation_map`、server 為 `127.0.0.1:3306`，14 張表均顯示 InnoDB，包含 user_applications 與 pending_registrations。此為主對話的畫面證據，本委派未查詢正式表內容。

目前 HEAD 的 Public/config/scripts/docs 不引用 user_applications，repository 沒有其 CREATE schema。Git 歷史證明 `bb53b2c`（修正管理後台）移除舊 `Public/api/applications/create.php`、`Public/api/admin/applications/{pending,approve,reject}.php` 及轉接入口。其父版 create.php 明確標註「新使用者帳號申請」，接受 name/phone/email/org_id/title/password/password_confirm，寫入 user_applications 的 name/phone/email/organization_id/title/password_hash/status/created_at；approve.php 檢查 email 尚無帳戶後 INSERT users，接著更新申請審核者與時間。沒有原／新單位欄位、既有 user_id 或單位變更分支；用途是舊式註冊審核，不是已登入使用者換單位。

現行 `Public/api/auth/register_request.php` 將註冊資料 upsert pending_registrations 並寄 REGISTER OTP；`register_verify.php` 驗證後 INSERT users、DELETE 對應 pending_registrations。現行 admin 並無舊帳號申請審核入口。這些是程式語義／歷史證據，**不能斷言正式 user_applications 未被站外流程使用，或現在實際欄位完全等於歷史版**。

先前「沒有既有單位異動申請流程」在現行 repo 層面成立，但應補充正式 DB 留有舊註冊申請表。新增兩表不讀寫、刪除、改名或再利用 user_applications/pending_registrations；它們與其他表同列私人備份範圍。正式 DDL 前先核對以下 metadata；若 user_applications 存在異動類型、原／新單位或已登入 user_id 等未知欄位，暫停 DDL 並查明外部／舊版實際用途。

### 下一段最小唯讀 SQL（phpMyAdmin SQL 頁）

```sql
SELECT DATABASE() AS selected_database, VERSION() AS server_version;

SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND DATABASE() = 'u327657097_visitation_map'
  AND TABLE_NAME IN ('users','organizations','places','user_applications',
                    'pending_registrations','organization_transfer_requests',
                    'organization_change_audit')
ORDER BY TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND DATABASE() = 'u327657097_visitation_map'
  AND (
    TABLE_NAME = 'user_applications'
    OR (TABLE_NAME = 'organizations' AND COLUMN_NAME IN ('id','name','is_active'))
    OR (TABLE_NAME = 'users' AND COLUMN_NAME IN
        ('id','name','role','status','organization_id','updated_at'))
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

僅查 server/schema metadata；不查使用者或申請資料列、不回傳帳密、token 或 SHOW GRANTS。第一行應為已確認 DB，若不符則停止；後兩段另設選取 DB guard。不根據截圖的「14 表 InnoDB」猜測版本或 CREATE 權限。主對話已指示使用者自行匯出 SQL 備份、留本機不傳回；此輪沒有要求另建 DB／執行還原演練，早先該段為可選的備份驗證建議，並非目前必做步驟。


## 正式 dump 結構相容性（主對話提供 metadata，未讀 INSERT）

主對話已只讀確認 dump 於 2026-10-04 03:34 產生、server 11.8.9-MariaDB-log、DB u327657097_visitation_map，14 張既有表均 InnoDB。users.organization_id 為 BIGINT UNSIGNED NOT NULL、role 包含 USER/ADMIN、status 包含 ACTIVE/SUSPENDED；organizations 有 id/name/code/county_code/parent_id/is_active，其中 is_active 為 tinyint default 1。**不再要求使用者另跑查版本 SQL。**

user_applications 明確 COMMENT「帳號申請紀錄」，包含 name/phone/email/organization_id/title/password_hash/status(PENDING/APPROVED/REJECTED)/reviewer_user_id/reviewed_at/review_note/created_at/updated_at，與 Git 歷史的註冊審核一致，不含已知單位異動類型、原／新單位欄位。新流程不重複改造這張舊表、不動 pending_registrations。

純新增 SQL 仍是 `docs/database_migration_organization_transfers.sql`，兩個 CREATE，沒有 USE/INSERT/DELETE/DROP/ALTER/GRANT 或正式資料。MariaDB 11.8.9 支援所用 STORED generated column 與 nullable unique index；終態 pending_user_id 為 NULL，可留多筆歷史，但每人只能一筆非 NULL PENDING。新 ID 為 BIGINT UNSIGNED，與已確認的 users.organization_id 相容；沒有 FK，因此不要求 ALTER 任何舊表或新增舊表索引。新增表所有必要 PK/unique/查詢索引已內嵌 CREATE。原 SQL 已在隔離 MariaDB 12.0 實際建立並通過 50 HTTP／39 UI，不宣稱在正式 11.8.9 執行過。

尚需主對話僅看 dump CREATE／ALTER 結構確認兩項：users.id 與 organizations.id 各為 PK 或 UNIQUE（API 以 id 識別並鎖單一帳戶／單位）；users.name 與 organizations.name 長度不超過新快照 VARCHAR(100)。這些 metadata 未在本次委派收到；若較長，先調整新表快照欄位並隔離重測，不改正式舊表。無需讀 INSERT 或任何真實資料列。

最小匯入檔已準備為上述 .sql；不要匯入整份正式 dump，不使用 CREATE IF NOT EXISTS 掩蓋同名不同結構。安全核對完成、私人備份確認及正式 DDL 獲授權前，不請使用者執行。選對既有 DB 後由 phpMyAdmin 匯入這個檔，兩表 DDL 不具整批原子 rollback，第二表若失敗，保持 flag false 並核對第一表，不盲目重跑。

開關由使用者在原站檔案管理器找到與 config/、Public/ 同級的私有 .env，只新增或修改唯一一行 `ORGANIZATION_TRANSFERS_ENABLED=true`，不傳回該檔或含憑證畫面。先部署本機已驗證新程式且保持 flag false；完成新增兩表並確認 runtime 表權限後才開 true。現有 FTPS workflow 排除 .env 與 docs；程式提交不會幫忙匯入 SQL 或開旗標。失敗時將該行改回 false，保留新表與稽核紀錄。
