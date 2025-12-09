<?php
/**
 * Path: config/app.php
 * 說明: 系統層級設定常數 + 資源 URL helper
 */

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

// ===== 系統設定 =====
define('APP_NAME', env('APP_NAME', '遺眷親訪地圖'));
define('APP_ENV', env('APP_ENV', 'local'));

// 網頁的 base URL（對瀏覽器）
// 目前部署在 /visitation_map_web/Public 底下
define('BASE_URL', rtrim(env('APP_BASE_URL', '/visitation_map_web/Public'), '/'));

// 靜態資源版本號（避免快取問題，改 CSS/JS 時改這個即可）
define('ASSET_VERSION', env('ASSET_VERSION', '1'));

// ===== 資料庫設定（這幾個就是 db.php 用到的常數） =====
define('DB_HOST', env('DB_HOST', 'localhost'));
define('DB_NAME', env('DB_NAME', 'visitation_map'));
define('DB_USER', env('DB_USER', 'root'));
define('DB_PASS', env('DB_PASS', ''));
define('DB_CHARSET', env('DB_CHARSET', 'utf8mb4'));

// Session name
session_name('visitation_map_session');

// ===== 共用 helper 函式 =====

if (!function_exists('asset_url')) {
    /**
     * 產生附帶版本號的資源 URL
     * 用法: asset_url('assets/css/login.css')
     */
    function asset_url(string $path): string
    {
        $base = rtrim(BASE_URL, '/');
        $path = '/' . ltrim($path, '/');
        $ver  = ASSET_VERSION ? ('?v=' . rawurlencode(ASSET_VERSION)) : '';
        return $base . $path . $ver;
    }
}

if (!function_exists('route_url')) {
    /**
     * 產生對外路由 URL（例如 /login, /app）
     */
    function route_url(string $path): string
    {
        $path = '/' . ltrim($path, '/');
        return $path;
    }
}
