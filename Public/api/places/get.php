<?php
/**
 * Path: Public/api/places/get.php
 * 說明: 取得單一標記詳細資料（GET /api/places/get.php?id=123）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed', 405);
}

$user = current_user();
if (!$user) {
    json_error('尚未登入', 401);
}

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($id <= 0) {
    json_error('參數錯誤：缺少 id', 400);
}

$pdo = db();

try {
    $sql = 'SELECT
                id,
                serviceman_name AS soldier_name,
                category,
                visit_target   AS target_name,
                visit_name,
                address_text   AS address,
                township,
                note,
                lat,
                lng,
                organization_id,
                created_by_user_id,
                created_at,
                updated_at,
                is_active
            FROM places
            WHERE id = :id';

    $params = array(':id' => $id);

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();

    if (!$row) {
        json_error('找不到指定的標記', 404);
    }

    // 權限：ADMIN 看全部，一般使用者只能看自己單位
    if (($user['role'] ?? '') !== 'ADMIN'
        && (int)$row['organization_id'] !== (int)$user['organization_id']
    ) {
        json_error('無權限存取此標記', 403);
    }

    json_success($row);

} catch (Throwable $e) {
    json_error('讀取標記資料時發生錯誤：' . $e->getMessage(), 500);
}
