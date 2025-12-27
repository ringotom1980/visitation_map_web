<?php

/**
 * Path: Public/api/auth/device_otp_verify.php
 * 說明: 驗證 DEVICE OTP
 *
 * 方案 B（根修）：
 * - 入口 require_preauth（尚未正式登入）
 * - OTP 成功後才建立正式 session
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

$pre = require_preauth();
$email = (string)($pre['email'] ?? '');

$input = $_POST;
if (empty($input)) {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $json = json_decode($raw, true);
        if (is_array($json)) $input = $json;
    }
}

$code = trim((string)($input['code'] ?? ''));

if ($code === '') json_error('請輸入驗證碼', 400);
if (!preg_match('/^\d{6}$/', $code)) {
    auth_event('OTP_VERIFY_FAIL', (int)$pre['uid'], $email, 'DEVICE invalid code format');
    json_error('驗證碼格式不正確（需為 6 位數字）', 400);
}

throttle_assert_not_blocked('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email);
throttle_assert_not_blocked('OTP_DEVICE_VERIFY_FAIL', 'IP', null);

$pdo = db();

function compute_device_fingerprint(): string
{
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    return hash('sha256', $ua);
}

try {
    $stmt = $pdo->prepare("
        SELECT id, code_hash, expires_at, fail_count
        FROM otp_tokens
        WHERE purpose='DEVICE'
          AND email=:email
          AND verified_at IS NULL
        ORDER BY id DESC
        LIMIT 1
    ");
    $stmt->execute([':email' => $email]);
    $otp = $stmt->fetch();

    if (!$otp) {
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP', null, 900, 5, 15);

        auth_event('OTP_VERIFY_FAIL', (int)$pre['uid'], $email, 'DEVICE no otp');
        json_error('尚未申請驗證碼或驗證碼已失效，請重新申請', 400);
    }

    $otpId     = (int)$otp['id'];
    $failCount = (int)$otp['fail_count'];

    if ($failCount >= 5) {
        auth_event('OTP_VERIFY_FAIL', (int)$pre['uid'], $email, 'DEVICE otp fail_count reached');
        json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
    }

    $now = new DateTimeImmutable('now');
    $exp = new DateTimeImmutable((string)$otp['expires_at']);
    if ($now > $exp) {
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP', null, 900, 5, 15);

        auth_event('OTP_VERIFY_FAIL', (int)$pre['uid'], $email, 'DEVICE expired');
        json_error('驗證碼已過期，請重新申請', 400);
    }

    if (!password_verify($code, (string)$otp['code_hash'])) {
        $pdo->prepare("UPDATE otp_tokens SET fail_count = fail_count + 1 WHERE id=:id")
            ->execute([':id' => $otpId]);

        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP', null, 900, 5, 15);

        auth_event('OTP_VERIFY_FAIL', (int)$pre['uid'], $email, 'DEVICE otp mismatch');

        if ($failCount + 1 >= 5) json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
        json_error('驗證碼錯誤', 400);
    }

    $pdo->prepare("UPDATE otp_tokens SET verified_at=NOW() WHERE id=:id")
        ->execute([':id' => $otpId]);

    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $fingerprint = compute_device_fingerprint();

    $stmt = $pdo->prepare("
        INSERT INTO trusted_devices
          (user_id, device_fingerprint, status, trusted_at, last_seen_at, last_ip, last_ua)
        VALUES
          (:uid, :fp, 'TRUSTED', NOW(), NOW(), :ip_ins, :ua_ins)
        ON DUPLICATE KEY UPDATE
          status='TRUSTED',
          trusted_at=IFNULL(trusted_at, NOW()),
          last_seen_at=NOW(),
          last_ip=:ip_upd,
          last_ua=:ua_upd
    ");
    $stmt->execute([
        ':uid'    => (int)$pre['uid'],
        ':fp'     => $fingerprint,
        ':ip_ins' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':ua_ins' => $ua !== '' ? mb_substr($ua, 0, 255, 'UTF-8') : null,
        ':ip_upd' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':ua_upd' => $ua !== '' ? mb_substr($ua, 0, 255, 'UTF-8') : null,
    ]);

    // ✅ 方案 B：OTP 成功後才建立正式 session
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$pre['uid'];
    $_SESSION['role']    = (string)$pre['role'];
    $_SESSION['org_id']  = (int)$pre['org_id'];

    // 清掉 preauth，避免殘留導致你說的「黏住 device-verify」
    clear_preauth();

    auth_event('OTP_VERIFY_OK', (int)$pre['uid'], $email, 'DEVICE');
    json_success(['trusted' => true]);

} catch (Throwable $e) {
    auth_event('OTP_VERIFY_FAIL', (int)$pre['uid'], $email, 'DEVICE exception: ' . $e->getMessage());
    json_error('系統忙碌中，請稍後再試。', 500);
}
