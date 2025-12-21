<?php
/**
 * Path: Public/api/auth/forgot_request.php
 * 說明: 忘記密碼 - 申請 OTP（寄送 RESET）
 * Method: POST /api/auth/forgot_request
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
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_event('RESET_FAIL', null, $email ?: null, 'invalid email');
    json_error('請輸入正確的 Email', 400);
}

// ✅ RESET OTP 寄送節流
throttle_check('OTP_RESET', 'IP_EMAIL', $email, 900, 5);

$otpTtlMin = 10;

function gen_otp_6(): string {
    $n = random_int(0, 999999);
    return str_pad((string)$n, 6, '0', STR_PAD_LEFT);
}

function send_reset_otp_mail(string $toEmail, string $otp): bool
{
    $fromName  = '遺眷親訪地圖系統';
    $fromEmail = 'system_mail_noreply@ml.jinghong.pw';

    $subject = '重設密碼驗證碼（10 分鐘內有效）';

    $body = "您好，\n\n"
          . "您正在申請「遺眷親訪地圖系統」重設密碼。\n\n"
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
}

$pdo = db();

try {
    // 查 user（但回應一律同樣訊息，避免帳號枚舉）
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    $u = $stmt->fetch();

    if (!$u) {
        // 稽核仍記錄，但回應不揭露
        auth_event('RESET_OTP_SENT', null, $email, 'user not found (masked)');
        json_success(['message' => '若此 Email 存在，驗證碼已寄送（10 分鐘內有效）']);
    }

    $pdo->beginTransaction();

    // 清除舊 RESET OTP
    $stmt = $pdo->prepare("
        DELETE FROM otp_tokens
        WHERE purpose='RESET' AND email=:email AND verified_at IS NULL
    ");
    $stmt->execute([':email' => $email]);

    $otp     = gen_otp_6();
    $otpHash = password_hash($otp, PASSWORD_DEFAULT);

    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;

    $stmt = $pdo->prepare("
        INSERT INTO otp_tokens
          (purpose, email, code_hash, expires_at, sent_at, fail_count, verified_at, created_ip, created_ua)
        VALUES
          ('RESET', :email, :hash, DATE_ADD(NOW(), INTERVAL :ttl MINUTE), NOW(), 0, NULL, :ip, :ua)
    ");
    $stmt->execute([
        ':email' => $email,
        ':hash'  => $otpHash,
        ':ttl'   => $otpTtlMin,
        ':ip'    => $ip,
        ':ua'    => $ua ? mb_substr($ua, 0, 255, 'UTF-8') : null,
    ]);

    $ok = send_reset_otp_mail($email, $otp);
    if (!$ok) {
        $pdo->rollBack();
        auth_event('RESET_FAIL', (int)$u['id'], $email, 'mail send failed');
        json_error('寄送驗證碼失敗，請稍後再試', 500);
    }

    $pdo->commit();

    auth_event('RESET_OTP_SENT', (int)$u['id'], $email, 'otp sent');
    json_success(['message' => '若此 Email 存在，驗證碼已寄送（10 分鐘內有效）']);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    auth_event('RESET_FAIL', null, $email ?: null, 'exception');
    json_error('系統忙碌中，請稍後再試。', 500);
}
