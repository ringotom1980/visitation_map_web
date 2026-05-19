# 登入與裝置驗證

## 目前決策

本系統使用者數少，主要需求是降低頻繁登入造成的不便，而不是高強度風控。因此裝置 Email OTP 預設關閉。

```env
AUTH_DEVICE_OTP_ENABLED=false
```

關閉時：

- `/api/auth/login` 帳密正確後直接建立 session。
- `/app` 不再檢查 `trusted_devices`。
- `device_verify.php` 與相關 API 保留，但不在一般登入流程中觸發。

若日後要重新啟用：

```env
AUTH_DEVICE_OTP_ENABLED=true
```

啟用後，未信任的 User-Agent fingerprint 會被導向 `/device-verify`。此模式目前體驗較差，除非確定需要，否則不建議開啟。
