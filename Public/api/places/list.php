<?php
/**
 * Path: Public/api/places/list.php
 * 說明: 取得可見的所有標記列表（新版 places schema）
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

$pdo = db();

try {
    $sql = 'SELECT
        p.id,

        -- canonical
        p.serviceman_name,
        p.category,
        p.visit_target,
        p.visit_name,
        p.condolence_order_no,
        p.beneficiary_over65,
        p.address_text,

        p.managed_district,
        p.managed_town_code,
        p.managed_county_code,

        p.note,
        p.lat,
        p.lng,
        p.organization_id,
        p.updated_by_user_id,
        p.created_at,
        p.updated_at,

        -- join
        o.name AS organization_name,
        u.name AS updated_by_user_name,

        -- legacy aliases（維持前端舊 JS 相容）
        p.serviceman_name AS soldier_name,
        p.visit_target AS target_name,
        p.address_text AS address

    FROM places p
    LEFT JOIN organizations o ON o.id = p.organization_id
    LEFT JOIN users u ON u.id = p.updated_by_user_id
    WHERE 1=1';

    $params = [];

    // 非 ADMIN 僅能看到自己單位
    if (($user['role'] ?? '') !== 'ADMIN') {
        $sql .= ' AND p.organization_id = :org_id';
        $params[':org_id'] = (int)$user['organization_id'];
    }

    $sql .= ' ORDER BY p.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    json_success($rows);

} catch (Throwable $e) {
    json_error('載入地點資料時發生錯誤：' . $e->getMessage(), 500);
}
