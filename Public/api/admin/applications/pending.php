<?php
/**
 * Path: Public/api/admin/applications/pending.php
 * 說明: 取得待審核申請列表（GET /api/admin/applications/pending）
 */

declare(strict_types=1);

require_once __DIR__ . '/../../common/bootstrap.php';

if (!current_user_id() || !is_admin()) {
    json_error('沒有權限', 403);
}

$pdo = db();

$sql = "SELECT a.id,
               a.name,
               a.phone,
               a.email,
               a.organization_id,
               o.name AS organization_name,
               a.title,
               a.status,
               a.created_at
        FROM user_applications a
        LEFT JOIN organizations o ON o.id = a.organization_id
        WHERE a.status = 'PENDING'
        ORDER BY a.created_at ASC";

$stmt = $pdo->query($sql);
$rows = $stmt->fetchAll() ?: [];

json_success($rows);
