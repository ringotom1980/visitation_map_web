<?php
/**
 * Path: Public/api/places/get.php
 * 說明: 取得單一標記詳細資料（新版 places schema）
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
            p.id,

            p.serviceman_name,
            p.category,
            p.visit_target,
            p.visit_name,
            p.condolence_order_no,
            p.beneficiary_over65,
            p.address_text,
            p.managed_district,
            p.note,
            p.lat,
            p.lng,
            p.organization_id,
            p.updated_by_user_id,
            p.created_at,
            p.updated_at,

            o.name AS organization_name,
            u.name AS updated_by_user_name,

            p.serviceman_name AS soldier_name,
            p.visit_target AS target_name,
            p.address_text AS address
        FROM places p
        LEFT JOIN organizations o ON o.id = p.organization_id
        LEFT JOIN users u ON u.id = p.updated_by_user_id
        WHERE p.id = :id
        LIMIT 1';


    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();

    if (!$row) {
        json_error('找不到指定的標記', 404);
    }

    if (($user['role'] ?? '') !== 'ADMIN'
        && (int)$row['organization_id'] !== (int)$user['organization_id']
    ) {
        json_error('無權限存取此標記', 403);
    }

    json_success($row);

} catch (Throwable $e) {
    json_error('讀取標記資料時發生錯誤：' . $e->getMessage(), 500);
}
