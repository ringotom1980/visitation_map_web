<?php
/**
 * Path: Public/api/auth/forgot_verify.php
 * 說明: 忘記密碼 - 驗證 OTP 並重設密碼
 * Method: POST /api/auth/forgot_verify
 *
 * 節流策略（方案A）：
 * - 入口先擋封鎖者（不累計）：throttle_assert_not_blocked(OTP_RESET_VERIFY_FAIL)
 * - 只在失敗時累計：throttle_hit(OTP_RESET_VERIFY_FAIL)
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
$newPw = (string)($input['new_password'] ?? '');

if ($email === '' || $otp === '' || $newPw === '') {
    auth_event('RESET_VERIFY_FAIL', null, $email ?: null, 'missing');
    json_error('請輸入 Email、驗證碼與新密碼', 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_event('RESET_VERIFY_FAIL', null, $email, 'invalid email');
    json_error('Email 格式不正確', 400);
}
if (!preg_match('/^\d{6}$/', $otp)) {
    auth_event('RESET_VERIFY_FAIL', null, $email, 'invalid otp format');
    json_error('驗證碼格式不正確（需為 6 位數字）', 400);
}
if (mb_strlen($newPw, 'UTF-8') < 8) {
    auth_event('RESET_VERIFY_FAIL', null, $email, 'weak password');
    json_error('新密碼至少 8 碼', 400);
}

// 入口先擋已封鎖者（不累計）
throttle_assert_not_blocked('OTP_RESET_VERIFY_FAIL', 'IP_EMAIL', $email);

$pdo = db();

try {
    // 查 user
    $stmt = $pdo->prepare('SELECT id, status FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    $u = $stmt->fetch();

    if (!$u) {
        throttle_hit('OTP_RESET_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 10, 15);
        auth_event('RESET_VERIFY_FAIL', null, $email, 'user not found');
        json_error('驗證失敗，請重新申請驗證碼', 400);
    }
    if (($u['status'] ?? '') !== 'ACTIVE') {
        auth_event('RESET_VERIFY_FAIL', (int)$u['id'], $email, 'inactive');
        json_error('帳號尚未啟用或已停權', 403);
    }

    // 取最新未驗證 RESET OTP
    $stmt = $pdo->prepare("
        SELECT id, code_hash, expires_at, fail_count
        FROM otp_tokens
        WHERE purpose='RESET' AND email=:email AND verified_at IS NULL
        ORDER BY id DESC
        LIMIT 1
    ");
    $stmt->execute([':email' => $email]);
    $row = $stmt->fetch();

    if (!$row) {
        throttle_hit('OTP_RESET_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 10, 15);
        auth_event('RESET_VERIFY_FAIL', (int)$u['id'], $email, 'no otp');
        json_error('尚未申請驗證碼或驗證碼已失效，請重新申請', 400);
    }

    $otpId     = (int)$row['id'];
    $expiresAt = (string)$row['expires_at'];
    $failCount = (int)$row['fail_count'];

    if ($failCount >= 5) {
        auth_event('RESET_VERIFY_FAIL', (int)$u['id'], $email, 'too many fails');
        json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
    }

    $now = new DateTimeImmutable('now');
    $exp = new DateTimeImmutable($expiresAt);
    if ($now > $exp) {
        throttle_hit('OTP_RESET_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 10, 15);
        auth_event('RESET_VERIFY_FAIL', (int)$u['id'], $email, 'expired');
        json_error('驗證碼已過期，請重新申請', 400);
    }

    if (!password_verify($otp, (string)$row['code_hash'])) {
        $stmt = $pdo->prepare("UPDATE otp_tokens SET fail_count = fail_count + 1 WHERE id=:id");
        $stmt->execute([':id' => $otpId]);

        throttle_hit('OTP_RESET_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 10, 15);
        auth_event('RESET_VERIFY_FAIL', (int)$u['id'], $email, 'otp mismatch');

        if ($failCount + 1 >= 5) {
            json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
        }
        json_error('驗證碼錯誤', 400);
    }

    $pdo->beginTransaction();

    // 更新密碼
    $pwHash = password_hash($newPw, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare("UPDATE users SET password_hash=:pw, updated_at=NOW() WHERE id=:id");
    $stmt->execute([':pw' => $pwHash, ':id' => (int)$u['id']]);

    // 標記 OTP 已驗證
    $stmt = $pdo->prepare("UPDATE otp_tokens SET verified_at = NOW() WHERE id=:id");
    $stmt->execute([':id' => $otpId]);

    $pdo->commit();

    auth_event('RESET_OK', (int)$u['id'], $email, 'password reset');
    json_success(['redirect' => route_url('login')]);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();

    throttle_hit('OTP_RESET_VERIFY_FAIL', 'IP_EMAIL', $email, 900, 10, 15);

    auth_event('RESET_VERIFY_FAIL', null, $email ?: null, 'exception');
    json_error('系統忙碌中，請稍後再試。', 500);
}
