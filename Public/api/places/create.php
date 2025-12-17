<?php
/**
 * Path: Public/api/places/create.php
 * 說明: 新增標記（新版 places schema）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

/**
 * 保證任何錯誤都回 JSON（避免 500 空 body）
 */
set_exception_handler(function (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => [
            'message' => $e->getMessage(),
            'type'    => get_class($e),
            'file'    => $e->getFile(),
            'line'    => $e->getLine(),
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

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
    if ($raw !== false && $raw !== '') {
        $json = json_decode($raw, true);
        if (is_array($json)) $input = $json;
    }
}

$soldierName = trim((string)($input['serviceman_name'] ?? ($input['soldier_name'] ?? '')));
$category    = trim((string)($input['category'] ?? ''));
$targetName  = trim((string)($input['visit_target'] ?? ($input['target_name'] ?? '')));
$visitName   = trim((string)($input['visit_name'] ?? ''));
$condNo      = trim((string)($input['condolence_order_no'] ?? ''));
$over65      = strtoupper(trim((string)($input['beneficiary_over65'] ?? 'N')));
$address     = trim((string)($input['address_text'] ?? ($input['address'] ?? '')));
$note        = trim((string)($input['note'] ?? ''));

// ✅ 列管三欄（district + 兩個 code）
$mdist       = trim((string)($input['managed_district'] ?? ($input['township'] ?? '')));
$mtownCode   = trim((string)($input['managed_town_code'] ?? ''));
$mcountyCode = trim((string)($input['managed_county_code'] ?? ''));

$lat = $input['lat'] ?? null;
$lng = $input['lng'] ?? null;

// 基本驗證
if ($soldierName === '' || $category === '') {
    json_error('官兵姓名與類別為必填欄位', 400);
}
if (!is_numeric($lat) || !is_numeric($lng)) {
    json_error('座標資訊錯誤（lat/lng 必須為數值）', 400);
}
if ($over65 !== 'Y' && $over65 !== 'N') $over65 = 'N';

// 空字串轉 NULL（避免寫入 ''）
$mdist     = ($mdist === '') ? null : $mdist;
$mtownCode = ($mtownCode === '') ? null : $mtownCode;
$mcountyCode = ($mcountyCode === '') ? null : $mcountyCode;
$targetName  = ($targetName === '') ? null : $targetName;
$visitName   = ($visitName === '') ? null : $visitName;
$condNo      = ($condNo === '') ? null : $condNo;
$address     = ($address === '') ? null : $address;
$note        = ($note === '') ? null : $note;

// ✅ 先拿 PDO（重要：後面會用到）
$pdo = db();

// 地址解析（戶籍地 town_code）— 不與列管強制一致
require_once __DIR__ . '/../common/address_parser.php';
$addressTownCode = null;
if ($address !== null) {
    $addressTownCode = parse_address_to_town_code($pdo, (string)$address);
}
$addressTownCode = ($addressTownCode === '' ? null : $addressTownCode);

try {
    // 若有 town_code 但未帶 county_code → 由 admin_towns 推得
    if ($mtownCode && !$mcountyCode) {
        $stmtCC = $pdo->prepare('SELECT county_code FROM admin_towns WHERE town_code = :tc LIMIT 1');
        // ✅ execute key 一律不帶冒號
        $stmtCC->execute(['tc' => $mtownCode]);
        $mcountyCode = $stmtCC->fetchColumn() ?: null;
    }

    $sql = 'INSERT INTO places (
                organization_id,
                updated_by_user_id,
                serviceman_name,
                category,
                visit_target,
                condolence_order_no,
                visit_name,
                beneficiary_over65,
                note,
                lat,
                lng,
                address_text,
                managed_district,
                managed_town_code,
                managed_county_code,
                address_town_code,
                created_at,
                updated_at
            ) VALUES (
                :org_id,
                :updated_by,
                :serviceman_name,
                :category,
                :visit_target,
                :cond_no,
                :visit_name,
                :over65,
                :note,
                :lat,
                :lng,
                :address_text,
                :mdist,
                :mtown_code,
                :mcounty_code,
                :address_town_code,
                NOW(),
                NOW()
            )';

    // ✅ execute key 一律不帶冒號（跟 update.php 對齊）
    $params = [
        'org_id'            => (int)$user['organization_id'],
        'updated_by'        => (int)$user['id'],
        'serviceman_name'   => $soldierName,
        'category'          => $category,
        'visit_target'      => $targetName,
        'cond_no'           => $condNo,
        'visit_name'        => $visitName,
        'over65'            => $over65,
        'note'              => $note,
        'lat'               => (float)$lat,
        'lng'               => (float)$lng,
        'address_text'      => $address,
        'mdist'             => $mdist,
        'mtown_code'        => $mtownCode,
        'mcounty_code'      => $mcountyCode,
        'address_town_code' => $addressTownCode,
    ];

    // ✅ 和 update.php 一樣：先檢查 placeholder 一致性，直接抓出 HY093 根因
    preg_match_all('/:([a-zA-Z0-9_]+)/', $sql, $m);
    $need = array_values(array_unique($m[1] ?? []));
    $have = array_keys($params);

    $missing = array_values(array_diff($need, $have));
    $extra   = array_values(array_diff($have, $need));

    if (!empty($missing) || !empty($extra)) {
        json_error('SQL 參數不一致（會導致 HY093）', 500, [
            'missing' => $missing,
            'extra'   => $extra,
            'need'    => $need,
            'have'    => $have,
        ]);
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $newId = (int)$pdo->lastInsertId();

    // 回傳新資料（含 legacy alias，避免前端舊 JS 掛掉）
    $sqlGet = 'SELECT
                    p.id,
                    p.serviceman_name,
                    p.category,
                    p.visit_target,
                    p.visit_name,
                    p.condolence_order_no,
                    p.beneficiary_over65,
                    p.address_text,
                    p.address_town_code,
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

    $stmtGet = $pdo->prepare($sqlGet);
    // ✅ execute key 一律不帶冒號
    $stmtGet->execute(['id' => $newId]);
    $row = $stmtGet->fetch(PDO::FETCH_ASSOC);

    json_success($row);

} catch (Throwable $e) {
    $msg = $e->getMessage();
    if (strpos($msg, 'Duplicate') !== false || strpos($msg, '1062') !== false) {
        json_error('同單位下「官兵姓名 + 受益人姓名」已存在，請確認是否重複。', 409);
    }
    json_error('新增標記時發生錯誤：' . $e->getMessage(), 500);
}
