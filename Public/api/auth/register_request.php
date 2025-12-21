<?php
/**
 * Path: Public/api/auth/register_request.php
 * 說明: 註冊申請（建立 pending_registrations + 寄送 Email OTP）
 * Method: POST /api/auth/register_request
 *
 * 節流策略（方案A）：
 * - A) fail-only 封鎖：只在異常/失敗（寄信失敗、例外）時 throttle_hit(OTP_REGISTER_REQ_FAIL)
 * - B) request 節流：寄信本身有成本 → throttle_check(OTP_REGISTER_REQ) 每次都計數
 * - C) 入口先擋封鎖期：throttle_assert_not_blocked(OTP_REGISTER_REQ_FAIL)
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

// 支援 JSON 或 form-data
$input = $_POST;
if (empty($input)) {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $json = json_decode($raw, true);
        if (is_array($json)) $input = $json;
    }
}

$name           = trim((string)($input['name'] ?? ''));
$phone          = trim((string)($input['phone'] ?? ''));
$email          = trim((string)($input['email'] ?? ''));
$organizationId = (int)($input['organization_id'] ?? 0);
$title          = trim((string)($input['title'] ?? ''));
$password       = (string)($input['password'] ?? '');

if ($name === '' || $phone === '' || $email === '' || $organizationId <= 0 || $title === '' || $password === '') {
    auth_event('REGISTER_FAIL', null, $email ?: null, 'missing fields');
    json_error('註冊資料不完整（全部欄位皆為必填）', 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_event('REGISTER_FAIL', null, $email, 'invalid email');
    json_error('Email 格式不正確', 400);
}
if (mb_strlen($password, 'UTF-8') < 8) {
    auth_event('REGISTER_FAIL', null, $email, 'weak password');
    json_error('密碼至少 8 碼', 400);
}

/**
 * A) fail-only：入口先擋已封鎖者（不累計）
 */
throttle_assert_not_blocked('OTP_REGISTER_REQ_FAIL', 'IP_EMAIL', $email);
throttle_assert_not_blocked('OTP_REGISTER_REQ_FAIL', 'IP', null);

/**
 * B) request 節流：寄信本身就必須計數（不是 fail-only）
 */
throttle_check('OTP_REGISTER_REQ', 'IP_EMAIL', $email, 900, 5, 15);
throttle_check('OTP_REGISTER_REQ', 'IP', null, 900, 5, 15);

// OTP 規格
$otpTtlMin = 10;

function gen_otp_6(): string
{
    $n = random_int(0, 999999);
    return str_pad((string)$n, 6, '0', STR_PAD_LEFT);
}

function send_register_otp_mail(string $toEmail, string $otp): bool
{
    $fromName  = '遺眷親訪地圖系統';
    $fromEmail = 'system_mail_noreply@ml.jinghong.pw';

    $subject = '註冊驗證碼（10 分鐘內有效）';
    $body = "您好，\n\n"
        . "您正在申請「遺眷親訪地圖系統」帳號。\n\n"
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
    // users 已存在（註冊流程允許直接告知）
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    if ($stmt->fetch()) {
        auth_event('REGISTER_FAIL', null, $email, 'email already registered');
        json_error('此 Email 已註冊，請直接登入或使用忘記密碼', 409);
    }

    // organization 存在
    $stmt = $pdo->prepare('SELECT id FROM organizations WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $organizationId]);
    if (!$stmt->fetch()) {
        auth_event('REGISTER_FAIL', null, $email, 'invalid organization');
        json_error('所屬單位不存在（organization_id 無效）', 400);
    }

    $pdo->beginTransaction();

    // upsert pending_registrations
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    $sqlUpsert = '
        INSERT INTO pending_registrations
          (name, phone, email, organization_id, title, password_hash, created_at)
        VALUES
          (:name, :phone, :email, :org_id, :title, :pw, NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          phone = VALUES(phone),
          organization_id = VALUES(organization_id),
          title = VALUES(title),
          password_hash = VALUES(password_hash),
          created_at = NOW()
    ';
    $stmt = $pdo->prepare($sqlUpsert);
    $stmt->execute([
        ':name'   => $name,
        ':phone'  => $phone,
        ':email'  => $email,
        ':org_id' => $organizationId,
        ':title'  => $title,
        ':pw'     => $passwordHash,
    ]);

    // 清除舊 REGISTER OTP（未驗證）
    $stmt = $pdo->prepare("
        DELETE FROM otp_tokens
        WHERE purpose='REGISTER' AND email=:email AND verified_at IS NULL
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
          ('REGISTER', :email, :hash, DATE_ADD(NOW(), INTERVAL :ttl MINUTE), NOW(), 0, NULL, :ip, :ua)
    ");
    $stmt->execute([
        ':email' => $email,
        ':hash'  => $otpHash,
        ':ttl'   => $otpTtlMin,
        ':ip'    => $ip,
        ':ua'    => $ua ? mb_substr($ua, 0, 255, 'UTF-8') : null,
    ]);

    // transaction 內寄信：失敗就 rollback
    $ok = send_register_otp_mail($email, $otp);
    if (!$ok) {
        $pdo->rollBack();

        // fail-only：寄信失敗視為異常，累計並可能封鎖
        throttle_hit('OTP_REGISTER_REQ_FAIL', 'IP_EMAIL', $email, 900, 5, 15);
        throttle_hit('OTP_REGISTER_REQ_FAIL', 'IP', null, 900, 5, 15);

        auth_event('REGISTER_FAIL', null, $email, 'mail send failed');
        json_error('寄送驗證碼失敗（mail()），請稍後再試或聯絡管理者', 500);
    }

    $pdo->commit();

    auth_event('REGISTER_OTP_SENT', null, $email, 'otp sent');
    json_success(['message' => '驗證碼已寄送至信箱（10 分鐘內有效）']);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();

    // fail-only：例外也視為異常
    throttle_hit('OTP_REGISTER_REQ_FAIL', 'IP_EMAIL', $email, 900, 10, 15);
    throttle_hit('OTP_REGISTER_REQ_FAIL', 'IP', null, 900, 10, 15);

    auth_event('REGISTER_FAIL', null, $email ?: null, 'exception');
    json_error('系統忙碌中，請稍後再試。', 500);
}
