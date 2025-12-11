<?php
/**
 * Path: Public/api/places/update.php
 * 說明: 編輯標記（POST /api/places/update.php）
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
$soldierName = trim($input['soldier_name'] ?? '');
$category    = trim($input['category'] ?? '');
$targetName  = trim($input['target_name'] ?? '');
$visitName   = trim($input['visit_name'] ?? '');
$address     = trim($input['address'] ?? '');
$township    = trim($input['township'] ?? '');
$note        = trim($input['note'] ?? '');
$lat         = $input['lat'] ?? null;
$lng         = $input['lng'] ?? null;

if ($id <= 0) {
    json_error('參數錯誤：缺少 id', 400);
}
if ($soldierName === '' || $category === '') {
    json_error('官兵姓名與類別為必填欄位');
}
if (!is_numeric($lat) || !is_numeric($lng)) {
    json_error('座標資訊錯誤（lat/lng 必須為數值）');
}

$pdo = db();

try {
    // 先抓原始資料，做權限檢查
    $sqlOrig = 'SELECT id, organization_id FROM places WHERE id = :id AND is_active = 1';
    $stmtOrig = $pdo->prepare($sqlOrig);
    $stmtOrig->execute(array(':id' => $id));
    $orig = $stmtOrig->fetch();

    if (!$orig) {
        json_error('找不到要編輯的標記', 404);
    }

    if (($user['role'] ?? '') !== 'ADMIN'
        && (int)$orig['organization_id'] !== (int)$user['organization_id']
    ) {
        json_error('無權限編輯此標記', 403);
    }

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

    $params = array(
        ':id'              => $id,
        ':serviceman_name' => $soldierName,
        ':category'        => $category,
        ':visit_target'    => ($targetName !== '' ? $targetName : null),
        ':visit_name'      => ($visitName !== '' ? $visitName : null),
        ':note'            => ($note !== '' ? $note : null),
        ':lat'             => (float)$lat,
        ':lng'             => (float)$lng,
        ':address_text'    => ($address !== '' ? $address : null),
        ':township'        => ($township !== '' ? $township : null),
    );

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // 回傳更新後資料
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
               WHERE id = :id';

    $stmtGet = $pdo->prepare($sqlGet);
    $stmtGet->execute(array(':id' => $id));
    $row = $stmtGet->fetch();

    json_success($row);

} catch (Throwable $e) {
    json_error('更新標記時發生錯誤：' . $e->getMessage(), 500);
}
