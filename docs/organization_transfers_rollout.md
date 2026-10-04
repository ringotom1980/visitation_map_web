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

備份選取 DB 的**全部結構及資料**，含 users、organizations、places、auth 與既有關聯物件。以既有 phpMyAdmin 自訂匯出 SQL，下載至操作者私人離線位置、網站根目錄以外。建議 `%LOCALAPPDATA%\visitation_map_web\backups\organization-transfer\<UTC時間>\before.sql`；這是建議位置，尚未建立或取得正式備份。不得放 repo、Public、Library 或上傳第三方。先核對匯出完整性並在另一私有 DB 演練還原，再以現有 phpMyAdmin 執行本機 `docs/database_migration_organization_transfers.sql`。兩表 DDL 不具整批原子 rollback；若第二表失敗，保留開關 false，先檢查已建部分，不盲目重跑。

兩表及索引確認後，原網站環境設定維護者才在既有私有設定加入 `ORGANIZATION_TRANSFERS_ENABLED=true`，不提交實際 .env。正式帳戶異動驗收需另行授權。

目前沒有可操作的正式 phpMyAdmin／DB 管理連線；正式 DB 名稱、版本、引擎、權限與實際備份位置尚未驗證。需要的人工介入為：**既有 DB 管理者完成上述唯讀核對及私人備份，確認可執行後授權正式 DDL／開關**。未讀正式 .env、未改正式帳戶或執行正式 DDL／開關。

## 本機驗證

50 項隔離 HTTP（含並行審核、舊 session 撤權、稽核失敗回滾）及 39 項實際 Chrome UI 通過；UI 涵蓋 1440/390/320px、取消/Escape、連點、申請退回核准直接調整、讀取失敗重試、登入中單位改變後地圖舊資料與路線清除。既有 32 項 HTTP、30 項管理／表單 UI、91 項地圖回歸及 3 項 auth 快取查詢檢查全部通過。52 個 PHP、24 個 JavaScript 語法檢查通過。Chrome 響應尺寸與 VisualViewport 模擬已測，沒有宣稱新流程已在實體 iPhone Safari 驗證。

重現：`python scripts/local_preview.py --transfers --reset`；預覽：`python scripts/local_preview.py --transfers-preview --reset`。僅 loopback 43417、合成資料 DB 43416，每次寫入前核對實際 datadir。示範管理者 `admin@example.invalid`、一般使用者 `user@example.invalid`，密碼均為 `Preview-only-2026!`。
