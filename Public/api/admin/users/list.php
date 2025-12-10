<?php
/**
 * Path: Public/api/admin/users/list.php
 * 說明: 取得所有使用者列表（管理者）
 */

declare(strict_types=1);

require_once __DIR__ . '/../../common/bootstrap.php';

if (!current_user_id() || !is_admin()) {
    json_error('沒有權限', 403);
}

$pdo = db();

$sql = "SELECT u.id,
               u.name,
               u.email,
               u.phone,
               u.title,
               u.organization_id,
               o.name AS organization_name,
               u.role,
               u.status,
               u.created_at
        FROM users u
        LEFT JOIN organizations o ON o.id = u.organization_id
        ORDER BY o.name ASC, u.name ASC";

$stmt = $pdo->query($sql);
$rows = $stmt->fetchAll() ?: [];

json_success($rows);
