<?php
$to = 'system_mail_noreply@ml.jinghong.pw'; // 用你自己能收到的信箱
$subject = '【測試】Hostinger PHP mail()';
$message = "這是一封測試信。\n\n如果你看到這封信，代表 mail() 正常運作。\n";
$headers = [];
$headers[] = 'From: 遺眷親訪地圖系統 <system_mail_noreply@ml.jinghong.pw>';
$headers[] = 'MIME-Version: 1.0';
$headers[] = 'Content-Type: text/plain; charset=UTF-8';

$result = mail($to, $subject, $message, implode("\r\n", $headers));

echo $result ? '寄信成功' : '寄信失敗';
