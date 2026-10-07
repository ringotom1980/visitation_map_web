<?php
/**
 * Path: Public/api/auth/device_otp_request.php
 * 說明: 裝置驗證 - 申請 OTP（寄送 DEVICE）
 * Method: POST /api/auth/device_otp_request
 *
 * 定版（登入前重寄）：
 * - ❌ 不可 require_login（此頁面是 device-verify 的重寄，尚未完成正式登入）
 * - ✅ 唯一身分來源：$_SESSION['device_otp_email']
 * - request 節流：OTP_DEVICE_REQ（IP_EMAIL + IP）→ 15 分鐘 5 次（超過封 15 分鐘）
 * - fail-only：OTP_DEVICE_REQ_FAIL（只在寄信失敗/例外時 hit；入口先 assert_not_blocked）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

// ✅ OTP 階段：不可 require_login，唯一身分來源用 session
$email = $_SESSION['device_otp_email'] ?? null;
if (!$email || !is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_event('DEVICE_OTP_FAIL', null, null, 'missing device_otp_email (resend)');
    json_error('驗證狀態已失效，請重新登入', 401);
}

$pdo = db();

// 用 email 反查 user id（for auth_event）
$stmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
$stmt->execute([':email' => $email]);
$u = $stmt->fetch();
$uid = $u ? (int)$u['id'] : 0;
if ($uid <= 0) {
    auth_event('DEVICE_OTP_FAIL', null, $email, 'user not found (resend)');
    json_error('驗證狀態已失效，請重新登入', 401);
}

// fail-only：入口先擋已封鎖者（不累計）
throttle_assert_not_blocked('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email);
throttle_assert_not_blocked('OTP_DEVICE_REQ_FAIL', 'IP', null);

// request 節流：寄信本身要計數（15 分鐘 5 次，超過封 15 分鐘）
throttle_check('OTP_DEVICE_REQ', 'IP_EMAIL', $email, 900, 5, 15);
throttle_check('OTP_DEVICE_REQ', 'IP', null, 900, 5, 15);

$otpTtlMin = 10;

function gen_otp_6(): string
{
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

try {
    $pdo->beginTransaction();

    // 清除舊 DEVICE OTP（未驗證）
    $stmt = $pdo->prepare("
        DELETE FROM otp_tokens
        WHERE purpose='DEVICE' AND email=:email AND verified_at IS NULL
    ");
    $stmt->execute([':email' => $email]);

    // 建立新 OTP
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

        // fail-only：寄信失敗才累計（5 次封 15 分鐘）
        throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP', null, 900, 5, 15);

        auth_event('DEVICE_OTP_FAIL', $uid, $email, 'mail send failed');
        json_error('寄送驗證碼失敗，請稍後再試', 500);
    }

    $pdo->commit();

    // ✅ 維持 device_otp_email（仍在 OTP 流程中）
    $_SESSION['device_otp_email'] = $email;

    auth_event('DEVICE_OTP_SENT', $uid, $email, 'otp resent');
    json_success(['message' => '驗證碼已寄送（10 分鐘內有效）']);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();

    // ✅ fail-only：例外也要累計（規格寫明「寄信失敗/例外」）
    throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
    throttle_hit('OTP_DEVICE_REQ_FAIL', 'IP', null, 900, 5, 15);

    auth_event('DEVICE_OTP_FAIL', $uid > 0 ? $uid : null, $email ?: null, 'exception: ' . $e->getMessage());
    json_error('系統忙碌中，請稍後再試。', 500);
}
