<?php
/**
 * Path: scripts/cron_cleanup_auth.php
 * 說明:
 * - 清理 auth_events（只保留 90 天）
 * - 清理 otp_tokens（刪除已過期 + 多留 1 天）
 *
 * 注意：
 * - 僅供 CLI cron 使用
 * - 不輸出任何內容（避免寄信）
 */

declare(strict_types=1);

// === 載入 DB（用你現有的設定） ===
$pdo = require __DIR__ . '/../config/db.php';

// === 1) 清理 auth_events（90 天） ===
$sqlAuthEvents = "
  DELETE FROM auth_events
  WHERE ts < NOW() - INTERVAL 90 DAY
";
$pdo->exec($sqlAuthEvents);

// === 2) 清理 otp_tokens（過期 + 1 天緩衝） ===
$sqlOtpTokens = "
  DELETE FROM otp_tokens
  WHERE expires_at < NOW() - INTERVAL 1 DAY
";
$pdo->exec($sqlOtpTokens);

// === 結束（不 echo） ===
exit(0);
