<?php

/**
 * Path: Public/api/auth/login.php
 * 說明: 使用者登入 API（POST /api/auth/login）
 *
 * 節流策略（方案A / fail-only）：
 * - 入口先擋封鎖（不累計）：throttle_assert_not_blocked(LOGIN_FAIL, IP_EMAIL / IP)
 * - 只在失敗時累計：throttle_hit(LOGIN_FAIL, IP_EMAIL / IP)
 *
 * 裝置驗證（E2 DEVICE OTP / 定版：以 device_fingerprint 判斷環境）：
 * - 帳密正確後先查 trusted_devices(user_id + fingerprint)
 * - 未 TRUSTED：送 DEVICE OTP，回 need_device_verify=true + redirect=/device-verify
 * - 已 TRUSTED：才建立正式登入 session，回 redirect=/app or /admin
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

// 支援 JSON 或 form-data
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

/**
 * 入口先擋封鎖（不累計）
 * - IP_EMAIL：防同一帳號被暴力嘗試
 * - IP：防換 email 洗 requests
 */
throttle_assert_not_blocked('LOGIN_FAIL', 'IP_EMAIL', $email);
throttle_assert_not_blocked('LOGIN_FAIL', 'IP', null);

$pdo = db();

/**
 * 共用：計算 device_fingerprint（定版：UA sha256）
 */
function compute_device_fingerprint(): string
{
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    return hash('sha256', $ua);
}

/**
 * 共用：送 DEVICE OTP（登入流程用）
 * - request 節流：OTP_DEVICE_REQ（IP_EMAIL + IP）→ 15 分鐘 5 次（超過封 15 分鐘）
 * - fail-only：OTP_DEVICE_REQ_FAIL（只在寄信失敗/例外時 hit；入口先 assert_not_blocked）
 */
function send_device_otp_for_login(PDO $pdo, int $uid, string $email): void
{
    throttle_assert_not_blocked('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email);
    throttle_assert_not_blocked('OTP_DEVICE_REQ_FAIL', 'IP', null);

    throttle_check('OTP_DEVICE_REQ', 'IP_EMAIL', $email, 900, 5, 15);
    throttle_check('OTP_DEVICE_REQ', 'IP', null, 900, 5, 15);

    $otpTtlMin = 10;

    $gen_otp_6 = function (): string {
        $n = random_int(0, 999999);
        return str_pad((string)$n, 6, '0', STR_PAD_LEFT);
    };

    $send_mail = function (string $toEmail, string $otp): bool {
        $fromName  = '遺眷親訪地圖系統';
        $fromEmail = 'system_mail_noreply@ml.jinghong.pw';
        $subject   = '裝置驗證碼（10 分鐘內有效）';

        $body = "您好，\n\n"
            . "您正在進行「遺眷親訪地圖系統」裝置驗證。\n\n"
            . "您的驗證碼（OTP）：{$otp}\n"
            . "有效時間：10 分鐘\n\n"
            . "若非本人操作，請忽略此信。\n\n"
            . "— 遺眷親訪地圖系統\n";

        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

        $headers = [];
        $headers[] = 'From: ' . mb_encode_mimeheader($fromName, 'UTF-8') . " <{$fromEmail}>";
        $headers[] = 'MIME-Version: 1.0';
        $headers[] = 'Content-Type: text/plain; charset=UTF-8';
        $headers[] = 'Content-Transfer-Encoding: 8bit';

        return mail($toEmail, $encodedSubject, $body, implode("\r\n", $headers));
    };

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            DELETE FROM otp_tokens
            WHERE purpose='DEVICE' AND email=:email AND verified_at IS NULL
        ");
        $stmt->execute([':email' => $email]);

        $otp     = $gen_otp_6();
        $otpHash = password_hash($otp, PASSWORD_DEFAULT);

        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;

        $stmt = $pdo->prepare("
            INSERT INTO otp_tokens
              (purpose, email, code_hash, expires_at, sent_at, fail_count, verified_at, created_ip, created_ua)
            VALUES
              ('DEVICE', :email, :hash, DATE_ADD(NOW(), INTERVAL :ttl MINUTE), NOW(), 0, NULL, :ip, :ua)
        ");
        $stmt->execute([
            ':email' => $email,
            ':hash'  => $otpHash,
            ':ttl'   => $otpTtlMin,
            ':ip'    => $ip,
            ':ua'    => $ua ? mb_substr($ua, 0, 255, 'UTF-8') : null,
        ]);

        $ok = $send_mail($email, $otp);
        if (!$ok) {
            $pdo->rollBack();

            throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
            throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP', null, 900, 5, 15);

            auth_event('DEVICE_OTP_FAIL', $uid, $email, 'mail send failed (login flow)');
            json_error('寄送裝置驗證碼失敗，請稍後再試', 500);
        }

        $pdo->commit();

        auth_event('DEVICE_OTP_SENT', $uid, $email, 'otp sent (login flow)');
        return;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();

        throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP', null, 900, 5, 15);

        auth_event('DEVICE_OTP_FAIL', $uid, $email, 'exception (login flow)');
        json_error('系統忙碌中，請稍後再試。', 500);
    }
}

try {
    // ===== 查使用者 =====
    $sql = 'SELECT id, name, email, phone, organization_id, role, status, password_hash
            FROM users
            WHERE email = :email
            LIMIT 1';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if (!$user) {
        throttle_hit('LOGIN_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('LOGIN_FAIL', 'IP', null, 900, 5, 15);

        auth_event('LOGIN_FAIL', null, $email, 'bad credentials (no user)');
        json_error('帳號或密碼錯誤', 400);
    }

    if (($user['status'] ?? '') !== 'ACTIVE') {
        auth_event('LOGIN_FAIL', (int)$user['id'], $email, 'inactive or suspended');
        json_error('帳號尚未啟用或已停權', 403);
    }

    if (!password_verify($password, (string)$user['password_hash'])) {
        throttle_hit('LOGIN_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('LOGIN_FAIL', 'IP', null, 900, 5, 15);

        auth_event('LOGIN_FAIL', (int)$user['id'], $email, 'bad credentials (pw mismatch)');
        json_error('帳號或密碼錯誤', 400);
    }

    // ===== 先算 fingerprint + 判斷 trusted（只做一次）=====
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

    // ===== 未 TRUSTED → 送 OTP + 進 device-verify =====
    if (!$isTrusted) {
        // 用 session 綁住這次要驗證的 email（給 device_otp_verify.php 用）
        $_SESSION['device_otp_email'] = (string)$user['email'];

        send_device_otp_for_login($pdo, (int)$user['id'], (string)$user['email']);

        auth_event('LOGIN_OK_NEED_DEVICE_VERIFY', (int)$user['id'], (string)$user['email'], 'need device verify');

        $return = ((string)$user['role'] === 'ADMIN') ? '/admin' : '/app';

        json_success([
            'need_device_verify' => true,
            'redirect'           => route_url('device-verify') . '?return=' . rawurlencode($return),
        ]);
    }

    // ===== 已 TRUSTED → 才建立正式登入 session =====
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['role']    = (string)$user['role'];
    $_SESSION['org_id']  = (int)$user['organization_id'];

    // ✅ 更新最後登入時間（稽核必要）
    try {
        $stmt = $pdo->prepare("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = :id");
        $stmt->execute([':id' => (int)$user['id']]);
    } catch (Throwable $e) {
        // 不阻斷登入
    }

    auth_event('LOGIN_OK', (int)$user['id'], (string)$user['email'], 'ok');

    $redirect = ((string)$user['role'] === 'ADMIN')
        ? route_url('admin')
        : route_url('app');

    json_success([
        'id'              => (int)$user['id'],
        'name'            => (string)$user['name'],
        'email'           => (string)$user['email'],
        'role'            => (string)$user['role'],
        'organization_id' => (int)$user['organization_id'],
        'redirect'        => $redirect,
    ]);
} catch (Throwable $e) {
    throttle_hit('LOGIN_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
    throttle_hit('LOGIN_FAIL', 'IP', null, 900, 5, 15);

    auth_event('LOGIN_FAIL', null, $email ?: null, 'exception');
    json_error('系統忙碌中，請稍後再試。', 500);
}
