文件二｜稽核等級實作規格書

系統：遺眷親訪地圖系統
方案：Q1（Passkeys + 桌機 QR 登入 + 風控）
平台：手機（iOS/Android）、桌機（Chrome/Edge/Safari）
後端：PHP 8.3 + MariaDB（Hostinger）
前端：原生 JS（你目前的 api.js / login.js 架構）

1. 目標與安全等級
1.1 目標

手機：第一次用帳密登入後，引導建立 Passkeys（Face ID/指紋）；後續可快速登入。

新裝置：不得直接使用快速登入；需先帳密登入 + Email OTP（DEVICE） 驗證後，才能在新裝置建立/使用 Passkeys（符合你 E2）。

桌機：提供 QR Code 登入（由手機完成驗證/核發一次性登入碼），避免桌機直接輸入 OTP 或依賴指紋讀取器。

風控：加入 IP/地區/次數限制，針對 OTP、登入、QR 流程都有防爆破與稽核證據。

1.2 稽核等級（建議分級）

Level 1（基礎可稽核）：事件記錄、OTP 失敗次數、TTL、登入成功/失敗紀錄、QR 流程紀錄。

Level 2（風控上線）：IP/Email/裝置頻率限制、異常地區/ASN 風險旗標、冷卻時間、可追溯封鎖原因。

Level 3（高敏感）：裝置信任分級、Passkey 綁定/撤銷、風險分數模型、管理端稽核報表與匯出。

你目前做 OTP 表與寄信已接近 Level 1；本文件把 Level 2~3 也列入規格。

2. 資料模型（DB 設計規格）

你現有 users, otp_tokens 已存在。以下新增表/欄位是「文件二」的建議實作基礎。

2.1 webauthn_credentials（Passkeys 憑證表）

用途：一個帳號可綁多個裝置（多把 passkey），可撤銷。

建議欄位：

id BIGINT AI PK

user_id BIGINT FK(users.id)

credential_id VARBINARY(255) UNIQUE（WebAuthn 的 credentialId，base64url decode 後 bytes）

public_key BLOB（COSE 公鑰）

sign_count INT（可選；現代 passkeys 有時不可靠，但可保留）

transports VARCHAR(255) NULL（可選）

aaguid CHAR(36) NULL（可選）

device_label VARCHAR(80) NULL（例：iPhone 15 / Pixel 8）

created_at, last_used_at DATETIME

revoked_at DATETIME NULL

created_ip VARCHAR(45) NULL

created_ua VARCHAR(255) NULL

索引：

uq_cred_id (credential_id)

idx_user (user_id)

idx_revoked (revoked_at)

2.2 trusted_devices（裝置信任表：支援 E2）

用途：新裝置必須 DEVICE OTP 後才標記為信任；信任後可建立 passkey、可允許快速登入。

建議欄位：

id BIGINT AI PK

user_id BIGINT FK(users.id)

device_id CHAR(64) UNIQUE（伺服器簽名的裝置 token id）

device_fingerprint CHAR(64)（UA+平台+部分特徵 hash；不是完美指紋，但可用於風控比對）

device_label VARCHAR(80) NULL

trusted_at DATETIME NULL

last_seen_at DATETIME NULL

last_ip VARCHAR(45) NULL

last_ua VARCHAR(255) NULL

status ENUM('PENDING','TRUSTED','REVOKED') DEFAULT 'PENDING'

索引：

idx_user_status (user_id, status)

uq_device_id (device_id)

2.3 auth_events（稽核事件表）

用途：稽核與追蹤；可產出報表、調查異常。

建議欄位：

id BIGINT AI PK

ts DATETIME NOT NULL

user_id BIGINT NULL

email VARCHAR(191) NULL

event VARCHAR(40) NOT NULL
例：LOGIN_OK, LOGIN_FAIL, OTP_SENT, OTP_FAIL, PASSKEY_REGISTER_OK, PASSKEY_LOGIN_OK, QR_ISSUED, QR_CONSUMED, RISK_BLOCK

ip VARCHAR(45) NULL

ua VARCHAR(255) NULL

risk_score INT DEFAULT 0

detail_json JSON（原因/參數/錯誤碼/封鎖規則等）

索引：

idx_ts (ts)

idx_user_ts (user_id, ts)

idx_event_ts (event, ts)

2.4 qr_login_sessions（桌機 QR 登入用）

用途：桌機顯示 QR；手機掃描後授權；桌機輪詢取得登入結果。

建議欄位：

id BIGINT AI PK

challenge CHAR(64) UNIQUE（隨機字串）

status ENUM('PENDING','APPROVED','EXPIRED','CONSUMED') DEFAULT 'PENDING'

created_at DATETIME

expires_at DATETIME（建議 2~3 分鐘）

approved_at DATETIME NULL

consumed_at DATETIME NULL

approved_user_id BIGINT NULL

desktop_ip VARCHAR(45) NULL

desktop_ua VARCHAR(255) NULL

approved_ip VARCHAR(45) NULL

approved_ua VARCHAR(255) NULL

索引：

uq_challenge (challenge)

idx_status_exp (status, expires_at)

3. API 端點規格（REST）

延續你目前 /api/auth/* 風格，並沿用 json_success/json_error 格式。

3.1 Passkeys（WebAuthn）註冊流程

(1) 取得註冊 options

POST /api/auth/webauthn/register_options

需登入（session）

輸出：publicKeyCredentialCreationOptions（JSON）

後端必做：

產生 challenge（隨機）

存 challenge 到 $_SESSION['webauthn_reg_chal'] 或 DB（建議 session + TTL）

rpId、rpName、user.id、user.name、user.displayName

excludeCredentials：該 user 已有的 credential_id

(2) 提交 attestation

POST /api/auth/webauthn/register_verify

需登入

內容：前端 navigator.credentials.create() 回傳的 credential

後端驗證：

challenge 必須匹配 session

origin/rpIdHash 必須匹配網域

驗證 attestation（可用 WebAuthn library）

成功：寫入 webauthn_credentials

稽核事件：

PASSKEY_REGISTER_OK/FAIL

3.2 Passkeys（WebAuthn）登入流程（手機/桌機皆可）

(1) 取得登入 options

POST /api/auth/webauthn/login_options

不需登入（因為是登入用）

輸出：publicKeyCredentialRequestOptions（JSON）

allowCredentials：可選（若輸入 email 可限制；若不輸入則提供 discoverable login）

(2) 提交 assertion

POST /api/auth/webauthn/login_verify

內容：navigator.credentials.get() 回傳的 assertion

後端驗證：

challenge/session

origin/rpId

signature

找到 credential_id 對應的 user_id

成功：建立 session（同你 login.php），並更新 last_login_at / auth_events

3.3 新裝置 OTP（E2）支援（DEVICE）

這一段你在「文件一」已定義，此處補足與 Passkeys 的關係。

POST /api/auth/device_otp_request（登入後，若判定新裝置）

POST /api/auth/device_otp_verify（成功後，把 trusted_devices.status=TRUSTED）

關鍵規則：

未 TRUSTED 的裝置：不得直接啟用/使用 passkey（你要的 E2 核心）

已 TRUSTED：允許 webauthn/register_options

3.4 桌機 QR 登入（Q1）

(1) 桌機建立 QR session

POST /api/auth/qr/create

回：challenge, expires_at, qr_url（例如 /qr/approve?c=... 或 custom scheme）

(2) 桌機輪詢狀態

GET /api/auth/qr/poll?c=...

回：

PENDING：{status:'PENDING'}

APPROVED：回一次性 login_token（短 TTL，1 次使用）

EXPIRED/CONSUMED：顯示失效

(3) 手機掃描 QR 後授權

手機打開 qr_url

若手機未登入：導到 /login（帳密或 passkey）

登入後顯示「是否允許桌機登入」畫面

手機按「允許」→ POST /api/auth/qr/approve（需登入）

後端把 qr_login_sessions 設為 APPROVED 並生成 login_token

(4) 桌機用 login_token 完成登入

POST /api/auth/qr/consume

內容：challenge + login_token

後端：

驗證 token 與 challenge、未過期、未 consumed

建立桌機 session

將狀態改 CONSUMED

回 redirect /app

稽核事件：

QR_ISSUED, QR_APPROVED, QR_CONSUMED, QR_EXPIRED

4. 風控策略（IP / 地區 / 次數限制）
4.1 風控適用點

登入：/api/auth/login、webauthn/login_verify、qr/consume

OTP：register_request, forgot_request, device_otp_request + 各 verify

QR：qr/create, qr/poll, qr/approve, qr/consume

4.2 基礎規則（Level 2 最小可落地）

R1：每 IP 限流（滑動窗）

5 分鐘內：

login fail ≤ 10 次（超過 → 429 + 冷卻 10 分鐘）

OTP request ≤ 5 次

OTP verify fail ≤ 10 次（OTP fail_count 之外再加 IP 維度）

R2：每 Email 限流

10 分鐘內 OTP request ≤ 3 次（REGISTER/RESET/DEVICE 各自計或共用總額）

OTP verify fail_count ≥5：該 OTP 作廢，強制重發

R3：異常地區/ASN（可選但建議）

若你不打算接第三方 GeoIP：先做「IP 變動幅度」的弱判定

例如：同帳號 10 分鐘內 IP 變更過大 + UA 改變 → risk_score +20

若要 GeoIP：以 MaxMind GeoLite2（本地庫）推國別/城市，異常則要求 DEVICE OTP 或拒絕

R4：帳號狀態

users.status=SUSPENDED：拒絕所有登入與 OTP 動作

R5：管理者行為稽核

管理者刪除/停權/重置：寫 auth_events 或 admin_events（必存 IP/UA/target_user_id）

4.3 風控執行結果（回應格式）

一律回你現行 JSON 格式：

json_error('請稍後再試', 429, 'RATE_LIMIT')

同時寫入 auth_events：event='RISK_BLOCK' detail_json={rule, window, counts}

5. 使用者流程圖（文字版，Q1）
5.1 手機：首次帳密 → 引導 Passkeys
[手機] /login 帳密登入成功
  -> 判斷 trusted_device?
     - 若否：走 DEVICE OTP（E2），成功後標記 TRUSTED
  -> 顯示「啟用 Face ID/指紋（Passkeys）」引導
     - 成功：webauthn_credentials 新增一筆
  -> 後續可用 Passkeys 直接登入

5.2 新裝置（E2）
[新手機] /login
  -> 不允許直接 Passkeys（或 UI 不顯示快速登入）
  -> 必須帳密登入
  -> 觸發 DEVICE OTP 寄信
  -> OTP 成功 -> trusted_devices=TRUSTED
  -> 立刻引導建立 Passkeys

5.3 桌機 QR 登入（Q1）
[桌機] /login 顯示「用手機掃碼登入」
  -> 桌機呼叫 qr/create 取得 challenge -> 顯示 QR
  -> 手機掃 QR -> 進 /qr/approve?c=...
     -> 手機若未登入：先登入（帳密或 Passkeys）
     -> 手機按「允許此桌機登入」
  -> 桌機輪詢 qr/poll
     -> APPROVED 拿到 login_token
  -> 桌機呼叫 qr/consume 完成登入

6. UI/UX 規格（稽核可用）
6.1 Login 頁（桌機/手機共用）

帳密登入區

按鈕：

手機：使用 Face ID/指紋登入（僅在已 TRUSTED 或已有可用 passkey 時顯示）

桌機：用手機掃碼登入（顯示 QR modal）

錯誤提示需一致，不洩漏帳號存在與否（至少在 reset/request 做到）

6.2 Passkeys 引導

觸發時機：

(A) 手機首次登入成功 + 裝置已 TRUSTED

(B) 新裝置完成 DEVICE OTP 後立刻引導

可略過，但略過後下次登入仍提示（可加「不再提示」選項，寫入 users 設定欄位）

6.3 裝置管理（可選：管理者/使用者）

使用者頁：列出已綁定 passkeys、已信任裝置，可撤銷

管理者：只需刪除/停權使用者（你要求）

7. 實作限制與注意事項（PHP 8.3 / Hostinger）

WebAuthn 建議用成熟 library（自行驗證風險高）。

HTTPS 必須啟用（WebAuthn 強制）。

Session cookie 必須 Secure + HttpOnly + SameSite=Lax/Strict（至少 Lax）。

QR login 的 login_token 必須：

單次使用、短 TTL（30~60 秒）

只允許對應 challenge 使用

consume 後立即作廢

8. 稽核輸出（你要做安全稽核文件時會用到）
8.1 必備稽核證據

每次登入成功/失敗：時間、帳號、IP、UA、方式（PASSWORD/PASSKEY/QR）

OTP：purpose、sent_at、verified_at、fail_count、IP、UA

Passkey：credential_id、建立時間、最後使用

QR：issued/approved/consumed 全鏈路

8.2 報表範例（之後可做）

最近 7 天：登入失敗最多的 IP、OTP 失敗最多的帳號、QR 登入次數、Passkey 登入占比

被風控封鎖事件列表（rule + counts）