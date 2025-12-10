<?php
/**
 * Path: Public/api/admin/users/set-role.php
 * 說明: 設定使用者角色（USER / ADMIN）
 */

declare(strict_types=1);

require_once __DIR__ . '/../../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

if (!current_user_id() || !is_admin()) {
    json_error('沒有權限', 403);
}

// 讀 JSON
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

$userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
$role   = strtoupper(trim($input['role'] ?? ''));

if ($userId <= 0 || !in_array($role, ['USER', 'ADMIN'], true)) {
    json_error('參數不正確');
}

// 不允許把自己降成 USER 後沒有其他 ADMIN（這個邏輯你可之後再加強）
// 這裡先只禁止把自己改成 USER，避免意外鎖死
if ($userId === current_user_id() && $role === 'USER') {
    json_error('不可將自己降為一般使用者');
}

$pdo = db();

$sql = 'UPDATE users SET role = :role WHERE id = :id';
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':role' => $role,
    ':id'   => $userId,
]);

if ($stmt->rowCount() === 0) {
    json_error('找不到使用者');
}

json_success(['message' => '已更新角色']);
