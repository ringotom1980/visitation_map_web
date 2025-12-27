<?php

/**
 * Path: Public/api/auth/login.php
 * 說明: 使用者登入 API（POST /api/auth/login）
 *
 * 定版原則：
 * - 帳密正確後，先判斷 trusted_devices
 * - 未 TRUSTED → 送 DEVICE OTP + 綁定 session email → 導向 /device-verify
 * - 已 TRUSTED → 才建立登入 session
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

// ===== 讀取輸入（JSON / form-data）=====
$input = $_POST;
if (empty($input)) {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $json = json_decode($raw, true);
        if (is_array($json)) $input = $json;
    }
}

$email    = trim((string)($input['email'] ?? ''));
$password = (string)($input['password'] ?? '');

if ($email === '' || $password === '') {
    auth_event('LOGIN_FAIL', null, $email ?: null, 'missing credentials');
    json_error('請輸入帳號與密碼', 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_event('LOGIN_FAIL', null, $email, 'invalid email format');
    json_error('Email 格式不正確', 400);
}

// ===== 節流：入口先擋（不累計）=====
throttle_assert_not_blocked('LOGIN_FAIL', 'IP_EMAIL', $email);
throttle_assert_not_blocked('LOGIN_FAIL', 'IP', null);

$pdo = db();

/**
 * 共用：計算 device_fingerprint（UA sha256）
 */
function compute_device_fingerprint(): string
{
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    return hash('sha256', $ua);
}

/**
 * 共用：送 DEVICE OTP（登入流程）
 */
function send_device_otp_for_login(PDO $pdo, int $uid, string $email): void
{
    throttle_assert_not_blocked('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email);
    throttle_assert_not_blocked('OTP_DEVICE_REQ_FAIL', 'IP', null);

    throttle_check('OTP_DEVICE_REQ', 'IP_EMAIL', $email, 900, 5, 15);
    throttle_check('OTP_DEVICE_REQ', 'IP', null, 900, 5, 15);

    $otpTtlMin = 10;

    $otp = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $otpHash = password_hash($otp, PASSWORD_DEFAULT);

    $pdo->beginTransaction();

    $pdo->prepare("
        DELETE FROM otp_tokens
        WHERE purpose='DEVICE' AND email=:email AND verified_at IS NULL
    ")->execute([':email' => $email]);

    $pdo->prepare("
        INSERT INTO otp_tokens
          (purpose, email, code_hash, expires_at, sent_at, fail_count, verified_at, created_ip, created_ua)
        VALUES
          ('DEVICE', :email, :hash, DATE_ADD(NOW(), INTERVAL :ttl MINUTE), NOW(), 0, NULL, :ip, :ua)
    ")->execute([
        ':email' => $email,
        ':hash'  => $otpHash,
        ':ttl'   => $otpTtlMin,
        ':ip'    => $_SERVER['REMOTE_ADDR'] ?? null,
        ':ua'    => $_SERVER['HTTP_USER_AGENT'] ?? null,
    ]);

    $ok = mail(
        $email,
        '=?UTF-8?B?' . base64_encode('裝置驗證碼（10 分鐘內有效）') . '?=',
        "您的裝置驗證碼：{$otp}\n有效時間：10 分鐘",
        "Content-Type: text/plain; charset=UTF-8"
    );

    if (!$ok) {
        $pdo->rollBack();
        throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP', null, 900, 5, 15);
        json_error('寄送裝置驗證碼失敗，請稍後再試', 500);
    }

    $pdo->commit();
}

try {
    // ===== 查使用者 =====
    $stmt = $pdo->prepare("
        SELECT id, name, email, role, organization_id, status, password_hash
        FROM users
        WHERE email = :email
        LIMIT 1
    ");
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, (string)$user['password_hash'])) {
        throttle_hit('LOGIN_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('LOGIN_FAIL', 'IP', null, 900, 5, 15);
        auth_event('LOGIN_FAIL', null, $email, 'bad credentials');
        json_error('帳號或密碼錯誤', 400);
    }

    if (($user['status'] ?? '') !== 'ACTIVE') {
        auth_event('LOGIN_FAIL', (int)$user['id'], $email, 'inactive');
        json_error('帳號尚未啟用或已停權', 403);
    }

    // ===== 判斷 trusted =====
    $fingerprint = compute_device_fingerprint();

    $stmt = $pdo->prepare("
        SELECT 1
        FROM trusted_devices
        WHERE user_id = :uid
          AND device_fingerprint = :fp
          AND status = 'TRUSTED'
        LIMIT 1
    ");
    $stmt->execute([
        ':uid' => (int)$user['id'],
        ':fp'  => $fingerprint,
    ]);
    $isTrusted = (bool)$stmt->fetch();

    // ===== 未信任 → OTP =====
    if (!$isTrusted) {
        $_SESSION['device_otp_email'] = (string)$user['email'];

        send_device_otp_for_login($pdo, (int)$user['id'], (string)$user['email']);

        auth_event('LOGIN_OK_NEED_DEVICE_VERIFY', (int)$user['id'], (string)$user['email'], 'need device verify');

        json_success([
            'need_device_verify' => true,
            'redirect'           => route_url('device-verify'),
        ]);
    }

    // ===== 已信任 → 正式登入 =====
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['role']    = (string)$user['role'];
    $_SESSION['org_id']  = (int)$user['organization_id'];

    auth_event('LOGIN_OK', (int)$user['id'], (string)$user['email'], 'ok');

    $redirect = ((string)$user['role'] === 'ADMIN')
        ? route_url('admin')
        : route_url('app');

    json_success([
        'redirect' => $redirect,
    ]);

} catch (Throwable $e) {
    throttle_hit('LOGIN_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
    throttle_hit('LOGIN_FAIL', 'IP', null, 900, 5, 15);
    auth_event('LOGIN_FAIL', null, $email, 'exception: ' . $e->getMessage());
    json_error('系統忙碌中，請稍後再試。', 500);
}
