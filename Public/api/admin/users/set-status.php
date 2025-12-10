<?php
/**
 * Path: Public/api/admin/users/set-status.php
 * 說明: 設定使用者狀態（ACTIVE / SUSPENDED）
 */

declare(strict_types=1);

require_once __DIR__ . '/../../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

if (!current_user_id() || !is_admin()) {
    json_error('沒有權限', 403);
}

// 讀 JSON 或 form-data
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
$status = strtoupper(trim($input['status'] ?? ''));

// ★ 這裡只能是 'ACTIVE' 或 'SUSPENDED'
if ($userId <= 0 || !in_array($status, ['ACTIVE', 'SUSPENDED'], true)) {
    json_error('參數不正確');
}

// 不允許自己把自己 SUSPENDED 掉（避免鎖死所有管理者）
if ($userId === current_user_id() && $status === 'SUSPENDED') {
    json_error('不可停用自己');
}

$pdo = db();

$sql = 'UPDATE users SET status = :status WHERE id = :id';
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':status' => $status,
    ':id'     => $userId,
]);

if ($stmt->rowCount() === 0) {
    json_error('找不到使用者');
}

json_success(['message' => '已更新狀態']);
