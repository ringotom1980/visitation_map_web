<?php
/**
 * Path: Public/api/user/update.php
 * 說明: 更新個人基本資料（姓名、電話、Email、職稱）
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

$name  = trim($input['name']  ?? '');
$phone = trim($input['phone'] ?? '');
$email = trim($input['email'] ?? '');
$title = trim($input['title'] ?? '');

if ($name === '' || $phone === '' || $email === '') {
    json_error('姓名、電話與 Email 為必填');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_error('Email 格式不正確');
}

$pdo = db();

// 檢查 Email 是否與其他 user 重複
$sql = 'SELECT COUNT(*) FROM users WHERE email = :email AND id <> :id';
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':email' => $email,
    ':id'    => (int)$user['id'],
]);
if ((int)$stmt->fetchColumn() > 0) {
    json_error('此 Email 已被其他帳號使用');
}

// 更新資料
$sql = "UPDATE users
        SET name = :name,
            phone = :phone,
            email = :email,
            title = :title
        WHERE id = :id";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':name'  => $name,
    ':phone' => $phone,
    ':email' => $email,
    ':title' => $title,
    ':id'    => (int)$user['id'],
]);

json_success(['message' => '已更新基本資料']);
