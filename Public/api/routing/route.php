<?php
/**
 * Path: Public/api/routing/route.php
 * 說明: 道路路線規劃 proxy（openrouteservice Directions）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

$user = require_api_user();

if (routing_provider() !== 'openrouteservice') {
    json_error('道路路線服務尚未啟用，請直接用 Google 導航', 503, 'ROUTING_DISABLED');
}

$apiKey = openrouteservice_key();
if ($apiKey === '') {
    json_error('道路路線服務尚未設定，請直接用 Google 導航', 503, 'ROUTING_NOT_CONFIGURED');
}

$raw = file_get_contents('php://input');
$input = $raw ? json_decode($raw, true) : null;
if (!is_array($input)) {
    json_error('路線資料格式錯誤', 400, 'INVALID_JSON');
}

$coordinates = $input['coordinates'] ?? null;
$profile = (string)($input['profile'] ?? 'driving-car');

$allowedProfiles = ['driving-car', 'foot-walking'];
if (!in_array($profile, $allowedProfiles, true)) {
    $profile = 'driving-car';
}

if (!is_array($coordinates) || count($coordinates) < 2) {
    json_error('路線資料不足，請至少提供起點與一個拜訪點', 400, 'ROUTE_TOO_SHORT');
}

if (count($coordinates) > 50) {
    json_error('路線點超過 50 個，無法使用免費道路路線服務，請直接用 Google 導航', 400, 'TOO_MANY_WAYPOINTS');
}

$cleanCoords = [];
foreach ($coordinates as $pair) {
    if (!is_array($pair) || count($pair) < 2) {
        json_error('路線座標格式錯誤', 400, 'INVALID_COORDINATE');
    }

    $lng = (float)$pair[0];
    $lat = (float)$pair[1];

    if (!is_finite($lat) || !is_finite($lng) || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        json_error('路線座標超出範圍', 400, 'INVALID_COORDINATE');
    }

    $cleanCoords[] = [$lng, $lat];
}

function ensure_routing_usage_table(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS routing_usage_daily (
            usage_date date NOT NULL,
            provider varchar(40) NOT NULL,
            request_count int NOT NULL DEFAULT 0,
            updated_at datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
            PRIMARY KEY (usage_date, provider)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

function reserve_routing_quota(PDO $pdo, string $provider, int $limit): int
{
    ensure_routing_usage_table($pdo);

    $pdo->beginTransaction();
    try {
        $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Taipei')))->format('Y-m-d');

        $stmt = $pdo->prepare("
            SELECT request_count
            FROM routing_usage_daily
            WHERE usage_date = :d AND provider = :p
            FOR UPDATE
        ");
        $stmt->execute([':d' => $today, ':p' => $provider]);
        $count = $stmt->fetchColumn();

        if ($count === false) {
            $stmt = $pdo->prepare("
                INSERT INTO routing_usage_daily (usage_date, provider, request_count)
                VALUES (:d, :p, 0)
            ");
            $stmt->execute([':d' => $today, ':p' => $provider]);
            $count = 0;
        } else {
            $count = (int)$count;
        }

        if ($count >= $limit) {
            $pdo->commit();
            json_error('今日免費額度已用完', 429, 'ROUTING_QUOTA_EXCEEDED');
        }

        $stmt = $pdo->prepare("
            UPDATE routing_usage_daily
            SET request_count = request_count + 1
            WHERE usage_date = :d AND provider = :p
        ");
        $stmt->execute([':d' => $today, ':p' => $provider]);

        $pdo->commit();
        return $count + 1;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function ors_request(string $apiKey, string $profile, array $coordinates): array
{
    $url = 'https://api.openrouteservice.org/v2/directions/' . rawurlencode($profile) . '/geojson';
    $payload = json_encode([
        'coordinates' => $coordinates,
        'instructions' => false,
        'preference' => 'recommended',
        'units' => 'm',
    ], JSON_UNESCAPED_SLASHES);

    if ($payload === false) {
        throw new RuntimeException('JSON encode failed');
    }

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: ' . $apiKey,
                'Content-Type: application/json; charset=utf-8',
                'Accept: application/json, application/geo+json',
            ],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_TIMEOUT => 20,
        ]);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false || $body === null) {
            throw new RuntimeException($err ?: 'openrouteservice request failed');
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Authorization: {$apiKey}\r\nContent-Type: application/json; charset=utf-8\r\nAccept: application/json, application/geo+json\r\n",
                'content' => $payload,
                'timeout' => 20,
                'ignore_errors' => true,
            ],
        ]);
        $body = file_get_contents($url, false, $context);
        $status = 0;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $status = (int)$m[1];
        }
        if ($body === false) {
            throw new RuntimeException('openrouteservice request failed');
        }
    }

    $json = json_decode((string)$body, true);
    if (!is_array($json)) {
        throw new RuntimeException('openrouteservice returned invalid JSON');
    }

    return ['status' => $status, 'json' => $json];
}

try {
    $used = reserve_routing_quota(db(), 'openrouteservice', routing_daily_limit());
    $res = ors_request($apiKey, $profile, $cleanCoords);
    $status = (int)$res['status'];
    $ors = $res['json'];

    if ($status === 429) {
        json_error('今日免費額度已用完', 429, 'ROUTING_QUOTA_EXCEEDED');
    }

    if ($status < 200 || $status >= 300) {
        $msg = $ors['error']['message'] ?? '道路路線服務暫時無法使用，請直接用 Google 導航';
        json_error((string)$msg, 502, 'ROUTING_PROVIDER_ERROR');
    }

    $feature = $ors['features'][0] ?? null;
    $geometry = $feature['geometry']['coordinates'] ?? null;
    if (!is_array($geometry) || count($geometry) < 2) {
        json_error('道路路線服務沒有回傳可用路線，請直接用 Google 導航', 502, 'ROUTE_NOT_FOUND');
    }

    $summary = $feature['properties']['summary'] ?? [];
    json_success([
        'provider' => 'openrouteservice',
        'profile' => $profile,
        'geometry' => $geometry,
        'distance_m' => isset($summary['distance']) ? (float)$summary['distance'] : null,
        'duration_s' => isset($summary['duration']) ? (float)$summary['duration'] : null,
        'usage' => [
            'used_today' => $used,
            'daily_limit' => routing_daily_limit(),
        ],
        'attribution' => 'openrouteservice.org by HeiGIT | Map data OpenStreetMap contributors',
    ]);
} catch (Throwable $e) {
    json_error('道路路線服務暫時無法使用，請直接用 Google 導航', 500, 'ROUTING_ERROR');
}
