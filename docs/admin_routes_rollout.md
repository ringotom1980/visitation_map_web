# 管理後台入口路由修正

正式網址為 https://ml.jinghong.pw/login。
網站根 `.htaccess` 的路徑基準是網站 document root，將請求轉到
`visitation_map_web/Public/`。Repo 的 `Public/` 是程式目錄，並非此外層根目錄；
僅新增 repo 內 `.htaccess` 無法補上外層已落入登入頁的路由。

## 最小修正

於真正網站根 `.htaccess` 的既有 `^admin/?$` 規則之前加入：

```apache
RewriteRule ^admin/accounts(?:\.php)?/?$ visitation_map_web/Public/admin/accounts.php [L]
RewriteRule ^admin/transfers(?:\.php)?/?$ visitation_map_web/Public/admin/transfers.php [L]
```

Canonical 入口為 `/admin/accounts`、`/admin/transfers`；保留既有 `.php` 連結及尾斜線。
`/admin/accounts?view=authorization` 的查詢參數保持不變。
不加入任意 PHP 檔案路由，所有原有頁面、API 與資源規則保持原樣。
`docs/hosting-root.htaccess` 是使用者提供的原始規則測試基準，並非完整替換檔。

## 實際部署位置與安全檢查

既有 FTPS workflow 上傳 repo 到 `FTP_TARGET_DIR`。
新增步驟只檢查該目錄與其立即上層；先確認部署的 `Public/admin/index.php` 位元組，
再驗證候選 document root 的 `.htaccess` 包含指定 admin 規則，且該根目錄下
`visitation_map_web/Public/admin/index.php` 與此次提交一致。
只有唯一匹配才備份、暫存、檢查並以 rename 替換真正根檔案；所有既有文字原封保留。
衝突路由、根目錄不明、無權限、並行修改或 TLS 驗證失敗時，不猜路徑、不關閉 TLS 驗證。
不讀取正式 `.env`，不修改憑證或正式資料庫。
實際 FTP 命名空間路徑與修改前後 SHA-256 由部署的 `root-routing-result` artifact 記錄。
若根檔案位於 FTPS 帳戶無權訪問的範圍，仍須由原站檔案管理員套用上述最小修正；不得宣稱根路由已更新。

## 真正 Apache 驗證

使用安裝的 Apache 2.4.58 Win64、`mod_rewrite`、PHP module，
獨立暫存 document root、loopback 連線與已核對 datadir 的合成 MariaDB。
`python scripts/preview_apache_routes.py` 共 49 項通過：

- 原始根規則重現四個新入口落入登入頁。
- 修正後新入口、`.php` 相容路徑、尾斜線及授權查詢匿名均 302 至登入。
- OWNER／ADMIN 真正登入合成帳戶後進入正確頁面；USER 導回地圖。
- 既有登入、註冊、忘記密碼、裝置驗證、個資、安全、API 與靜態資源路由保持正確。
- 非允許名單的 admin 路徑未取得任意 PHP 存取。
- Patch 可重複執行；衝突、缺失或重複既有 admin 規則直接拒絕。

沙箱不支援 Apache 原生路徑查詢時，僅以已授權的隔離測試方式執行；不啟動 XAMPP 原有站台。
正式發布後另驗證匿名 302／API 阻擋及資源 hash；正式角色登入、OWNER 私有設定及 OTP 未由此測試代替。
