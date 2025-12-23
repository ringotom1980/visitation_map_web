<?php

/**
 * Path: Public/api/auth/device_otp_verify.php
 * 說明: 驗證 DEVICE OTP，成功後標記 trusted_devices
 *
 * 規則（S1 / fail-only）：
 * - 入口先擋已封鎖：OTP_DEVICE_VERIFY_FAIL（IP + IP_EMAIL）
 * - 只有「失敗」才 hit：15 分鐘 5 次，超過封 15 分鐘
 * - OTP token 自身 fail_count >= 5：要求重發
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

require_login();
$user  = current_user();
$email = (string)($user['email'] ?? '');

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
    auth_event('OTP_VERIFY_FAIL', (int)$user['id'], $email, 'DEVICE invalid code format');
    json_error('驗證碼格式不正確（需為 6 位數字）', 400);
}

// 入口先擋已封鎖（不累計）
throttle_assert_not_blocked('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email);
throttle_assert_not_blocked('OTP_DEVICE_VERIFY_FAIL', 'IP', null);

$pdo = db();

try {
    // 找最新未驗證 DEVICE OTP（不在 SQL 先過濾 expires，避免看不到 fail_count 的狀態）
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

        auth_event('OTP_VERIFY_FAIL', (int)$user['id'], $email, 'DEVICE no otp');
        json_error('尚未申請驗證碼或驗證碼已失效，請重新申請', 400);
    }

    $otpId     = (int)$otp['id'];
    $failCount = (int)$otp['fail_count'];

    if ($failCount >= 5) {
        auth_event('OTP_VERIFY_FAIL', (int)$user['id'], $email, 'DEVICE otp fail_count reached');
        json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
    }

    $now = new DateTimeImmutable('now');
    $exp = new DateTimeImmutable((string)$otp['expires_at']);
    if ($now > $exp) {
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP', null, 900, 5, 15);

        auth_event('OTP_VERIFY_FAIL', (int)$user['id'], $email, 'DEVICE expired');
        json_error('驗證碼已過期，請重新申請', 400);
    }

    if (!password_verify($code, (string)$otp['code_hash'])) {
        // OTP token 自身錯誤次數 +1
        $pdo->prepare("UPDATE otp_tokens SET fail_count = fail_count + 1 WHERE id=:id")
            ->execute([':id' => $otpId]);

        // fail-only：只有失敗才 hit（5 次封 15 分鐘）
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_VERIFY_FAIL', 'IP', null, 900, 5, 15);

        auth_event('OTP_VERIFY_FAIL', (int)$user['id'], $email, 'DEVICE otp mismatch');

        if ($failCount + 1 >= 5) {
            json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
        }
        json_error('驗證碼錯誤', 400);
    }

    // 標記 OTP 已驗證
    $pdo->prepare("UPDATE otp_tokens SET verified_at=NOW() WHERE id=:id")
        ->execute([':id' => $otpId]);

    // 取得或建立 device_id（cookie）
    // $deviceId = $_COOKIE['device_id'] ?? '';
    // if ($deviceId === '') {
    //     $deviceId = bin2hex(random_bytes(32));

    //     $isHttps = false;
    //     if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') $isHttps = true;
    //     if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') $isHttps = true;

    //     setcookie('device_id', $deviceId, [
    //         'expires'  => time() + 86400 * 365,
    //         'path'     => '/',
    //         'secure'   => $isHttps,     // ✅ 不要硬寫 true
    //         'httponly' => true,
    //         'samesite' => 'Lax',
    //     ]);
    // }
    $deviceId = (string)($_COOKIE['device_id'] ?? '');
    if ($deviceId === '') {
        // ❗ 裝置驗證階段禁止產生新 device_id
        auth_event('DEVICE_VERIFY_FAIL', (int)$user['id'], $email, 'missing device_id cookie');
        json_error('裝置識別資訊遺失，請重新登入以完成裝置驗證', 400);
    }

    // fingerprint（建議至少納入 UA；你要更嚴謹可加 Accept-Language、平台等）
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $fingerprint = hash('sha256', $ua);

    // upsert trusted_devices
    $stmt = $pdo->prepare("
    INSERT INTO trusted_devices
      (user_id, device_id, device_fingerprint, status, trusted_at, last_seen_at, last_ip, last_ua)
    VALUES
      (:uid, :did, :fp, 'TRUSTED', NOW(), NOW(), :ip_ins, :ua_ins)
    ON DUPLICATE KEY UPDATE
      status='TRUSTED',
      trusted_at=IFNULL(trusted_at, NOW()),
      last_seen_at=NOW(),
      last_ip=:ip_upd,
      last_ua=:ua_upd
");
    $stmt->execute([
        ':uid'    => (int)$user['id'],
        ':did'    => $deviceId,
        ':fp'     => $fingerprint,
        ':ip_ins' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':ua_ins' => $ua,
        ':ip_upd' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':ua_upd' => $ua,
    ]);

    auth_event('OTP_VERIFY_OK', (int)$user['id'], $email, 'DEVICE');
    json_success(['trusted' => true]);
} catch (Throwable $e) {

    // ❗ catch 內禁止 throttle_hit / throttle_check
    auth_event(
        'OTP_VERIFY_FAIL',
        (int)$user['id'],
        $email,
        'DEVICE exception: ' . $e->getMessage()
    );

    json_error('系統忙碌中，請稍後再試。', 500);
}
