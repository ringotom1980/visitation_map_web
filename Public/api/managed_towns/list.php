<?php
/**
 * Path: Public/api/managed_towns/list.php
 * 說明: 依登入者 organization 限制，回傳可選鄉鎮市區清單
 * 回傳: { success:true, data:[{town_code,town_name,county_code,county_name}] }
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

// 1) 使用者所屬單位 organization_id
$orgId = (int)($user['organization_id'] ?? 0);
if ($orgId <= 0) {
  json_success([]); // 直接回陣列
}

// 2) 先取 organizations.county_code（主縣市碼）
$sqlOrg = "SELECT county_code FROM organizations WHERE id = :id LIMIT 1";
$st = $pdo->prepare($sqlOrg);
$st->execute([':id' => $orgId]);
$org = $st->fetch(PDO::FETCH_ASSOC);

$countyCodes = [];
$mainCountyCode = $org ? trim((string)($org['county_code'] ?? '')) : '';
if ($mainCountyCode !== '') {
  $countyCodes[] = $mainCountyCode;
}

// 3) 再取 organization_counties（額外縣市碼，多筆）— 只取啟用
$sqlExtra = "SELECT county_code
             FROM organization_counties
             WHERE organization_id = :oid
               AND is_active = 1";
$stExtra = $pdo->prepare($sqlExtra);
$stExtra->execute([':oid' => $orgId]);
$extra = $stExtra->fetchAll(PDO::FETCH_COLUMN);

if (is_array($extra)) {
  foreach ($extra as $cc) {
    $cc = trim((string)$cc);
    if ($cc !== '') $countyCodes[] = $cc;
  }
}

// 去重＋重排索引
$countyCodes = array_values(array_unique($countyCodes));

if (count($countyCodes) === 0) {
  json_success([]);
}

// 4) 撈 admin_towns：支援多個 county_code
$placeholders = [];
$params = [];

foreach ($countyCodes as $i => $cc) {
  $ph = ":cc{$i}";
  $placeholders[] = $ph;
  $params[$ph] = $cc;
}

$sql = "SELECT town_code, town_name, county_code, county_name
        FROM admin_towns
        WHERE county_code IN (" . implode(',', $placeholders) . ")
          AND is_active = 1
        ORDER BY county_name ASC, town_name ASC";

$st2 = $pdo->prepare($sql);
$st2->execute($params);
$rows = $st2->fetchAll(PDO::FETCH_ASSOC);

// ✅ 回傳格式固定：success + data(陣列)
json_success($rows);
