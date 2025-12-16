<?php

/**
 * Path: Public/api/filters/options.php
 * 說明:
 * - 回傳篩選面板動態選項（依 DB 實際存在）
 * - 居住鄉鎮：places.address_town_code JOIN admin_towns.town_code -> town_name（只顯示鄉鎮市區）
 * - 列管鄉鎮：依登入者單位允許縣市(organization_counties)取 towns，再與 places 實際用到的 managed_town_code 取交集
 * - 類別：places.category DISTINCT
 * - over65：固定（ALL/Y/N），但前端用 checkbox 呈現（單選）
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
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$isAdmin = isset($user['role']) && $user['role'] === 'ADMIN';
$orgId   = isset($user['organization_id']) ? (int)$user['organization_id'] : 0;

try {
    // ---------- where clause (依權限) ----------
    $where = "1=1";
    $params = [];
    if (!$isAdmin) {
        $where .= " AND p.organization_id = ?";
        $params[] = $orgId;
    }

    // ---------- categories ----------
    $sqlCat = "SELECT DISTINCT TRIM(p.category) AS category
             FROM places p
             WHERE $where AND p.category IS NOT NULL AND TRIM(p.category) <> ''
             ORDER BY category";
    $stCat = $pdo->prepare($sqlCat);
    $stCat->execute($params);
    $categories = [];
    while ($r = $stCat->fetch(PDO::FETCH_ASSOC)) {
        $categories[] = $r['category'];
    }

    // ---------- reside towns (by address_town_code join admin_towns) ----------
    $sqlReside = "SELECT DISTINCT p.address_town_code AS town_code, t.town_name AS town_name
                FROM places p
                JOIN admin_towns t ON t.town_code = p.address_town_code
                WHERE $where
                  AND p.address_town_code IS NOT NULL AND TRIM(p.address_town_code) <> ''
                ORDER BY t.town_name";
    $stReside = $pdo->prepare($sqlReside);
    $stReside->execute($params);
    $resideTowns = [];
    while ($r = $stReside->fetch(PDO::FETCH_ASSOC)) {
        $resideTowns[] = [
            'town_code' => $r['town_code'],
            'town_name' => $r['town_name'],
        ];
    }

    // ---------- used managed town codes (from places) ----------
    $sqlUsedManaged = "SELECT DISTINCT TRIM(p.managed_town_code) AS town_code
                     FROM places p
                     WHERE $where
                       AND p.managed_town_code IS NOT NULL AND TRIM(p.managed_town_code) <> ''";
    $stUsed = $pdo->prepare($sqlUsedManaged);
    $stUsed->execute($params);
    $usedMap = [];
    while ($r = $stUsed->fetch(PDO::FETCH_ASSOC)) {
        $usedMap[$r['town_code']] = true;
    }

    // ---------- allowed managed towns by organization_counties ----------
    if ($isAdmin) {
        $sqlAllowed = "SELECT t.town_code, t.town_name
                   FROM admin_towns t
                   WHERE t.town_code IS NOT NULL AND TRIM(t.town_code) <> ''
                   ORDER BY t.town_name";
        $stAllowed = $pdo->query($sqlAllowed);
    } else {
        // 先用 organization_counties（可多縣市）
        $sqlAllowed = "SELECT t.town_code, t.town_name
                   FROM organization_counties oc
                   JOIN admin_towns t ON t.county_code = oc.county_code
                   WHERE oc.organization_id = ?
                     AND oc.is_active = 1
                   ORDER BY t.town_name";
        $stAllowed = $pdo->prepare($sqlAllowed);
        $stAllowed->execute([$orgId]);

        // 若該單位沒設定 organization_counties，fallback 用 organizations.county_code
        if ($stAllowed->rowCount() === 0) {
            $sqlFallback = "SELECT t.town_code, t.town_name
                      FROM organizations o
                      JOIN admin_towns t ON t.county_code = o.county_code
                      WHERE o.id = ?
                      ORDER BY t.town_name";
            $stAllowed = $pdo->prepare($sqlFallback);
            $stAllowed->execute([$orgId]);
        }
    }

    $managedTowns = [];
    while ($r = $stAllowed->fetch(PDO::FETCH_ASSOC)) {
        $code = trim((string)$r['town_code']);
        if ($code === '') continue;
        // 取交集：只回傳 places 實際用到的 managed_town_code
        if (!isset($usedMap[$code])) continue;

        $managedTowns[] = [
            'town_code' => $code,
            'town_name' => $r['town_name'],
        ];
    }

    json_ok([
        'categories' => $categories,
        'reside_towns' => $resideTowns,
        'managed_towns' => $managedTowns,
        'over65' => [
            ['value' => 'ALL', 'label' => '不限'],
            ['value' => 'Y',   'label' => '是'],
            ['value' => 'N',   'label' => '否'],
        ],
    ]);
} catch (Throwable $e) {
    json_error('Server error', 500, ['detail' => $e->getMessage()]);
}
