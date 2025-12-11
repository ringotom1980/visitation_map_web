<?php
/**
 * Path: Public/api/places/update.php
 * 說明: 更新標記內容（官兵姓名、類別、地址、備註、經緯度）。
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

$soldier = trim($data['soldier_name'] ?? '');
$category = trim($data['category'] ?? '');
$target = trim($data['target_name'] ?? '');
$address = trim($data['address'] ?? '');
$note = trim($data['note'] ?? '');
$lat = isset($data['lat']) ? (float)$data['lat'] : null;
$lng = isset($data['lng']) ? (float)$data['lng'] : null;

if ($soldier === '') json_error('官兵姓名為必填');
if ($category === '') json_error('類別為必選');

try {
    $sql = "UPDATE places SET
                soldier_name = :soldier_name,
                category     = :category,
                target_name  = :target,
                address      = :address,
                note         = :note,
                updated_at   = NOW()";

    $params = [
        ':soldier_name' => $soldier,
        ':category'     => $category,
        ':target'       => $target,
        ':address'      => $address,
        ':note'         => $note,
        ':id'           => $id,
    ];

    if ($lat !== null && $lng !== null) {
        $sql .= ",
                lat = :lat,
                lng = :lng";
        $params[':lat'] = $lat;
        $params[':lng'] = $lng;
    }

    $sql .= " WHERE id = :id AND is_deleted = 0";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    if ($stmt->rowCount() === 0) {
        json_error('找不到要更新的資料', 404);
    }

    json_success(['id' => $id]);

} catch (Throwable $e) {
    json_error('更新失敗：' . $e->getMessage(), 500);
}
