<?php

/**
 * Path: Public/api/auth/device_otp_verify.php
 * 說明: 驗證 DEVICE OTP（登入前流程，定版）
 *
 * 規則：
 * - OTP 階段禁止 require_login（尚未正式登入）
 * - 唯一身分來源：$_SESSION['device_otp_email']
 * - 成功後：
 *   1) 標記 otp_tokens.verified_at
 *   2) upsert trusted_devices (user_id + device_fingerprint)
 *   3) 建立正式登入 session（user_id/role/org_id）
 *   4) 清掉 device_otp_email
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

// ===== 讀取輸入 =====
$input = $_POST;
if (empty($input)) {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $json = json_decode($raw, true);
        if (is_array($json)) $input = $json;
    }
}

$code = trim((string)($input['code'] ?? ''));

if ($code === '') {
    json_error('請輸入驗證碼', 400);
}
if (!preg_match('/^\d{6}$/', $code)) {
    json_error('驗證碼格式不正確（需為 6 位數字）', 400);
}

// ===== 唯一身分來源 =====
$email = $_SESSION['device_otp_email'] ?? null;
if (!$email || !is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_error('驗證狀態已失效，請重新登入', 401);
}

$pdo = db();

/**
 * 共用：計算 device_fingerprint（與 login.php 完全一致）
 */
function compute_device_fingerprint(): string
{
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    return hash('sha256', $ua);
}

try {
    // ===== 節流：入口先擋（不累計）=====
    throttle_assert_not_blocked('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email);
    throttle_assert_not_blocked('OTP_DEVICE_VERIFY_FAIL', 'IP', null);

    // ===== 找「這個 email」最新未驗證 DEVICE OTP + 同時取 user 資訊 =====
    $stmt = $pdo->prepare("
        SELECT
            t.id         AS otp_id,
            t.code_hash,
            t.expires_at,
            t.fail_count,
            u.id         AS user_id,
            u.role       AS user_role,
            u.organization_id AS org_id
        FROM otp_tokens t
        JOIN users u ON u.email = t.email
        WHERE t.purpose = 'DEVICE'
          AND t.email = :email
          AND t.verified_at IS NULL
        ORDER BY t.id DESC
        LIMIT 1
    ");
    $stmt->execute([':email' => $email]);
    $row = $stmt->fetch();

    if (!$row) {
        json_error('驗證狀態已失效，請重新登入', 401);
    }

    $otpId     = (int)$row['otp_id'];
    $uid       = (int)$row['user_id'];
    $role      = (string)($row['user_role'] ?? '');
    $orgId     = (int)($row['org_id'] ?? 0);
    $failCount = (int)$row['fail_count'];

    if ($uid <= 0) {
        json_error('驗證狀態已失效，請重新登入', 401);
    }

    if ($failCount >= 5) {
        json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
    }

    $now = new DateTimeImmutable('now');
    $exp = new DateTimeImmutable((string)$row['expires_at']);
    if ($now > $exp) {
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP', null, 900, 5, 15);
        json_error('驗證碼已過期，請重新申請', 400);
    }

    if (!password_verify($code, (string)$row['code_hash'])) {
        $pdo->prepare("UPDATE otp_tokens SET fail_count = fail_count + 1 WHERE id = :id")
            ->execute([':id' => $otpId]);

        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP', null, 900, 5, 15);

        if ($failCount + 1 >= 5) {
            json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
        }
        json_error('驗證碼錯誤', 400);
    }

    // ===== 重要：用交易保證「OTP標記 + trusted_devices + 建 session」一致 =====
    $pdo->beginTransaction();

    // 1) 標記 OTP 已驗證
    $pdo->prepare("UPDATE otp_tokens SET verified_at = NOW() WHERE id = :id")
        ->execute([':id' => $otpId]);

    // 2) upsert trusted_devices
    $fingerprint = compute_device_fingerprint();
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');

    $stmt = $pdo->prepare("
        INSERT INTO trusted_devices
          (user_id, device_fingerprint, status, trusted_at, last_seen_at, last_ip, last_ua)
        VALUES
          (:uid, :fp, 'TRUSTED', NOW(), NOW(), :ip1, :ua1)
        ON DUPLICATE KEY UPDATE
          status = 'TRUSTED',
          trusted_at = IFNULL(trusted_at, NOW()),
          last_seen_at = NOW(),
          last_ip = :ip2,
          last_ua = :ua2
    ");
    $stmt->execute([
        ':uid' => $uid,
        ':fp'  => $fingerprint,
        ':ip1' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':ua1' => $ua !== '' ? mb_substr($ua, 0, 255, 'UTF-8') : null,
        ':ip2' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':ua2' => $ua !== '' ? mb_substr($ua, 0, 255, 'UTF-8') : null,
    ]);

    $pdo->commit();

    // 3) ✅ 建立正式登入 session（這一步才會終止你現在的 loop）
    session_regenerate_id(true);
    $_SESSION['user_id'] = $uid;
    $_SESSION['role']    = $role;
    $_SESSION['org_id']  = $orgId;

    // 4) 清掉 OTP pending
    unset($_SESSION['device_otp_email']);

    auth_event('OTP_VERIFY_OK', $uid, $email, 'DEVICE');
    json_success([
        'trusted'  => true,
        'redirect' => (strtoupper($role) === 'ADMIN') ? route_url('admin') : route_url('app'),
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
    throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP', null, 900, 5, 15);

    auth_event('OTP_VERIFY_FAIL', null, $email, 'DEVICE exception: ' . $e->getMessage());
    json_error('系統忙碌中，請稍後再試。', 500);
}
