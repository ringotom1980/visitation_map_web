文件二差異檢查清單（以現況對照）
A. 你目前已具備（可沿用、不必重寫）
A1. Session 登入架構已完整

config/auth.php：current_user_id()、require_login_page()、require_login()、角色判斷完整。

Public/api/auth/login.php：帳密登入、session_regenerate_id(true)、寫入 $_SESSION[user_id/role/org_id] 已具備。

A2. 統一 JSON API 回應格式

Public/api/common/bootstrap.php：json_success/json_error 已統一，後續新 API 端點可直接照做。

A3. 你已做出 OTP 的資料面與寄信能力（文件二也會用到）

你目前已能寄 OTP（你也實測成功）。

otp_tokens 已存在且有 purpose / email / code_hash / expires_at / fail_count / created_ip / created_ua / verified_at 這些欄位，後續 DEVICE OTP、忘記密碼 OTP、QR 授權等都可沿用「相同表」的思路。

B. 文件二「必須新增」的核心缺口（現況沒有）

下面每一項都是文件二要落地時，現在專案中「尚不存在」或「未連上流程」的點。

B1. WebAuthn / Passkeys（核心缺口）
缺口 1：沒有 WebAuthn credential 儲存區

現況：

DB 沒有 webauthn_credentials（或同等功能表）。

users 也沒有任何欄位可判斷「已啟用 Passkeys」。

需要新增：

新表：webauthn_credentials（至少：user_id, credential_id, public_key, created_at, revoked_at, last_used_at）

建議另加：trusted_devices（配合 E2：新裝置不能直接快速登入）。

缺口 2：沒有 WebAuthn 註冊 API（register_options / register_verify）

現況：

Public/api/auth/ 只有 login.php/logout.php/me.php（你貼的範圍內），以及你為文件一做的 register_request/register_verify（屬 OTP 註冊，不是 WebAuthn）。

需要新增 API：

POST /api/auth/webauthn/register_options

POST /api/auth/webauthn/register_verify

需要新增前端流程：

登入後（手機）導引呼叫 navigator.credentials.create()，然後打 register_verify。

缺口 3：沒有 WebAuthn 登入 API（login_options / login_verify）

需要新增 API：

POST /api/auth/webauthn/login_options

POST /api/auth/webauthn/login_verify

需要前端：

login 頁加一個「Face ID/指紋登入」按鈕（僅在符合條件時顯示；見 E2 規則）。

缺口 4：缺少「E2 新裝置不得直接快速登入」的關鍵控制點

你要求的 E2 是最重要的風控規則之一：

新裝置不能用快速登入（Passkeys），一定要先帳密登入 + Email OTP 驗證後，才允許在該裝置啟用 Passkeys。

現況：

你目前的登入只看 users.status，不會辨識裝置是否可信。

沒有 trusted_devices、沒有 device token cookie、沒有 DEVICE OTP 流程。

需要新增：

trusted_devices 表（或至少一個「裝置信任」資料結構）

新 API：

POST /api/auth/device_otp_request

POST /api/auth/device_otp_verify

新前端（登入成功後若判定新裝置）：

顯示「請輸入 Email 驗證碼，完成裝置認證」

完成後才顯示/執行 Passkeys 註冊引導

B2. 桌機 QR Code 登入（Q1）缺口
缺口 1：沒有 QR Session 表、沒有 challenge 發放

需要新增 DB：

qr_login_sessions（challenge, status, expires_at, desktop_ip/ua, approved_user_id…）

缺口 2：沒有 QR API 全鏈路

需要新增 API（最小閉環）：

POST /api/auth/qr/create（桌機拿 challenge，顯示 QR）

GET /api/auth/qr/poll?c=...（桌機輪詢）

POST /api/auth/qr/approve（手機端登入後按允許）

POST /api/auth/qr/consume（桌機用一次性 token 建 session）

缺口 3：沒有「手機授權頁」

需要新增頁面（或至少一個 modal/簡頁）：

Public/qr_approve.php（或掛在你現有漂亮網址規則下的 /qr/approve）

行為：

讀取 challenge

若未登入 → 導 /login（完成後回來）

已登入 → 顯示「是否允許此桌機登入」→ 呼叫 qr/approve

B3. 風控（IP / 地區 / 次數限制）缺口
缺口 1：沒有 auth 事件稽核表（auth_events）

現況：

users.last_login_at 存在，但你登入 API 目前沒有寫入（貼的 login.php 沒 UPDATE last_login_at）。

也沒有「登入失敗」「OTP 失敗」「封鎖」等事件紀錄。

需要新增：

auth_events 表（或簡化版 security_events）

在以下動作寫入事件：

LOGIN_OK / LOGIN_FAIL

OTP_SENT / OTP_FAIL / OTP_VERIFY_OK

PASSKEY_REGISTER_OK / PASSKEY_LOGIN_OK

QR_ISSUED / QR_APPROVED / QR_CONSUMED

RISK_BLOCK

缺口 2：沒有 rate limit/冷卻機制

現況：

OTP 有 fail_count（單 OTP 維度），但沒有 IP/email 維度的總控。

login.php 沒有限制錯誤次數。

需要新增（最小可落地版本）：

DB 表 rate_limits（或直接在 auth_events 上聚合查詢，但效率較差）

或新增 auth_throttles：

key（ip/email/action）

window_start / count / blocked_until

需要套用到：

/api/auth/login（帳密爆破）

/api/auth/*otp_request（濫發信）

/api/auth/*otp_verify（OTP 猜碼）

/api/auth/qr/*（避免刷 challenge/poll）

C. 需要「調整」的既有檔案（為了接上文件二）

這段是最實務的：哪個檔案要動、動什麼類型的點。

C1. Public/index.php（login 頁 UI）

要新增 UI 元件：

密碼欄位「顯示/隱藏 icon」（你先前指定要做）

「用 Face ID/指紋登入（Passkeys）」按鈕（符合條件才顯示）

「用手機掃碼登入」入口（桌機顯示，手機可隱藏）

注意：你目前 login.css 是共用風格，UI 元素加進去要避免破版。

C2. Public/assets/js/login.js

現況問題：

你現在的 api.js 改成回傳「整包 JSON」，但 login.js 還在「把 apiRequest 當 data 直接用」的舊假設（你先前自己註解也點出過：曾經壞掉的原因）。

這跟文件二無關，但你接下來做 Passkeys/QR 一定會被這點卡住。

必須先統一介面（兩種擇一，選一個全站一致）：

方案 A：apiRequest() 回 json.data（舊行為）

方案 B：apiRequest() 回原始 {success,data}，但所有呼叫端都改成 const json = await apiRequest(...); const data = json.data;

你已經把 api.js 寫成方案 B，所以接下來做文件二，我建議全面採 方案 B，把 login.js / register.js 等呼叫端都統一改掉，避免後續新增 WebAuthn API 時一直踩雷。

C3. Public/api/auth/login.php

需要加的安全欄位更新：

成功登入後：更新 users.last_login_at = NOW()

寫 auth_events (LOGIN_OK)；失敗也寫 LOGIN_FAIL（但注意不要洩漏帳號是否存在，detail 需設計）

需要插入風控檢查點（之後加）：

在 password_verify 前後做 rate limit 判斷與累積

D. 交付切分（你說「可以開始」—我就直接給你施工順序）

文件二如果你要「可運行」而不是只寫規格，建議用下面順序，避免一次炸太多：

D1（先做）：基礎稽核 + 登入事件 + rate limit（不動 Passkeys/QR）

新增 auth_events

login.php 寫入 LOGIN_OK/FAIL

OTP 的 request/verify 寫入 OTP_SENT/FAIL/OK

加 IP/email 次數限制（最小版本）

D2（再做）：trusted_devices + DEVICE OTP（把 E2 的門檻先落地）

新增 trusted_devices

新增 device_otp_request/device_otp_verify

帳密登入成功後若裝置未 TRUSTED → 先要求 DEVICE OTP → TRUSTED 後才顯示 Passkeys 引導

D3（再做）：WebAuthn/Passkeys（手機快速登入）

新增 webauthn_* API

login 頁加 passkey login

app/profile 頁加「管理我的裝置/撤銷 passkeys」（可後做）

D4（最後做）：桌機 QR 登入（Q1）

新增 qr_login_sessions

實作 qr create/poll/approve/consume

桌機 login UI 加 QR modal

手機新增授權頁