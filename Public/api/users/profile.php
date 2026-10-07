<?php
/**
 * Path: Public/api/user/profile.php
 * 說明: 取得目前使用者個人資料
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

$user = current_user();
if (!$user) {
    json_error('尚未登入', 401);
}

json_success([
    'id'                => (int)$user['id'],
    'name'              => $user['name'],
    'email'             => $user['email'],
    'phone'             => $user['phone'],
    'title'             => $user['title'],
    'organization_id'   => (int)$user['organization_id'],
    'organization_name' => $user['organization_name'],
    'role'              => $user['role'],
    'status'            => $user['status'],
]);
