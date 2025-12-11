<?php
/**
 * Path: Public/api/places/list.php
 * 說明: 取得目前登入使用者可見的所有標記列表（JSON）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed', 405);
}

// API 不能 redirect，只能回 JSON
$user = current_user();
if (!$user) {
    json_error('尚未登入', 401);
}

$pdo = db();

try {
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

} catch (Throwable $e) {
    // 開發階段先讓錯誤看得到
    json_error('載入地點資料時發生錯誤：' . $e->getMessage(), 500);
}
