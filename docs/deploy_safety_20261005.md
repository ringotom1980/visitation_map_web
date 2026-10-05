# 2026-10-05 部署排除與認證留存修正

使用者已核准兩項部署安全修正與兩批 UI 發布。遠端 main 重新 fetch 後仍為 `568eafef455bca9c6c44b45c47114849baf49abe`；`229012b`、`c74f676` 兩批提交完整保留，未重新混合修改。

## 唯一 workflow 修正

- 保留原 `**/.git*`、`**/.github*`，新增 `**/.git/**`、`**/.github/**`，完整排除子樹。
- `actions/checkout@v4` 設定 `persist-credentials: false`。Checkout 仍使用既有 GitHub 授權取得程式，但不把認證設定保留於工作樹。本部署 job 沒有 checkout 後的 Git push／fetch 步驟，FTP 使用原有 secrets。
- 所有原 `.env`、文件、QA／preview、快取等排除保持；FTPS action、目標、timeout、`dangerous-clean-slate:false` 及原 PHP 語法 gate 不變。未新增憑證、權限或主機安全設定。

## 同步與刪除驗證

從 action v4.3.4 的正式 `dist/index.js` 取得實際 bundled 程式，SHA-256 為 `ad0aea892c11ea8c06e40f663042b7120485d528196127e803d23ee7cfcbaa77`。只將 startup module 改成可取得內部函式，未執行 action 入口、未連線 FTP、未讀外部認證環境。以原函式 `applyExcludeFilter`、`getLocalFiles`、`getServerFiles`、`HashDiff.getDiffs`、`FTPSyncProvider.syncLocalToServer` 執行隔離模擬。

合成 fixture 由 main／兩批提交 archive 建立，`.git/config`、pack 等皆填入 `synthetic-only`；含根目錄及 Public 下的 Git 條目、原 workflow/helper、測試與文件檔。本機依舊／新 glob 產生兩份真實 inventory，mock FTP 只提供合成舊 state 與記錄命令，不讀正式 state／遠端 Git。

39 項檢查通過：舊 glob 重現子檔被納入；新 glob 排除子檔與資料夾；原秘密／測試排除保留；正式 PHP／JS／CSS／config 保留；`getServerFiles` 實際對舊 state 同時套用新 exclude；diff 為四個 UI 檔 replace、零 upload、零 delete。執行同步原函式只發出四個 UI mock upload 與最後的 state upload，無 Git 路徑操作、無 delete／removeDir／clean-slate。

因實作先在 **本機 inventory 與舊 server state 兩側**套用 exclude，這次新增 Git 子樹排除不會把那些舊 state 條目當成遠端待刪除。既有 Git／GitHub 副本會留下，新的同步 state 不再管理它們；沒有宣稱已清除或已驗證主機副本不存在。本次版本沒有移除其他部署檔案；未測任意未知／損壞 state 或異常主機 inventory。

逐項證據見 `docs/qa/deploy-safety-20261005/action-simulation-results.json`；driver 快照同目錄。重跑需 archive fixture 置於 base/candidate，取得原 bundle，將唯一 `var __webpack_exports__ = __nccwpck_require__(399);` 改為 `var __webpack_exports__ = { load: __nccwpck_require__ };` 存為 action-offline.cjs，從該暫存目录執行 driver。不得將真實遠端 Git 或秘密內容作 fixture。

## 發布後核對

先確認沒有其他活躍部署與 remote main 未變，正常 fast-forward 推送本專案 origin/main，單次既有 workflow。追蹤同 commit run 與 FTP step；若相同錯誤停止重試，核對已完成階段與公開 bytes/hash，不以 workflow success 替代驗證。

公開驗證：四個受影響程式中的三個靜態資產完整 bytes/hash，所有地圖本機 JS/CSS helper 依賴，以及登入頁引用的帶版本資產；使用原 URL 與唯一 query/no-cache。PHP app.php 不能以公開 HTTP 取得原始 hash，透過部署日誌的 replacement 與匿名門禁核對，實際登入後 HTML／版本仍列為未驗證，不登入正式帳戶或新增正式資料。

正式 OWNER／移轉設定、實機 Safari、OTP、GPS／外部導航、正式登入流程与主機獨立備份／回復通道仍未驗證。上一版原始程式可由 Git 取得並核對；revert 發布仍依賴同一 FTPS，沒有保證 FTP 故障時可立即回復。
