<?php
/**
 * Path: Public/api/auth/forgot_request.php
 * 說明: 忘記密碼 - 寄送 Email OTP（purpose=RESET）
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
    // 這裡可選擇也用「不洩漏」訊息，但為 UX 仍回輸入錯誤
    json_error('請帶入正確的 Email', 400);
}

// OTP 規格
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
          . "您正在進行「遺眷親訪地圖系統」的密碼重設。\n\n"
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
$ip = $_SERVER['REMOTE_ADDR'] ?? null;
$ua = $_SERVER['HTTP_USER_AGENT'] ?? null;
$ua = $ua ? mb_substr($ua, 0, 255, 'UTF-8') : null;

try {
    // ---- 最小風控：IP 1 分鐘最多 3 次 ----
    if ($ip) {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) AS c
            FROM otp_tokens
            WHERE purpose='RESET'
              AND created_ip = :ip
              AND sent_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
        ");
        $stmt->execute([':ip' => $ip]);
        $c = (int)($stmt->fetchColumn() ?: 0);
        if ($c >= 3) {
            json_error('操作過於頻繁，請稍後再試', 429);
        }
    }

    // ---- 最小風控：同 Email 10 分鐘最多 3 次 ----
    $stmt = $pdo->prepare("
        SELECT COUNT(*) AS c
        FROM otp_tokens
        WHERE purpose='RESET'
          AND email = :email
          AND sent_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
    ");
    $stmt->execute([':email' => $email]);
    $c2 = (int)($stmt->fetchColumn() ?: 0);
    if ($c2 >= 3) {
        json_error('已寄送驗證碼，請稍後再試', 429);
    }

    // 查使用者是否存在且啟用（但回應永遠不洩漏）
    $stmt = $pdo->prepare("SELECT id, status FROM users WHERE email=:email LIMIT 1");
    $stmt->execute([':email' => $email]);
    $u = $stmt->fetch();

    // 不存在或非 ACTIVE：直接回 success（避免帳號枚舉）
    if (!$u || ((string)($u['status'] ?? '')) !== 'ACTIVE') {
        json_success(['message' => '若該 Email 存在且已啟用，驗證碼已寄送（10 分鐘內有效）']);
    }

    // 清除舊的未驗證 RESET OTP
    $stmt = $pdo->prepare("
        DELETE FROM otp_tokens
        WHERE purpose='RESET' AND email=:email AND verified_at IS NULL
    ");
    $stmt->execute([':email' => $email]);

    // 建新 OTP
    $otp = gen_otp_6();
    $otpHash = password_hash($otp, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("
        INSERT INTO otp_tokens
          (purpose, email, code_hash, expires_at, sent_at, fail_count, verified_at, created_ip, created_ua)
        VALUES
          ('RESET', :email, :hash, DATE_ADD(NOW(), INTERVAL :ttl MINUTE), NOW(), 0, NULL, :ip, :ua)
    ");
    $stmt->execute([
        ':email' => $email,
        ':hash'  => $otpHash,
        ':ttl'   => 10,
        ':ip'    => $ip,
        ':ua'    => $ua,
    ]);

    // 寄信
    $ok = send_reset_otp_mail($email, $otp);
    if (!$ok) {
        json_error('寄送驗證碼失敗，請稍後再試', 500);
    }

    json_success(['message' => '若該 Email 存在且已啟用，驗證碼已寄送（10 分鐘內有效）']);

} catch (Throwable $e) {
    json_error('系統忙碌中，請稍後再試。', 500);
}
