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

// 2) organizations.county_code
$sqlOrg = "SELECT county_code FROM organizations WHERE id = :id LIMIT 1";
$st = $pdo->prepare($sqlOrg);
$st->execute([':id' => $orgId]);
$org = $st->fetch(PDO::FETCH_ASSOC);

$countyCode = $org ? (string)($org['county_code'] ?? '') : '';
if ($countyCode === '') {
  json_success([]);
}

// 3) 撈 admin_towns
$sql = "SELECT town_code, town_name, county_code, county_name
        FROM admin_towns
        WHERE county_code = :cc
          AND is_active = 1
        ORDER BY town_name ASC";
$st2 = $pdo->prepare($sql);
$st2->execute([':cc' => $countyCode]);
$rows = $st2->fetchAll(PDO::FETCH_ASSOC);

// ✅ 回傳格式固定：success + data(陣列)
json_success($rows);
