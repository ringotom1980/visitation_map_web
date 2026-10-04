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

## 生效的部署方式與根檔案限制

既有 FTPS workflow 將 repo 程式發布到 `FTP_TARGET_DIR`；現有根規則的 fallback
已指向 `visitation_map_web/Public/index.php`。本次在此真正被呼叫的入口加入八個
固定 URL 對應（兩頁、`.php` 及尾斜線），於登入頁自動導回地圖之前分派到固定 admin 檔案。
每個目標頁仍執行 `require_admin_page()`，不以請求內容拼接任意路徑。
因此既有外層 `.htaccess` 保持原樣即可生效，不依賴無效的 repo Public `.htaccess`。

曾嘗試以既有 FTPS secrets 核對並更新外層根檔案：程式檔案上傳成功，但額外的根檔案步驟
在登入前因 `SSLCertVerificationError: Hostname mismatch` 拒絕連線。
沒有登入、備份、暫存或修改根 `.htaccess`，也沒有關閉 TLS 憑證驗證、改動 secrets 或讀取 `.env`。
該無法完成安全連線的步驟已移出自動部署，避免每次發布失敗；正式有效路由改由上述固定入口處理。

已知根檔案的 HTTP 路徑為 `/.htaccess`，Apache 規則的實體位置基準為網站 document root；
FTP 命名空間的絕對 root 路徑因登入前的憑證錯誤尚未核對，不猜測其絕對路徑或寫入權限。
`.github/scripts/deploy_root_routes.py` 保留為可審查的嚴格驗證工具，不由自動部署執行。
它僅核對 configured project directory 及其立即上層、部署檔案的 hash 及唯一根規則，
成功驗證後才可備份並原子替換；無法唯一確認時不寫入。
若操作者仍要補齊外層規則，可於原站檔案管理器依上述兩行最小 patch 修改真正根檔案。
目前應用入口已支援相同 canonical 與 legacy 路徑，外層 patch 為可選的整理。

## 真正 Apache 驗證

使用安裝的 Apache 2.4.58 Win64、`mod_rewrite`、PHP module，
獨立暫存 document root、loopback 連線與已核對 datadir 的合成 MariaDB。
`python scripts/preview_apache_routes.py` 共 67 項通過：

- 原始根規則重現四個新入口落入登入頁。
- 原始根規則不變，新的固定入口即可使新頁面、`.php` 相容路徑、尾斜線及授權查詢匿名均 302 至登入。
- OWNER／ADMIN 真正登入合成帳戶後進入正確頁面；USER 導回地圖。
- 既有登入、註冊、忘記密碼、裝置驗證、個資、安全、API 與靜態資源路由保持正確。
- 非允許名單的 admin 路徑未取得任意 PHP 存取。
- Patch 可重複執行；衝突、缺失或重複既有 admin 規則直接拒絕。

沙箱不支援 Apache 原生路徑查詢時，僅以已授權的隔離測試方式執行；不啟動 XAMPP 原有站台。
正式發布後另驗證匿名 302／API 阻擋及資源 hash；正式角色登入、OWNER 私有設定及 OTP 未由此測試代替。

## 正式站唯讀驗證（程式提交 4e4353b）

`4e4353bb8a5667452bcfbcbb1f140e12d5f66fdb` 的正常 FTPS 與 PHP 語法檢查成功：
https://github.com/ringotom1980/visitation_map_web/actions/runs/37179304390。
兩個 canonical、`.php` 與尾斜線共八個入口，以及授權 query／檔案注入 query，
匿名全部 302 至 `/login`，回應沒有登入 fallback 的 HTML。
未知 `/admin/route-does-not-exist` 仍為原有 200 登入 fallback；兩者可明確區分。
原 `/admin`、`/admin/security`、`/profile` 保持匿名 302，查詢 API 保持 401／403。
六個 CSS／JS 與提交的完整位元組及 SHA-256 相同。
證據見 `docs/qa/owner-permissions/live-routing-results.json`。

67 項隔離 Apache 測試另證實 query 不會選取任意 include、非法路徑不會取得管理頁，
合成 OWNER／ADMIN 的 page POST 仍直接到固定頁面而沒有新增轉址；
page POST 的 role／organization_id 等欄位不會變更權限或單位，USER 仍被導回地圖。

正式 OWNER 私有設定是否已完成、真實三層角色登入及 OTP 尚未驗證。
上述 Apache 與前次 235 項多角色／地圖檢查均為合成隔離測試，並非正式帳戶操作。
