# Login Flow

現行登入流程：

1. 使用者以 Email 與密碼登入。
2. 註冊與忘記密碼使用 Email OTP。
3. 裝置 OTP 預設關閉，可用 `.env` 的 `AUTH_DEVICE_OTP_ENABLED=true` 重新啟用。
4. QR Code 登入已不列入需求。

使用者登入後由 PHP session 維持狀態。前端 POST API 會自動帶 `X-CSRF-Token`。
