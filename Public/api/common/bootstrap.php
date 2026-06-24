<?php

/**
 * Path: Public/api/common/bootstrap.php
 * 說明: 所有 API 共用啟動（header、DB、auth、JSON 輸出）
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/app.php';
require_once __DIR__ . '/../../../config/db.php';
require_once __DIR__ . '/../../../config/auth.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function json_success($data = null): void
{
    echo json_encode([
        'success' => true,
        'data'    => $data,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $httpStatus = 400, $code = null): void
{
    http_response_code($httpStatus);
    echo json_encode([
        'success' => false,
        'error'   => [
            'message' => $message,
            'code'    => $code,
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function json_ok($payload = null): void
{
    json_success($payload);
}

function json_fail(string $message, int $httpStatus = 400, $code = null): void
{
    json_error($message, $httpStatus, $code);
}

if (!csrf_validate_request()) {
    json_error('安全驗證已過期，請重新整理頁面後再試。', 419, 'CSRF_INVALID');
}

function is_production_env(): bool
{
    return strtolower((string)APP_ENV) === 'production';
}

function server_error(Throwable $e, string $publicMessage = '系統忙碌中，請稍後再試。'): void
{
    try {
        $errorId = date('YmdHis') . '-' . bin2hex(random_bytes(3));
    } catch (Throwable $ignored) {
        $errorId = date('YmdHis') . '-' . substr(uniqid('', true), -6);
    }

    error_log('[api_error ' . $errorId . '] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());

    if (is_production_env()) {
        json_error($publicMessage . '（錯誤代碼：' . $errorId . '）', 500, 'SERVER_ERROR');
    }

    json_error($publicMessage . ' ' . $e->getMessage(), 500, 'SERVER_ERROR');
}

function is_database_schema_or_permission_error(Throwable $e): bool
{
    $msg = $e->getMessage();
    $code = (string)$e->getCode();

    foreach (['1054', '1142', '1146', '1091', '1060', '42S02', '42S22', '42000'] as $needle) {
        if ($code === $needle || strpos($msg, $needle) !== false) {
            return true;
        }
    }

    foreach (['Unknown column', 'Table', 'command denied', 'ALTER command denied', 'Duplicate column'] as $needle) {
        if (stripos($msg, $needle) !== false) {
            return true;
        }
    }

    return false;
}

function ensure_places_soft_delete_columns(PDO $pdo): void
{
    static $done = false;
    if ($done) return;

    $existing = [];
    $stmt = $pdo->query("SHOW COLUMNS FROM places");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $existing[(string)$row['Field']] = true;
    }

    if (!isset($existing['deleted_at'])) {
        $pdo->exec("ALTER TABLE places ADD COLUMN deleted_at datetime DEFAULT NULL");
    }
    if (!isset($existing['deleted_by_user_id'])) {
        $pdo->exec("ALTER TABLE places ADD COLUMN deleted_by_user_id bigint(20) UNSIGNED DEFAULT NULL");
    }
    if (!isset($existing['deleted_note'])) {
        $pdo->exec("ALTER TABLE places ADD COLUMN deleted_note varchar(255) DEFAULT NULL");
    }

    $done = true;
}

/**
 * 取得登入者（API 用）＋立刻釋放 session lock，避免多支 API 並發互卡
 * - 重要：只要後面不再需要寫 $_SESSION，就要釋放
 */
function require_api_user(): array
{
    $user = current_user();
    if (!$user) {
        json_error('尚未登入', 401);
    }

    // ⭐ 關鍵：釋放 session lock，讓同 session 的其他並發 API 不必排隊
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    return $user;
}

/**
 * 記錄稽核事件（Auth/Security）
 */
function auth_event(string $type, ?int $userId = null, ?string $email = null, ?string $detail = null): void
{
    try {
        $pdo = db();
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;

        $stmt = $pdo->prepare("
            INSERT INTO auth_events (event_type, user_id, email, ip, ua, detail)
            VALUES (:t, :uid, :email, :ip, :ua, :detail)
        ");
        $stmt->execute([
            ':t'      => $type,
            ':uid'    => $userId,
            ':email'  => $email ? mb_substr($email, 0, 191, 'UTF-8') : null,
            ':ip'     => $ip ? mb_substr($ip, 0, 45, 'UTF-8') : null,
            ':ua'     => $ua ? mb_substr($ua, 0, 255, 'UTF-8') : null,
            ':detail' => $detail ? mb_substr($detail, 0, 255, 'UTF-8') : null,
        ]);
    } catch (Throwable $e) {
        // 不阻斷主流程
    }
}

function throttle_keys(string $scope, ?string $email): array
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ip = trim((string)$ip);
    $email = $email ? trim((string)$email) : '';

    $keyIp = '';
    $keyEmail = '';

    if ($scope === 'IP') {
        if ($ip === '') return [null, null]; // key 不足 → 不做節流，避免誤擋
        $keyIp = mb_substr($ip, 0, 45, 'UTF-8');
        $keyEmail = '';
        return [$keyIp, $keyEmail];
    }

    if ($scope === 'EMAIL') {
        if ($email === '') return [null, null];
        $keyIp = '';
        $keyEmail = mb_substr($email, 0, 191, 'UTF-8');
        return [$keyIp, $keyEmail];
    }

    // IP_EMAIL
    if ($ip === '' || $email === '') return [null, null];
    $keyIp = mb_substr($ip, 0, 45, 'UTF-8');
    $keyEmail = mb_substr($email, 0, 191, 'UTF-8');
    return [$keyIp, $keyEmail];
}

/**
 * request 節流/封鎖檢查（每次呼叫都累計）
 * - blocked_until > now() → 擋
 * - window 內 count 累計，超過 maxCount → 封鎖 15 分鐘
 */
function throttle_check(string $action, string $scope, ?string $email = null, int $windowSec = 900, int $maxCount = 5, int $blockMinutes = 15): void
{
    $pdo = db();
    [$keyIp, $keyEmail] = throttle_keys($scope, $email);
    if ($keyIp === null && $keyEmail === null) return;

    $now = new DateTimeImmutable('now');
    $blockMinutes = max(1, min(120, (int)$blockMinutes)); // 1~120 分鐘

    $stmt = $pdo->prepare("
        SELECT id, window_start, window_sec, count, blocked_until
        FROM auth_throttles
        WHERE scope=:scope AND action=:action AND ip = :ip AND email = :email
        LIMIT 1
    ");
    $stmt->execute([
        ':scope'  => $scope,
        ':action' => $action,
        ':ip'     => $keyIp,
        ':email'  => $keyEmail,
    ]);
    $row = $stmt->fetch();

    if ($row) {
        $blockedUntil = $row['blocked_until'] ? new DateTimeImmutable((string)$row['blocked_until']) : null;
        if ($blockedUntil && $blockedUntil > $now) {
            auth_event('RISK_BLOCK', null, $keyEmail, "throttle blocked action={$action}");
            json_error('操作過於頻繁，請稍後再試', 429, 'RATE_LIMIT');
        }

        $ws = new DateTimeImmutable((string)$row['window_start']);
        $sec = (int)$row['window_sec'];
        $wsEnd = $ws->add(new DateInterval('PT' . $sec . 'S'));

        if ($wsEnd < $now) {
            $stmt = $pdo->prepare("
                UPDATE auth_throttles
                SET window_start=NOW(), window_sec=:sec, count=1, blocked_until=NULL
                WHERE id=:id
            ");
            $stmt->execute([':sec' => $windowSec, ':id' => (int)$row['id']]);
            return;
        }

        $newCount = (int)$row['count'] + 1;

        if ($newCount >= $maxCount) {
            $stmt = $pdo->prepare("
                UPDATE auth_throttles
                SET count=:c, blocked_until=DATE_ADD(NOW(), INTERVAL :bm MINUTE)
                WHERE id=:id
            ");
            $stmt->execute([':c' => $newCount, ':bm' => $blockMinutes, ':id' => (int)$row['id']]);

            auth_event('RISK_BLOCK', null, $keyEmail, "throttle exceeded action={$action}");
            json_error("嘗試次數過多，已暫時封鎖 {$blockMinutes} 分鐘", 429, 'RATE_LIMIT');
        }

        $stmt = $pdo->prepare("UPDATE auth_throttles SET count=:c WHERE id=:id");
        $stmt->execute([':c' => $newCount, ':id' => (int)$row['id']]);
        return;
    }

    $stmt = $pdo->prepare("
        INSERT INTO auth_throttles (scope, action, ip, email, window_start, window_sec, count, blocked_until)
        VALUES (:scope, :action, :ip, :email, NOW(), :sec, 1, NULL)
    ");
    $stmt->execute([
        ':scope'  => $scope,
        ':action' => $action,
        ':ip'     => $keyIp,
        ':email'  => $keyEmail,
        ':sec'    => $windowSec,
    ]);
}

/**
 * 只檢查是否已封鎖（不累計）
 */
function throttle_assert_not_blocked(string $action, string $scope, ?string $email = null): void
{
    $pdo = db();
    [$keyIp, $keyEmail] = throttle_keys($scope, $email);
    if ($keyIp === null && $keyEmail === null) return;

    $stmt = $pdo->prepare("
        SELECT blocked_until
        FROM auth_throttles
        WHERE scope=:scope AND action=:action AND ip = :ip AND email = :email
        LIMIT 1
    ");
    $stmt->execute([
        ':scope'  => $scope,
        ':action' => $action,
        ':ip'     => $keyIp,
        ':email'  => $keyEmail,
    ]);
    $row = $stmt->fetch();

    if ($row && !empty($row['blocked_until'])) {
        $now = new DateTimeImmutable('now');
        $blockedUntil = new DateTimeImmutable((string)$row['blocked_until']);
        if ($blockedUntil > $now) {
            auth_event('RISK_BLOCK', null, $keyEmail, "throttle blocked action={$action}");
            json_error('操作過於頻繁，請稍後再試', 429, 'RATE_LIMIT');
        }
    }
}

/**
 * fail-only：只在失敗時呼叫（窗口內累計；超過門檻才封鎖）
 */
function throttle_hit(string $action, string $scope, ?string $email = null, int $windowSec = 900, int $maxCount = 5, int $blockMinutes = 15): void
{
    // 這裡的邏輯與 throttle_check 幾乎相同，但「不應該被成功路徑呼叫」
    throttle_check($action, $scope, $email, $windowSec, $maxCount, $blockMinutes);
}
