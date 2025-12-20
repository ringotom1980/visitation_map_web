<?php
/**
 * Path: Public/api/auth/register_verify.php
 * 說明: 驗證註冊 OTP → 建立 users（ACTIVE）→ 回 /login?applied=1
 * Method: POST /api/auth/register_verify
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

// 讀 JSON 或 form-data
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
    json_error('請輸入 Email 與驗證碼', 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_error('Email 格式不正確', 400);
}
if (!preg_match('/^\d{6}$/', $otp)) {
    json_error('驗證碼格式不正確（需為 6 位數字）', 400);
}

$pdo = db();

try {
    // 1) 取得最新一筆未驗證 OTP（REGISTER）
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
        json_error('尚未申請驗證碼或驗證碼已失效，請重新申請', 400);
    }

    $otpId     = (int)$row['id'];
    $expiresAt = (string)$row['expires_at'];
    $failCount = (int)$row['fail_count'];

    if ($failCount >= 5) {
        json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
    }

    // 過期判斷
    $now = new DateTimeImmutable('now');
    $exp = new DateTimeImmutable($expiresAt);
    if ($now > $exp) {
        json_error('驗證碼已過期，請重新申請', 400);
    }

    // 2) 驗證 OTP
    $ok = password_verify($otp, (string)$row['code_hash']);
    if (!$ok) {
        // 增加 fail_count
        $stmt = $pdo->prepare("UPDATE otp_tokens SET fail_count = fail_count + 1 WHERE id=:id");
        $stmt->execute([':id' => $otpId]);

        // 若剛好到 5 次，提示更明確
        if ($failCount + 1 >= 5) {
            json_error('驗證碼錯誤次數過多，請重新申請驗證碼', 429);
        }

        json_error('驗證碼錯誤', 400);
    }

    // 3) 取得 pending 註冊資料
    $stmt = $pdo->prepare("
        SELECT id, name, phone, email, organization_id, title, password_hash
        FROM pending_registrations
        WHERE email = :email
        LIMIT 1
    ");
    $stmt->execute([':email' => $email]);
    $pending = $stmt->fetch();
    if (!$pending) {
        json_error('查無註冊暫存資料，請重新註冊', 400);
    }

    // 4) 再次確認 users 沒有同 email（避免 race）
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    if ($stmt->fetch()) {
        json_error('此 Email 已註冊，請直接登入或使用忘記密碼', 409);
    }

    $pdo->beginTransaction();

    // 5) 建立 users（ACTIVE，role=USER）
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

    // 6) 標記 OTP 已驗證
    $stmt = $pdo->prepare("UPDATE otp_tokens SET verified_at = NOW() WHERE id=:id");
    $stmt->execute([':id' => $otpId]);

    // 7) 刪除 pending
    $stmt = $pdo->prepare("DELETE FROM pending_registrations WHERE email=:email");
    $stmt->execute([':email' => $email]);

    $pdo->commit();

    json_success([
        'redirect' => route_url('login') . '?applied=1'
    ]);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_error('系統忙碌中，請稍後再試。', 500);
}
