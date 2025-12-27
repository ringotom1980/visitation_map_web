<?php

/**
 * Path: Public/api/auth/login.php
 * 說明: 使用者登入 API（POST /api/auth/login）
 *
 * 方案 B（根修）：
 * - 若需要 DEVICE OTP：不建立正式 session（不寫 user_id）
 * - 改寫入 preauth（暫存 uid/email/role/org/return_to）
 * - OTP 驗證成功後才建立正式 session
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

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

throttle_assert_not_blocked('LOGIN_FAIL', 'IP_EMAIL', $email);
throttle_assert_not_blocked('LOGIN_FAIL', 'IP', null);

$pdo = db();

function compute_device_fingerprint(): string
{
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    return hash('sha256', $ua);
}

/**
 * 共用：送 DEVICE OTP（登入流程用）
 * 這段保留你原本邏輯（只挪到方案 B）
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
            ':ttl'   => 10,
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

    // 更新最後登入時間（稽核必要）
    try {
        $stmt = $pdo->prepare("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = :id");
        $stmt->execute([':id' => (int)$user['id']]);
    } catch (Throwable $e) {}

    $fingerprint = compute_device_fingerprint();

    $stmt = $pdo->prepare("
        SELECT id
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

    // 你原本的 redirect 規則（ADMIN → /admin，其它 → /app）
    $finalRedirect = ((string)$user['role'] === 'ADMIN') ? route_url('admin') : route_url('app');

    if (!$isTrusted) {
        // ===== 方案 B：不建立正式 session，只建立 preauth =====
        session_regenerate_id(true);

        // 清掉任何舊的正式登入痕跡（保險）
        unset($_SESSION['user_id'], $_SESSION['role'], $_SESSION['org_id']);

        $_SESSION['preauth'] = [
            'uid' => (int)$user['id'],
            'email' => (string)$user['email'],
            'role' => (string)$user['role'],
            'org_id' => (int)$user['organization_id'],
            'return_to' => $finalRedirect,
            'created_at' => time(),
        ];

        // 送 OTP
        send_device_otp_for_login($pdo, (int)$user['id'], (string)$user['email']);

        auth_event('LOGIN_OK_NEED_DEVICE_VERIFY', (int)$user['id'], (string)$user['email'], 'need device verify (preauth)');

        json_success([
            'need_device_verify' => true,
            'redirect'           => route_url('device-verify') . '?return=' . rawurlencode($finalRedirect),
        ]);
    }

    // ===== 已 TRUSTED：才建立正式 session =====
    session_regenerate_id(true);
    unset($_SESSION['preauth']); // 重要：避免殘留
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['role']    = (string)$user['role'];
    $_SESSION['org_id']  = (int)$user['organization_id'];

    auth_event('LOGIN_OK', (int)$user['id'], (string)$user['email'], 'ok');

    json_success([
        'id'              => (int)$user['id'],
        'name'            => (string)$user['name'],
        'email'           => (string)$user['email'],
        'role'            => (string)$user['role'],
        'organization_id' => (int)$user['organization_id'],
        'redirect'        => $finalRedirect,
    ]);
} catch (Throwable $e) {
    throttle_hit('LOGIN_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
    throttle_hit('LOGIN_FAIL', 'IP', null, 900, 5, 15);

    auth_event('LOGIN_FAIL', null, $email ?: null, 'exception');
    json_error('系統忙碌中，請稍後再試。', 500);
}
