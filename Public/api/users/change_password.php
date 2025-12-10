<?php
/**
 * Path: Public/api/user/change-password.php
 * 說明: 更新密碼
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

$user = current_user();
if (!$user) {
    json_error('尚未登入', 401);
}

// 讀取 JSON
$input = $_POST;
if (empty($input)) {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $tmp = json_decode($raw, true);
        if (is_array($tmp)) {
            $input = $tmp;
        }
    }
}

$current = $input['current_password'] ?? '';
$new     = $input['new_password'] ?? '';
$confirm = $input['confirm_password'] ?? '';

if ($current === '' || $new === '' || $confirm === '') {
    json_error('請完整填寫密碼欄位');
}
if ($new !== $confirm) {
    json_error('兩次輸入的新密碼不一致');
}
if (strlen($new) < 8) {
    json_error('新密碼長度至少 8 碼');
}

$pdo = db();

// 取出目前使用者密碼 hash
$sql = 'SELECT password_hash FROM users WHERE id = :id LIMIT 1';
$stmt = $pdo->prepare($sql);
$stmt->execute([':id' => (int)$user['id']]);
$row = $stmt->fetch();

if (!$row || !password_verify($current, $row['password_hash'])) {
    json_error('目前密碼不正確');
}

// 更新為新密碼
$newHash = password_hash($new, PASSWORD_DEFAULT);

$sql = 'UPDATE users SET password_hash = :hash WHERE id = :id';
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':hash' => $newHash,
    ':id'   => (int)$user['id'],
]);

json_success(['message' => '密碼變更成功，下次請使用新密碼登入']);
