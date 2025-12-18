<?php

/**
 * Path: Public/api/places/update.php
 * 說明: 編輯標記（新版 places schema）
 * 
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
// ✅ 禁止快取（避免 CDN / 代理 / 瀏覽器回舊資料）
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

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

$id          = isset($input['id']) ? (int)$input['id'] : 0;
$category    = trim((string)($input['category'] ?? ''));
$visitName   = trim((string)($input['visit_name'] ?? ''));
$condNo      = trim((string)($input['condolence_order_no'] ?? ''));
$over65      = strtoupper(trim((string)($input['beneficiary_over65'] ?? 'N')));
$note        = trim((string)($input['note'] ?? ''));

$soldierName = trim((string)($input['serviceman_name'] ?? ($input['soldier_name'] ?? '')));
$targetName  = trim((string)($input['visit_target'] ?? ($input['target_name'] ?? '')));
$address     = trim((string)($input['address_text'] ?? ($input['address'] ?? '')));

// ✅ 先拿 PDO
$pdo = db();

// 地址解析（戶籍地 town_code）— 不與列管強制一致
require_once __DIR__ . '/../common/address_parser.php';
$addressTownCode = null;
if ($address !== '') {
    $addressTownCode = parse_address_to_town_code($pdo, $address);
}

// 列管欄位（可與戶籍不同）
$mdist       = trim((string)($input['managed_district'] ?? ($input['township'] ?? '')));
$mtownCode   = trim((string)($input['managed_town_code'] ?? ''));
$mcountyCode = trim((string)($input['managed_county_code'] ?? ''));

// lat/lng：可選（未帶沿用 DB）
$hasLat = array_key_exists('lat', $input) && $input['lat'] !== '' && $input['lat'] !== null;
$hasLng = array_key_exists('lng', $input) && $input['lng'] !== '' && $input['lng'] !== null;
$lat = $input['lat'] ?? null;
$lng = $input['lng'] ?? null;

if ($id <= 0) json_error('參數錯誤：缺少 id', 400);
if ($soldierName === '' || $category === '' || $condNo === null) {
    json_error('官兵姓名、類別、撫卹令號為必填欄位', 400);
}

if (($hasLat && !is_numeric($lat)) || ($hasLng && !is_numeric($lng))) json_error('座標資訊錯誤（lat/lng 必須為數值）', 400);
if ($over65 !== 'Y' && $over65 !== 'N') $over65 = 'N';

// 空字串轉 NULL
$mdist       = ($mdist === '') ? null : $mdist;
$mtownCode   = ($mtownCode === '') ? null : $mtownCode;
$mcountyCode = ($mcountyCode === '') ? null : $mcountyCode;
$targetName  = ($targetName === '') ? null : $targetName;
$visitName   = ($visitName === '') ? null : $visitName;
$condNo      = ($condNo === '') ? null : $condNo;
$address     = ($address === '') ? null : $address;
$note        = ($note === '') ? null : $note;
$addressTownCode = ($addressTownCode === '' ? null : $addressTownCode);
try {
    $pdo->beginTransaction();
    // 先抓原始資料：權限 + 既有座標
    $stmtOrig = $pdo->prepare('SELECT id, organization_id, lat, lng FROM places WHERE id = :id LIMIT 1');
    $stmtOrig->execute(['id' => $id]);
    $orig = $stmtOrig->fetch(PDO::FETCH_ASSOC);

    if (!$orig) {
        throw new RuntimeException('找不到要編輯的標記');
    }

    if (($user['role'] ?? '') !== 'ADMIN'
        && (int)$orig['organization_id'] !== (int)($user['organization_id'] ?? 0)
    ) {
        throw new RuntimeException('無權限編輯此標記');
    }

    $finalLat = $hasLat ? (float)$lat : (float)$orig['lat'];
    $finalLng = $hasLng ? (float)$lng : (float)$orig['lng'];

    // 若有 town_code 但未帶 county_code → 由 admin_towns 推得
    if ($mtownCode && !$mcountyCode) {
        $stmtCC = $pdo->prepare('SELECT county_code FROM admin_towns WHERE town_code = :tc LIMIT 1');
        $stmtCC->execute(['tc' => $mtownCode]);
        $mcountyCode = $stmtCC->fetchColumn() ?: null;
    }

    $sql = 'UPDATE places
            SET
                updated_by_user_id   = :updated_by,
                serviceman_name      = :serviceman_name,
                category             = :category,
                visit_target         = :visit_target,
                condolence_order_no  = :cond_no,
                visit_name           = :visit_name,
                beneficiary_over65   = :over65,
                note                 = :note,
                lat                  = :lat,
                lng                  = :lng,
                address_text         = :address_text,
                managed_district     = :mdist,
                managed_town_code    = :mtown_code,
                managed_county_code  = :mcounty_code,
                address_town_code    = :address_town_code,
                updated_at           = NOW()
            WHERE id = :id';

    /**
     * ✅ 重要：execute 用「不帶冒號」key，避免 driver 差異造成 HY093
     */
    $params = [
        'id'                => $id,
        'updated_by'        => (int)$user['id'],
        'serviceman_name'   => $soldierName,
        'category'          => $category,
        'visit_target'      => $targetName,
        'cond_no'           => $condNo,
        'visit_name'        => $visitName,
        'over65'            => $over65,
        'note'              => $note,
        'lat'               => $finalLat,
        'lng'               => $finalLng,
        'address_text'      => $address,
        'mdist'             => $mdist,
        'mtown_code'        => $mtownCode,
        'mcounty_code'      => $mcountyCode,
        'address_town_code' => $addressTownCode,
    ];

    /**
     * ✅ 執行前自動檢查 placeholder 數量/名稱是否一致，直接抓出 HY093 根因
     */
    preg_match_all('/:([a-zA-Z0-9_]+)/', $sql, $m);
    $need = array_values(array_unique($m[1] ?? []));
    $have = array_keys($params);

    $missing = array_values(array_diff($need, $have));
    $extra   = array_values(array_diff($have, $need));

    if (!empty($missing) || !empty($extra)) {
        throw new RuntimeException('SQL 參數不一致（會導致 HY093）');
    }
    // ✅ 更新後讀回（同支 API 直接回最新資料，前端不用再 GET）
    // 注意：這裡用 :id placeholder，execute 用 ['id'=>...]（不帶冒號）即可
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

                -- legacy aliases
                p.serviceman_name AS soldier_name,
                p.visit_target    AS target_name,
                p.address_text    AS address
           FROM places p
           LEFT JOIN organizations o ON o.id = p.organization_id
           LEFT JOIN users u ON u.id = p.updated_by_user_id
           WHERE p.id = :id
           LIMIT 1';



    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // ✅ 立即在同一條連線/同一個 transaction 內讀回最新值
    $stmtGet = $pdo->prepare($sqlGet);
    $stmtGet->execute(['id' => $id]); // 不帶冒號 key（跟你上面 params 風格一致）
    $row = $stmtGet->fetch(PDO::FETCH_ASSOC);

    $pdo->commit();

    if (!$row) {
        json_error('更新後讀取失敗（places/get empty）', 500);
    }

    json_success($row);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_error('更新標記時發生錯誤：' . $e->getMessage(), 500);
}
