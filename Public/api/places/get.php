<?php
/**
 * Path: Public/api/places/get.php
 * 說明: 依據 id 回傳單筆地點資料。
 */

declare(strict_types=1);

require __DIR__ . '/../common/bootstrap.php';

require_login();

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($id <= 0) {
    json_error('缺少或錯誤的 id');
}

/** @var PDO $pdo */
global $pdo;

try {
    $sql = "SELECT 
                id,
                soldier_name,
                category,
                target_name,
                address,
                lat,
                lng,
                note,
                created_at,
                updated_at
            FROM places
            WHERE id = :id AND is_deleted = 0
            LIMIT 1";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        json_error('查無此地點', 404);
    }

    json_success($row);

} catch (Throwable $e) {
    json_error('取得地點資料失敗：' . $e->getMessage(), 500);
}
