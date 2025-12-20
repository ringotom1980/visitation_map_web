<?php
/**
 * Path: Public/api/auth/test_mail.php
 * 說明: 測試 Hostinger mail() 是否可寄信（暫時用，測完可刪）
 * Route: GET /api/auth/test_mail?to=xxx
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

// 建議限制：只允許 ADMIN 測試，避免被濫用
require_login();
if (!is_admin()) {
  json_error('無權限操作（需要管理者）', 403);
}

$to = trim((string)($_GET['to'] ?? ''));
if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
  json_error('請帶入正確的 to，例如 ?to=you@gmail.com', 400);
}

$subject = '【測試】Hostinger PHP mail()';
$body = "這是一封測試信。\n\n若收到此信，代表 mail() 可正常寄送。\n";

$fromName  = '遺眷親訪地圖系統';
$fromEmail = 'system_mail_noreply@ml.jinghong.pw';

$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

$headers = [];
$headers[] = 'From: ' . mb_encode_mimeheader($fromName, 'UTF-8') . " <{$fromEmail}>";
$headers[] = 'MIME-Version: 1.0';
$headers[] = 'Content-Type: text/plain; charset=UTF-8';
$headers[] = 'Content-Transfer-Encoding: 8bit';

$ok = mail($to, $encodedSubject, $body, implode("\r\n", $headers));

if (!$ok) {
  json_error('mail() 回傳 false（寄信失敗）', 500);
}

json_success([
  'message' => 'mail() 回傳 true（已嘗試寄送），請到信箱含垃圾信確認',
  'to' => $to
]);
