<?php
/**
 * Path: Public/api/places/list.php
 * 說明: 取得目前登入使用者可見的所有標記列表（JSON）
 * 用途: 主地圖載入標記
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed', 405);
}

// ★ 不要用 require_login_page()，API 要回 JSON，不要 redirect
$user = current_user();
if (!$user) {
    json_error('尚未登入', 401);
}

$pdo = db();

// 基本查詢：尚未刪除的標記
$sql = 'SELECT
            id,
            soldier_name,
            category,
            target_name,
            address,
            lat,
            lng,
            note,
            organization_id,
            created_at,
            updated_at
        FROM places
        WHERE is_deleted = 0';

$params = [];

// 一般使用者只看自己單位；ADMIN 看全部
if (($user['role'] ?? '') !== 'ADMIN') {
    $sql .= ' AND organization_id = :org_id';
    $params[':org_id'] = $user['organization_id'];
}

$sql .= ' ORDER BY id DESC';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

json_success($rows);
