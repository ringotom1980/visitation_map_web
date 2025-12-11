<?php
/**
 * Path: Public/api/places/create.php
 * 說明: 新增一筆標記地點（官兵姓名、類別、位置、備註等）。
 */

declare(strict_types=1);

require __DIR__ . '/../common/bootstrap.php';

require_login();
$user = current_user();

/** @var PDO $pdo */
global $pdo;

// 解析 JSON
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    json_error('請以 JSON 傳送資料');
}

$soldier = trim($data['soldier_name'] ?? '');
$category = trim($data['category'] ?? '');
$target   = trim($data['target_name'] ?? '');
$address  = trim($data['address'] ?? '');
$note     = trim($data['note'] ?? '');
$lat      = isset($data['lat']) ? (float)$data['lat'] : 0;
$lng      = isset($data['lng']) ? (float)$data['lng'] : 0;

if ($soldier === '') json_error('官兵姓名為必填');
if ($category === '') json_error('類別為必選');
if ($lat == 0 || $lng == 0) json_error('請在地圖點選位置');

// 你資料表若有 org_id、created_by 可以加上
try {
    $sql = "INSERT INTO places (
                soldier_name, category, target_name, address,
                lat, lng, note,
                is_deleted, created_at, updated_at, created_by
            ) VALUES (
                :soldier_name, :category, :target_name, :address,
                :lat, :lng, :note,
                0, NOW(), NOW(), :uid
            )";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':soldier_name' => $soldier,
        ':category'     => $category,
        ':target_name'  => $target,
        ':address'      => $address,
        ':lat'          => $lat,
        ':lng'          => $lng,
        ':note'         => $note,
        ':uid'          => $user['id'],
    ]);

    json_success(['id' => $pdo->lastInsertId()]);

} catch (Throwable $e) {
    json_error('新增地點失敗：' . $e->getMessage(), 500);
}
