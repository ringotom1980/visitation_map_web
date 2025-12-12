<?php
/**
 * Path: Public/api/auth/me.php
 * 說明: 回傳目前登入使用者資料（GET /api/auth/me）
 *       - A2：由 organization_name 推定縣市 + 提供縣市中心座標做定位 fallback
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

$user = current_user();
if (!$user) {
    json_error('尚未登入', 401);
}

/**
 * 由單位名稱推定縣市（以 organizations.name 為準）
 * 例：臺中市後備指揮部 -> 臺中市；金門縣後備服務中心 -> 金門縣
 */
function infer_county_from_org_name(string $orgName): string
{
    $name = trim($orgName);

    // 常見字形統一（避免臺/台混用）
    $name = str_replace(['台北', '台中', '台南', '台東', '台灣'], ['臺北', '臺中', '臺南', '臺東', '臺灣'], $name);

    // 桃園縣已升格，但你的 seed 仍用「桃園縣」
    if (mb_strpos($name, '桃園縣') !== false) return '桃園市';

    $candidates = [
        '基隆市','新北市','臺北市','桃園市','新竹市','新竹縣','苗栗縣','臺中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣',
        '臺南市','高雄市','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'
    ];

    foreach ($candidates as $c) {
        if (mb_strpos($name, $c) !== false) return $c;
    }

    // 若真的推不出來，回空字串（前端再降級處理）
    return '';
}

/**
 * 縣市中心座標（桌機/定位失敗 fallback 用）
 * 註：這是「可用」優先的近似值，不是精準測量點。
 */
function county_center(string $county): array
{
    $map = [
        '基隆市' => [25.128, 121.741],
        '新北市' => [25.012, 121.465],
        '臺北市' => [25.033, 121.565],
        '桃園市' => [24.993, 121.301],
        '新竹市' => [24.806, 120.968],
        '新竹縣' => [24.839, 121.003],
        '苗栗縣' => [24.560, 120.821],
        '臺中市' => [24.147, 120.673],
        '彰化縣' => [24.075, 120.545],
        '南投縣' => [23.961, 120.971],
        '雲林縣' => [23.709, 120.542],
        '嘉義市' => [23.480, 120.449],
        '嘉義縣' => [23.451, 120.255],
        '臺南市' => [22.999, 120.227],
        '高雄市' => [22.627, 120.301],
        '屏東縣' => [22.667, 120.486],
        '宜蘭縣' => [24.757, 121.753],
        '花蓮縣' => [23.987, 121.601],
        '臺東縣' => [22.756, 121.145],
        '澎湖縣' => [23.571, 119.580],
        '金門縣' => [24.432, 118.318],
        '連江縣' => [26.160, 119.949],
    ];

    return $map[$county] ?? [23.700, 120.900]; // 台灣大致中心（最後保底）
}

$orgName = (string)($user['organization_name'] ?? '');
$county = $orgName !== '' ? infer_county_from_org_name($orgName) : '';
list($clat, $clng) = county_center($county);

json_success([
    'id'                => (int)$user['id'],
    'name'              => $user['name'],
    'email'             => $user['email'],
    'phone'             => $user['phone'],
    'title'             => $user['title'],
    'organization_id'   => (int)$user['organization_id'],
    'organization_name' => $orgName,
    'organization_county' => $county,
    'county_center_lat' => $clat,
    'county_center_lng' => $clng,
    'role'              => $user['role'],
    'status'            => $user['status'],
]);
