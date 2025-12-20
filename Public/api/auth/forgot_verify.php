<?php
/**
 * Path: Public/api/auth/forgot_verify.php
 * 說明: 忘記密碼 - 驗證 OTP（purpose=RESET）→ 更新 users.password_hash
 * Method: POST /api/auth/forgot_verify
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
$newPw2= (string)($input['new_password_confirm'] ?? '');

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_error('Email 格式不正確', 400);
}
if (!preg_match('/^\d{6}$/', $otp)) {
    json_error('驗證碼格式不正確（需為 6 位數字）', 400);
}
if ($newPw === '' || $newPw2 === '' || strlen($newPw) < 8) {
    json_error('新密碼長度至少需 8 碼', 400);
}
if ($newPw !== $newPw2) {
    json_error('兩次輸入的新密碼不一致', 400);
}

$pdo = db();

try {
    // 使用者存在且 ACTIVE（這裡不需要再做「不洩漏」，因為已到 verify 步驟）
    $stmt = $pdo->prepare("SELECT id, status FROM users WHERE email=:email LIMIT 1");
    $stmt->execute([':email' => $email]);
    $u = $stmt->fetch();
    if (!$u || ((string)($u['status'] ?? '')) !== 'ACTIVE') {
        json_error('帳號不存在或未啟用', 400);
    }
    $userId = (int)$u['id'];

    // 取得最新一筆未驗證 RESET OTP
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
        json_error('尚未申請驗證碼或驗證碼已失效，請重新申請', 400);
    }

    $otpId     = (int)$row['id'];
    $expiresAt = (string)$row['expires_at'];
    $failCount = (int)$row['fail_count'];

    if ($failCount >= 5) {
        json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
    }

    $now = new DateTimeImmutable('now');
    $exp = new DateTimeImmutable($expiresAt);
    if ($now > $exp) {
        json_error('驗證碼已過期，請重新申請', 400);
    }

    if (!password_verify($otp, (string)$row['code_hash'])) {
        $stmt = $pdo->prepare("UPDATE otp_tokens SET fail_count = fail_count + 1 WHERE id=:id");
        $stmt->execute([':id' => $otpId]);

        if ($failCount + 1 >= 5) {
            json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
        }
        json_error('驗證碼錯誤', 400);
    }

    $pdo->beginTransaction();

    // 更新密碼
    $newHash = password_hash($newPw, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare("UPDATE users SET password_hash=:pw WHERE id=:id");
    $stmt->execute([':pw' => $newHash, ':id' => $userId]);

    // 標記 OTP 已驗證
    $stmt = $pdo->prepare("UPDATE otp_tokens SET verified_at = NOW() WHERE id=:id");
    $stmt->execute([':id' => $otpId]);

    $pdo->commit();

    json_success([
        'redirect' => route_url('login') . '?reset=1'
    ]);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_error('系統忙碌中，請稍後再試。', 500);
}
