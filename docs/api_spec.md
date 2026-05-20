# API Notes

本專案已移除 QR Code 登入規劃。現行登入採 Email/密碼、Email OTP 註冊與忘記密碼流程。

目前主要 API：

- `/api/auth/*`: 登入、登出、註冊 OTP、忘記密碼 OTP。
- `/api/places/*`: 地圖點位新增、讀取、更新、軟刪除。
- `/api/filters/options`: 篩選選項。
- `/api/routing/route`: openrouteservice 道路路線。
- `/api/admin/*`: 管理後台使用者、安全紀錄、統計。

所有 POST API 需帶 `X-CSRF-Token` header，由 `Public/assets/js/api.js` 自動加入。
