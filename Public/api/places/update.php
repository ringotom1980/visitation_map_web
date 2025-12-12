<?php
/**
 * Path: Public/api/places/update.php
 * 說明: 編輯標記（POST /api/places/update.php）
 *       - 支援 JSON 與 form-data
 *       - 權限：ADMIN 可編輯全部；一般使用者只能編輯自己單位
 *       - 重要修正：lat/lng 改為「可選」；若未帶座標，沿用 DB 既有座標（避免只改文字欄位被擋）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

$user = current_user();
if (!$user) {
    json_error('尚未登入', 401);
}

// 支援 JSON 與 form-data
$input = $_POST;
if (empty($input)) {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $json = json_decode($raw, true);
        if (is_array($json)) {
            $input = $json;
        }
    }
}

$id          = isset($input['id']) ? (int)$input['id'] : 0;
$soldierName = trim((string)($input['soldier_name'] ?? ''));
$category    = trim((string)($input['category'] ?? ''));
$targetName  = trim((string)($input['target_name'] ?? ''));
$visitName   = trim((string)($input['visit_name'] ?? ''));
$address     = trim((string)($input['address'] ?? ''));
$township    = trim((string)($input['township'] ?? ''));
$note        = trim((string)($input['note'] ?? ''));

// lat/lng：改為可選（若未帶，沿用 DB）
$hasLat = array_key_exists('lat', $input) && $input['lat'] !== '' && $input['lat'] !== null;
$hasLng = array_key_exists('lng', $input) && $input['lng'] !== '' && $input['lng'] !== null;

$lat = $input['lat'] ?? null;
$lng = $input['lng'] ?? null;

if ($id <= 0) {
    json_error('參數錯誤：缺少 id', 400);
}
if ($soldierName === '' || $category === '') {
    json_error('官兵姓名與類別為必填欄位');
}

// 若有帶座標，就必須是數值；若未帶則後面用 DB 舊值
if (($hasLat && !is_numeric($lat)) || ($hasLng && !is_numeric($lng))) {
    json_error('座標資訊錯誤（lat/lng 必須為數值）');
}

$pdo = db();

try {
    // 先抓原始資料：權限 + 取得既有座標（供未帶 lat/lng 時沿用）
    $sqlOrig = 'SELECT id, organization_id, is_active, lat, lng
                FROM places
                WHERE id = :id
                LIMIT 1';
    $stmtOrig = $pdo->prepare($sqlOrig);
    $stmtOrig->execute([':id' => $id]);
    $orig = $stmtOrig->fetch();

    if (!$orig || (int)$orig['is_active'] !== 1) {
        json_error('找不到要編輯的標記', 404);
    }

    if (($user['role'] ?? '') !== 'ADMIN'
        && (int)$orig['organization_id'] !== (int)$user['organization_id']
    ) {
        json_error('無權限編輯此標記', 403);
    }

    // 沿用 DB 座標（只有在未提供 lat/lng 時）
    $finalLat = $hasLat ? (float)$lat : (float)$orig['lat'];
    $finalLng = $hasLng ? (float)$lng : (float)$orig['lng'];

    // 更新資料
    $sql = 'UPDATE places
            SET
                serviceman_name = :serviceman_name,
                category        = :category,
                visit_target    = :visit_target,
                visit_name      = :visit_name,
                note            = :note,
                lat             = :lat,
                lng             = :lng,
                address_text    = :address_text,
                township        = :township,
                updated_at      = NOW()
            WHERE id = :id';

    $params = [
        ':id'              => $id,
        ':serviceman_name' => $soldierName,
        ':category'        => $category,
        ':visit_target'    => ($targetName !== '' ? $targetName : null),
        ':visit_name'      => ($visitName !== '' ? $visitName : null),
        ':note'            => ($note !== '' ? $note : null),
        ':lat'             => $finalLat,
        ':lng'             => $finalLng,
        ':address_text'    => ($address !== '' ? $address : null),
        ':township'        => ($township !== '' ? $township : null),
    ];

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // 回傳更新後資料（與 list 的 alias 規格一致）
    $sqlGet = 'SELECT
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
                    created_at,
                    updated_at
               FROM places
               WHERE id = :id
               LIMIT 1';

    $stmtGet = $pdo->prepare($sqlGet);
    $stmtGet->execute([':id' => $id]);
    $row = $stmtGet->fetch();

    json_success($row);

} catch (Throwable $e) {
    json_error('更新標記時發生錯誤：' . $e->getMessage(), 500);
}
