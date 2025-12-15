<?php
/**
 * Path: Public/api/managed_towns/list.php
 * 說明: 依登入者所屬 organization 的轄區（organization_counties）限制，
 *       回傳可選的鄉鎮市區清單（admin_towns）
 * 回傳: { success:true, data:{ data:[{town_code,town_name,county_code,county_name}] } }
 */
declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed', 405);
}

$user = current_user();
if (!$user) {
    json_error('尚未登入', 401);
}

$pdo = db();

// 使用者所屬單位
$orgId = (int)($user['organization_id'] ?? 0);
if ($orgId <= 0) {
    json_ok(['data' => []]);
}

// 1) 取此 organization 可管理的 county_code 清單（可多筆）
$sqlCounties = "SELECT county_code
                FROM organization_counties
                WHERE organization_id = :org_id
                  AND is_active = 1";
$st = $pdo->prepare($sqlCounties);
$st->execute([':org_id' => $orgId]);
$countyCodes = $st->fetchAll(PDO::FETCH_COLUMN, 0);

// 若 organization_counties 尚未設定，才退回 organizations.county_code（保底）
if (!$countyCodes) {
    $sqlOrg = "SELECT county_code FROM organizations WHERE id = :id LIMIT 1";
    $stOrg = $pdo->prepare($sqlOrg);
    $stOrg->execute([':id' => $orgId]);
    $org = $stOrg->fetch(PDO::FETCH_ASSOC);
    $fallback = $org ? (string)($org['county_code'] ?? '') : '';
    $countyCodes = $fallback !== '' ? [$fallback] : [];
}

if (!$countyCodes) {
    json_ok(['data' => []]);
}

// 2) 用 IN() 撈 admin_towns（注意欄位是 is_active）
$placeholders = implode(',', array_fill(0, count($countyCodes), '?'));

$sql = "SELECT town_code, town_name, county_code, county_name
        FROM admin_towns
        WHERE county_code IN ($placeholders)
          AND is_active = 1
        ORDER BY county_code ASC, town_name ASC";

$st2 = $pdo->prepare($sql);
$st2->execute(array_values($countyCodes));
$rows = $st2->fetchAll(PDO::FETCH_ASSOC);

json_ok(['data' => $rows]);
