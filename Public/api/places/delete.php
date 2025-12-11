<?php
/**
 * Path: Public/api/places/delete.php
 * 說明: 邏輯刪除一筆地點（is_deleted = 1）。
 */

declare(strict_types=1);

require __DIR__ . '/../common/bootstrap.php';

require_login();

/** @var PDO $pdo */
global $pdo;

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) json_error('請以 JSON 傳送資料');

$id = (int)($data['id'] ?? 0);
if ($id <= 0) json_error('缺少 id');

try {
    $sql = "UPDATE places
            SET is_deleted = 1, updated_at = NOW()
            WHERE id = :id AND is_deleted = 0";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        json_error('找不到要刪除的資料', 404);
    }

    json_success(['id' => $id]);

} catch (Throwable $e) {
    json_error('刪除失敗：' . $e->getMessage(), 500);
}
