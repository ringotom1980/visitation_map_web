<?php
/**
 * Path: Public/api/places/create.php
 * 說明: 新增標記（POST /api/places/create.php）
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

$soldierName = trim($input['soldier_name'] ?? '');
$category    = trim($input['category'] ?? '');
$targetName  = trim($input['target_name'] ?? '');
$visitName   = trim($input['visit_name'] ?? '');
$address     = trim($input['address'] ?? '');
$township    = trim($input['township'] ?? '');
$note        = trim($input['note'] ?? '');
$lat         = $input['lat'] ?? null;
$lng         = $input['lng'] ?? null;

// 基本驗證
if ($soldierName === '' || $category === '') {
    json_error('官兵姓名與類別為必填欄位');
}
if (!is_numeric($lat) || !is_numeric($lng)) {
    json_error('座標資訊錯誤（lat/lng 必須為數值）');
}

$pdo = db();

try {
    $sql = 'INSERT INTO places (
                organization_id,
                created_by_user_id,
                serviceman_name,
                category,
                visit_target,
                visit_name,
                note,
                lat,
                lng,
                address_text,
                township,
                is_active,
                created_at,
                updated_at
            ) VALUES (
                :org_id,
                :user_id,
                :serviceman_name,
                :category,
                :visit_target,
                :visit_name,
                :note,
                :lat,
                :lng,
                :address_text,
                :township,
                1,
                NOW(),
                NOW()
            )';

    $params = array(
        ':org_id'         => $user['organization_id'],
        ':user_id'        => $user['id'],
        ':serviceman_name'=> $soldierName,
        ':category'       => $category,
        ':visit_target'   => ($targetName !== '' ? $targetName : null),
        ':visit_name'     => ($visitName !== '' ? $visitName : null),
        ':note'           => ($note !== '' ? $note : null),
        ':lat'            => (float)$lat,
        ':lng'            => (float)$lng,
        ':address_text'   => ($address !== '' ? $address : null),
        ':township'       => ($township !== '' ? $township : null),
    );

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $newId = (int)$pdo->lastInsertId();

    // 回傳新資料（用 list 的 alias 規格）
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
    $stmtGet->execute(array(':id' => $newId));
    $row = $stmtGet->fetch();

    json_success($row);

} catch (Throwable $e) {
    json_error('新增標記時發生錯誤：' . $e->getMessage(), 500);
}
