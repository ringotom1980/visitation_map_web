<?php
/**
 * Path: Public/api/auth/device_otp_request.php
 * 說明: 裝置驗證 - 申請 OTP（寄送 DEVICE）
 * Method: POST /api/auth/device_otp_request
 *
 * 方案 B：
 * - 不 require_login（因為還沒正式登入）
 * - 改 require_preauth（只允許走過帳密正確的人重寄）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

$pre = require_preauth();
$email = trim((string)($pre['email'] ?? ''));

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_event('DEVICE_OTP_FAIL', (int)($pre['uid'] ?? 0), $email ?: null, 'invalid preauth email');
    json_error('驗證流程異常，請重新登入', 401);
}

throttle_assert_not_blocked('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email);
throttle_assert_not_blocked('OTP_DEVICE_REQ_FAIL', 'IP', null);

throttle_check('OTP_DEVICE_REQ', 'IP_EMAIL', $email, 900, 5, 15);
throttle_check('OTP_DEVICE_REQ', 'IP', null, 900, 5, 15);

$otpTtlMin = 10;

function gen_otp_6(): string {
    $n = random_int(0, 999999);
    return str_pad((string)$n, 6, '0', STR_PAD_LEFT);
}

function send_device_otp_mail(string $toEmail, string $otp): bool
{
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
}

$pdo = db();

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
        DELETE FROM otp_tokens
        WHERE purpose='DEVICE' AND email=:email AND verified_at IS NULL
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
          ('DEVICE', :email, :hash, DATE_ADD(NOW(), INTERVAL :ttl MINUTE), NOW(), 0, NULL, :ip, :ua)
    ");
    $stmt->execute([
        ':email' => $email,
        ':hash'  => $otpHash,
        ':ttl'   => $otpTtlMin,
        ':ip'    => $ip,
        ':ua'    => $ua ? mb_substr($ua, 0, 255, 'UTF-8') : null,
    ]);

    $ok = send_device_otp_mail($email, $otp);
    if (!$ok) {
        $pdo->rollBack();

        throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP', null, 900, 5, 15);

        auth_event('DEVICE_OTP_FAIL', (int)$pre['uid'], $email, 'mail send failed');
        json_error('寄送驗證碼失敗，請稍後再試', 500);
    }

    $pdo->commit();

    auth_event('DEVICE_OTP_SENT', (int)$pre['uid'], $email, 'otp sent');
    json_success(['message' => '驗證碼已寄送（10 分鐘內有效）']);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();

    throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
    throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP', null, 900, 5, 15);

    auth_event('DEVICE_OTP_FAIL', (int)$pre['uid'], $email ?: null, 'exception: ' . $e->getMessage());
    json_error('系統忙碌中，請稍後再試。', 500);
}
