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
    // 讓既有程式碼 json_ok(...) 不會炸；同等於 json_success(...)
    json_success($payload);
}

function json_fail(string $message, int $httpStatus = 400, $code = null): void
{
    // 可選：若你其他檔案有人用 json_fail
    json_error($message, $httpStatus, $code);
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
            ':email'  => $email,
            ':ip'     => $ip ? mb_substr($ip, 0, 45, 'UTF-8') : null,
            ':ua'     => $ua ? mb_substr($ua, 0, 255, 'UTF-8') : null,
            ':detail' => $detail ? mb_substr($detail, 0, 255, 'UTF-8') : null,
        ]);
    } catch (Throwable $e) {
        // 安全事件記錄失敗不應阻斷主流程（避免造成服務不可用）
    }
}

/**
 * 節流/封鎖檢查（最小可用版）
 * - 若 blocked_until > now() → 直接擋
 * - 否則在 window 內累計 count
 */
function throttle_check(string $action, string $scope, ?string $email = null, int $windowSec = 900, int $maxCount = 10): void
{
    $pdo = db();
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $email = $email ? trim($email) : null;

    $keyIp = ($scope === 'IP' || $scope === 'IP_EMAIL') ? ($ip ? mb_substr($ip, 0, 45, 'UTF-8') : null) : null;
    $keyEmail = ($scope === 'EMAIL' || $scope === 'IP_EMAIL') ? ($email ? mb_substr($email, 0, 191, 'UTF-8') : null) : null;

    // 沒有足夠 key 時直接不做（避免誤擋）
    if ($scope === 'IP' && !$keyIp) return;
    if ($scope === 'EMAIL' && !$keyEmail) return;
    if ($scope === 'IP_EMAIL' && (!$keyIp || !$keyEmail)) return;

    $now = new DateTimeImmutable('now');
    $windowStart = $now->sub(new DateInterval('PT' . $windowSec . 'S'))->format('Y-m-d H:i:s');

    // 先讀既有 throttle
    $stmt = $pdo->prepare("
        SELECT id, window_start, window_sec, count, blocked_until
        FROM auth_throttles
        WHERE scope=:scope AND action=:action AND ip <=> :ip AND email <=> :email
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
            auth_event('RISK_BLOCK', null, $email, "throttle blocked action={$action}");
            json_error('操作過於頻繁，請稍後再試', 429);
        }

        // 若窗口已過，重置窗口與計數
        $ws = new DateTimeImmutable((string)$row['window_start']);
        $wsEnd = $ws->add(new DateInterval('PT' . (int)$row['window_sec'] . 'S'));
        if ($wsEnd < $now) {
            $stmt = $pdo->prepare("
                UPDATE auth_throttles
                SET window_start=NOW(), window_sec=:sec, count=1, blocked_until=NULL
                WHERE id=:id
            ");
            $stmt->execute([':sec'=>$windowSec, ':id'=>(int)$row['id']]);
            return;
        }

        // 窗口內累計
        $newCount = (int)$row['count'] + 1;

        // 超過上限 → 封鎖 15 分鐘（可調）
        if ($newCount > $maxCount) {
            $stmt = $pdo->prepare("
                UPDATE auth_throttles
                SET count=:c, blocked_until=DATE_ADD(NOW(), INTERVAL 15 MINUTE)
                WHERE id=:id
            ");
            $stmt->execute([':c'=>$newCount, ':id'=>(int)$row['id']]);

            auth_event('RISK_BLOCK', null, $email, "throttle exceeded action={$action}");
            json_error('嘗試次數過多，已暫時封鎖 15 分鐘', 429);
        }

        $stmt = $pdo->prepare("UPDATE auth_throttles SET count=:c WHERE id=:id");
        $stmt->execute([':c'=>$newCount, ':id'=>(int)$row['id']]);
        return;
    }

    // 沒有 row → 建新紀錄
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
 * 只檢查是否已封鎖（不累計次數）
 * 用途：在流程入口先擋掉 blocked_until 尚未到期的請求
 */
function throttle_assert_not_blocked(string $action, string $scope, ?string $email = null): void
{
    $pdo = db();
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $email = $email ? trim($email) : null;

    $keyIp = ($scope === 'IP' || $scope === 'IP_EMAIL') ? ($ip ? mb_substr($ip, 0, 45, 'UTF-8') : null) : null;
    $keyEmail = ($scope === 'EMAIL' || $scope === 'IP_EMAIL') ? ($email ? mb_substr($email, 0, 191, 'UTF-8') : null) : null;

    // key 不足則不做（避免誤擋）
    if ($scope === 'IP' && !$keyIp) return;
    if ($scope === 'EMAIL' && !$keyEmail) return;
    if ($scope === 'IP_EMAIL' && (!$keyIp || !$keyEmail)) return;

    $stmt = $pdo->prepare("
        SELECT blocked_until
        FROM auth_throttles
        WHERE scope=:scope AND action=:action AND ip <=> :ip AND email <=> :email
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
            auth_event('RISK_BLOCK', null, $email, "throttle blocked action={$action}");
            json_error('操作過於頻繁，請稍後再試', 429, 'RATE_LIMIT');
        }
    }
}

/**
 * 失敗命中：窗口內累計；超過門檻即封鎖 blockMinutes
 * 用途：只在「失敗」時呼叫（例如 LOGIN_FAIL、OTP_VERIFY_FAIL）
 */
function throttle_hit(string $action, string $scope, ?string $email = null, int $windowSec = 900, int $maxCount = 10, int $blockMinutes = 15): void
{
    $pdo = db();
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $email = $email ? trim($email) : null;

    $keyIp = ($scope === 'IP' || $scope === 'IP_EMAIL') ? ($ip ? mb_substr($ip, 0, 45, 'UTF-8') : null) : null;
    $keyEmail = ($scope === 'EMAIL' || $scope === 'IP_EMAIL') ? ($email ? mb_substr($email, 0, 191, 'UTF-8') : null) : null;

    // key 不足則不做（避免誤擋）
    if ($scope === 'IP' && !$keyIp) return;
    if ($scope === 'EMAIL' && !$keyEmail) return;
    if ($scope === 'IP_EMAIL' && (!$keyIp || !$keyEmail)) return;

    $now = new DateTimeImmutable('now');

    // 讀既有
    $stmt = $pdo->prepare("
        SELECT id, window_start, window_sec, count, blocked_until
        FROM auth_throttles
        WHERE scope=:scope AND action=:action AND ip <=> :ip AND email <=> :email
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
        // 若已封鎖 → 直接擋
        if (!empty($row['blocked_until'])) {
            $blockedUntil = new DateTimeImmutable((string)$row['blocked_until']);
            if ($blockedUntil > $now) {
                auth_event('RISK_BLOCK', null, $email, "throttle blocked action={$action}");
                json_error('嘗試次數過多，請稍後再試', 429, 'RATE_LIMIT');
            }
        }

        // 窗口是否已過
        $ws = new DateTimeImmutable((string)$row['window_start']);
        $sec = (int)$row['window_sec'];
        $wsEnd = $ws->add(new DateInterval('PT' . $sec . 'S'));

        if ($wsEnd < $now) {
            // 重置窗口，這次算第 1 次
            $stmt = $pdo->prepare("
                UPDATE auth_throttles
                SET window_start=NOW(), window_sec=:sec, count=1, blocked_until=NULL
                WHERE id=:id
            ");
            $stmt->execute([':sec' => $windowSec, ':id' => (int)$row['id']]);
            return;
        }

        // 窗口內累計
        $newCount = (int)$row['count'] + 1;

        if ($newCount > $maxCount) {
            $stmt = $pdo->prepare("
                UPDATE auth_throttles
                SET count=:c, blocked_until=DATE_ADD(NOW(), INTERVAL {$blockMinutes} MINUTE)
                WHERE id=:id
            ");
            $stmt->execute([':c' => $newCount, ':id' => (int)$row['id']]);

            auth_event('RISK_BLOCK', null, $email, "throttle exceeded action={$action}");
            json_error("嘗試次數過多，已暫時封鎖 {$blockMinutes} 分鐘", 429, 'RATE_LIMIT');
        }

        $stmt = $pdo->prepare("UPDATE auth_throttles SET count=:c WHERE id=:id");
        $stmt->execute([':c' => $newCount, ':id' => (int)$row['id']]);
        return;
    }

    // 沒有 row → 建新紀錄
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
