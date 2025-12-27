<?php
/**
 * Path: Public/api/auth/device_otp_verify.php
 * 說明: 驗證 DEVICE OTP（登入前流程，定版）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

// ❌ OTP 階段禁止 require_login

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

// ===== 關鍵：唯一身分來源（不可替代）=====
$email = $_SESSION['device_otp_email'] ?? null;
if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
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

    // ===== 只找「這個 email」的 OTP =====
    $stmt = $pdo->prepare("
        SELECT
            t.id,
            t.code_hash,
            t.expires_at,
            t.fail_count,
            u.id AS user_id
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

    $otpId     = (int)$row['id'];
    $uid       = (int)$row['user_id'];
    $failCount = (int)$row['fail_count'];

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

    // ===== 標記 OTP 已驗證 =====
    $pdo->prepare("UPDATE otp_tokens SET verified_at = NOW() WHERE id = :id")
        ->execute([':id' => $otpId]);

    // ===== 寫入 trusted_devices =====
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

    // 清掉 OTP session（一次性）
    unset($_SESSION['device_otp_email']);

    auth_event('OTP_VERIFY_OK', $uid, $email, 'DEVICE');
    json_success(['trusted' => true]);

} catch (Throwable $e) {
    auth_event('OTP_VERIFY_FAIL', null, $email, 'DEVICE exception: ' . $e->getMessage());
    json_error('系統忙碌中，請稍後再試。', 500);
}
