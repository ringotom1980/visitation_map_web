# API Specification (TODO)
使用者註冊流程修正說明（Email OTP 制）

文件名稱：使用者註冊流程修正說明
版本：v1.1
適用系統：遺眷親訪地圖系統
執行環境：Hostinger（PHP 8.3）
Email 寄送方式：PHP mail()（系統寄信）
生效日期：＿＿＿＿

一、修正目的與適用範圍
1.1 修正目的

本系統原註冊流程包含人工審核機制，為降低行政成本並避免人為風險，調整為：

Email OTP 驗證即完成註冊

移除管理者審核註冊流程

註冊成功後不自動登入，避免 Session 濫用

1.2 適用範圍

本文件僅涵蓋：

使用者註冊流程

Email OTP 驗證（REGISTER）

不包含：

WebAuthn / Passkeys

桌機 QR Code 登入

風控策略

二、註冊欄位定義（全數必填）
欄位	說明
name	使用者姓名
phone	聯絡電話
email	登入帳號（Email）
organization_id	所屬單位
title	職稱
password	登入密碼（雜湊後儲存）
三、OTP 驗證政策（已核定）
項目	設定值
OTP 長度	6 位數字
OTP 有效時間	10 分鐘
最大錯誤次數	5 次
超過錯誤次數	必須重新申請 OTP
OTP 儲存方式	僅儲存雜湊值
四、註冊流程說明（文字流程圖）
使用者填寫註冊資料
        ↓
系統建立 pending_registrations
        ↓
系統發送 Email OTP（REGISTER）
        ↓
使用者輸入 OTP
        ↓
OTP 驗證成功
        ↓
建立 users 帳號（status=ACTIVE）
        ↓
刪除 pending_registrations
        ↓
導向 /login（不自動登入）

五、系統行為與安全說明
5.1 帳號建立時點

僅在 OTP 驗證成功後建立 users

未完成驗證前，系統中不存在有效帳號

5.2 註冊成功後行為

不建立 Session

不自動登入

強制使用者回登入頁重新登入

六、管理者角色說明
行為	是否允許
審核註冊	❌
啟用帳號	❌
停權帳號	✅
刪除帳號	✅
重設密碼	✅
七、稽核摘要（可直接引用）

本系統註冊流程完全以 Email OTP 驗證為帳號啟用依據，
不涉及人工審核或管理者介入。
帳號建立責任點明確，可透過 OTP 紀錄回溯，
符合最小權限與可稽核原則。

🗄️ S2 專用 DB Migration（文件一範圍）

只涵蓋註冊 OTP（REGISTER）
不影響既有 users / user_applications

1️⃣ pending_registrations
CREATE TABLE pending_registrations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  name VARCHAR(50) NOT NULL COMMENT '姓名',
  phone VARCHAR(30) NOT NULL COMMENT '電話',
  email VARCHAR(191) NOT NULL COMMENT 'Email（登入帳號）',
  organization_id BIGINT UNSIGNED NOT NULL COMMENT '所屬單位',
  title VARCHAR(50) NOT NULL COMMENT '職稱',

  password_hash VARCHAR(255) NOT NULL COMMENT '密碼雜湊',

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',

  UNIQUE KEY uq_pending_email (email),
  KEY idx_pending_org (organization_id)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci
COMMENT='註冊暫存帳號（尚未完成 Email OTP）';

2️⃣ otp_tokens（REGISTER 專用）
CREATE TABLE otp_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  purpose ENUM('REGISTER') NOT NULL COMMENT 'OTP 用途',
  email VARCHAR(191) NOT NULL COMMENT '對應 Email',

  code_hash VARCHAR(255) NOT NULL COMMENT 'OTP 雜湊值',

  expires_at DATETIME NOT NULL COMMENT '到期時間',
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '寄送時間',

  fail_count INT NOT NULL DEFAULT 0 COMMENT '錯誤次數',
  verified_at DATETIME DEFAULT NULL COMMENT '驗證完成時間',

  created_ip VARCHAR(45) DEFAULT NULL COMMENT '申請 IP',
  created_ua VARCHAR(255) DEFAULT NULL COMMENT 'User-Agent',

  KEY idx_otp_email (email),
  KEY idx_otp_expires (expires_at)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci
COMMENT='OTP 驗證碼（REGISTER）';

🔌 註冊 API 規格（文件一實作藍圖）
API 1：送出註冊申請 + 寄送 OTP

Endpoint

POST /api/auth/register_request


行為

驗證所有欄位必填

檢查 users.email 與 pending_registrations.email 不可重複

寫入 pending_registrations

建立 otp_tokens (REGISTER)

透過 PHP mail() 寄送 OTP

成功回應

{
  "success": true,
  "data": {
    "message": "驗證碼已寄送至信箱"
  }
}

API 2：驗證 OTP，建立正式帳號

Endpoint

POST /api/auth/register_verify


行為

驗證 OTP 是否存在、未過期、未超次

OTP 正確 → 建立 users (status=ACTIVE)

刪除對應 pending_registrations

標記 otp_tokens.verified_at

成功回應

{
  "success": true,
  "data": {
    "redirect": "/login?applied=1"
  }
}

常見失敗情境（驗收用）
情境	回應
Email 已存在	註冊失敗
OTP 過期	要求重新申請
OTP 錯誤 ≥ 5 次	鎖定本次 OTP
欄位缺漏	回傳欄位錯誤


-- =========================================================
-- S2 註冊 OTP（REGISTER）資料表
-- Migration: 20251220_s2_register_otp
-- DB: u327657097_visitation_map
-- Charset/Collation: utf8mb4 / utf8mb4_unicode_ci
-- =========================================================

START TRANSACTION;

-- ---------------------------------------------------------
-- 1) pending_registrations
-- 註冊暫存（Email OTP 驗證成功後才會寫入 users）
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pending_registrations` (
  `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,

  `name` VARCHAR(50) NOT NULL COMMENT '姓名（必填）',
  `phone` VARCHAR(30) NOT NULL COMMENT '電話（必填）',
  `email` VARCHAR(191) NOT NULL COMMENT 'Email（必填，登入帳號）',
  `organization_id` BIGINT(20) UNSIGNED NOT NULL COMMENT '所屬單位（必填）',
  `title` VARCHAR(50) NOT NULL COMMENT '職稱（必填）',

  `password_hash` VARCHAR(255) NOT NULL COMMENT '密碼雜湊（必填）',

  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pending_email` (`email`),
  KEY `idx_pending_org` (`organization_id`),

  CONSTRAINT `fk_pending_org`
    FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='註冊暫存帳號（尚未完成 Email OTP）';

-- ---------------------------------------------------------
-- 2) otp_tokens (REGISTER)
-- OTP 不存明碼，只存 code_hash
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `otp_tokens` (
  `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,

  `purpose` ENUM('REGISTER') NOT NULL COMMENT 'OTP 用途（目前僅 REGISTER）',
  `email` VARCHAR(191) NOT NULL COMMENT '對應 Email',

  `code_hash` VARCHAR(255) NOT NULL COMMENT 'OTP 雜湊值（不存明碼）',

  `expires_at` DATETIME NOT NULL COMMENT '到期時間（建議 now()+10min）',
  `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '寄送時間',

  `fail_count` INT NOT NULL DEFAULT 0 COMMENT '錯誤次數（>=5 需重發）',
  `verified_at` DATETIME DEFAULT NULL COMMENT '驗證完成時間',

  `created_ip` VARCHAR(45) DEFAULT NULL COMMENT '申請 IP（IPv4/IPv6）',
  `created_ua` VARCHAR(255) DEFAULT NULL COMMENT 'User-Agent',

  PRIMARY KEY (`id`),
  KEY `idx_otp_email` (`email`),
  KEY `idx_otp_expires` (`expires_at`),
  KEY `idx_otp_purpose_email` (`purpose`, `email`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='OTP 驗證碼（REGISTER）';

COMMIT;

-- =========================================================
-- 回滾（需要時再手動執行）
-- =========================================================
-- START TRANSACTION;
-- DROP TABLE IF EXISTS `otp_tokens`;
-- DROP TABLE IF EXISTS `pending_registrations`;
-- COMMIT;
