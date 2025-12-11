<?php
/**
 * Path: Public/api/places/list.php
 * 說明: 回傳使用者所屬單位底下所有未刪除的標記地點。
 */

declare(strict_types=1);

require __DIR__ . '/../common/bootstrap.php';

// 必須登入
require_login();

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
            WHERE is_deleted = 0
            ORDER BY id DESC";

    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    json_success($rows);

} catch (Throwable $e) {
    json_error('讀取地點列表失敗：' . $e->getMessage(), 500);
}
