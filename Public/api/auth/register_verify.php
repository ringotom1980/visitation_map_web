<?php
/**
 * Path: Public/api/auth/register_verify.php
 * 說明: 驗證註冊 OTP → 建立 users（ACTIVE）→ 回 /login?applied=1
 * Method: POST /api/auth/register_verify
 *
 * 規則（方案A / fail-only）：
 * - 入口先擋已封鎖：OTP_REGISTER_VERIFY_FAIL
 * - 只有「失敗」才 hit：15 分鐘 5 次，超過封 15 分鐘
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

$email = trim((string)($input['email'] ?? ''));
$otp   = trim((string)($input['otp'] ?? ''));

if ($email === '' || $otp === '') {
    auth_event('REGISTER_VERIFY_FAIL', null, $email ?: null, 'missing');
    json_error('請輸入 Email 與驗證碼', 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_event('REGISTER_VERIFY_FAIL', null, $email, 'invalid email');
    json_error('Email 格式不正確', 400);
}
if (!preg_match('/^\d{6}$/', $otp)) {
    auth_event('REGISTER_VERIFY_FAIL', null, $email, 'invalid otp format');
    json_error('驗證碼格式不正確（需為 6 位數字）', 400);
}

// 入口先擋已封鎖（不累計）
throttle_assert_not_blocked('OTP_REGISTER_VERIFY_FAIL', 'IP_EMAIL', $email);

$pdo = db();

try {
    $stmt = $pdo->prepare("
        SELECT id, code_hash, expires_at, fail_count
        FROM otp_tokens
        WHERE purpose='REGISTER' AND email=:email AND verified_at IS NULL
        ORDER BY id DESC
        LIMIT 1
    ");
    $stmt->execute([':email' => $email]);
    $row = $stmt->fetch();

    if (!$row) {
        throttle_hit('OTP_REGISTER_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        auth_event('REGISTER_VERIFY_FAIL', null, $email, 'no otp');
        json_error('尚未申請驗證碼或驗證碼已失效，請重新申請', 400);
    }

    $otpId     = (int)$row['id'];
    $expiresAt = (string)$row['expires_at'];
    $failCount = (int)$row['fail_count'];

    if ($failCount >= 5) {
        // 這是 OTP 本身錯誤次數（非節流表），直接擋
        auth_event('REGISTER_VERIFY_FAIL', null, $email, 'otp fail_count reached');
        json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
    }

    $now = new DateTimeImmutable('now');
    $exp = new DateTimeImmutable($expiresAt);
    if ($now > $exp) {
        throttle_hit('OTP_REGISTER_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        auth_event('REGISTER_VERIFY_FAIL', null, $email, 'expired');
        json_error('驗證碼已過期，請重新申請', 400);
    }

    if (!password_verify($otp, (string)$row['code_hash'])) {
        $stmt = $pdo->prepare("UPDATE otp_tokens SET fail_count = fail_count + 1 WHERE id=:id");
        $stmt->execute([':id' => $otpId]);

        throttle_hit('OTP_REGISTER_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        auth_event('REGISTER_VERIFY_FAIL', null, $email, 'otp mismatch');

        if ($failCount + 1 >= 5) {
            json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
        }
        json_error('驗證碼錯誤', 400);
    }

    // 取 pending_registrations
    $stmt = $pdo->prepare("
        SELECT id, name, phone, email, organization_id, title, password_hash
        FROM pending_registrations
        WHERE email = :email
        LIMIT 1
    ");
    $stmt->execute([':email' => $email]);
    $pending = $stmt->fetch();
    if (!$pending) {
        throttle_hit('OTP_REGISTER_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        auth_event('REGISTER_VERIFY_FAIL', null, $email, 'no pending');
        json_error('查無註冊暫存資料，請重新註冊', 400);
    }

    // users 是否已存在（防重）
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    if ($stmt->fetch()) {
        auth_event('REGISTER_VERIFY_FAIL', null, $email, 'already registered');
        json_error('此 Email 已註冊，請直接登入或使用忘記密碼', 409);
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        INSERT INTO users
          (name, phone, email, organization_id, title, role, status, password_hash, last_login_at, created_at, updated_at)
        VALUES
          (:name, :phone, :email, :org_id, :title, 'USER', 'ACTIVE', :pw, NULL, NOW(), NOW())
    ");
    $stmt->execute([
        ':name'   => (string)$pending['name'],
        ':phone'  => (string)$pending['phone'],
        ':email'  => (string)$pending['email'],
        ':org_id' => (int)$pending['organization_id'],
        ':title'  => (string)$pending['title'],
        ':pw'     => (string)$pending['password_hash'],
    ]);

    $userId = (int)$pdo->lastInsertId();

    $stmt = $pdo->prepare("UPDATE otp_tokens SET verified_at = NOW() WHERE id=:id");
    $stmt->execute([':id' => $otpId]);

    $stmt = $pdo->prepare("DELETE FROM pending_registrations WHERE email=:email");
    $stmt->execute([':email' => $email]);

    $pdo->commit();

    auth_event('REGISTER_OK', $userId, $email, 'created user');
    json_success(['redirect' => route_url('login') . '?applied=1']);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();

    // 例外也算失敗命中（5 次封 15 分鐘）
    throttle_hit('OTP_REGISTER_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 5, 15);

    auth_event('REGISTER_VERIFY_FAIL', null, $email ?: null, 'exception');
    json_error('系統忙碌中，請稍後再試。', 500);
}
