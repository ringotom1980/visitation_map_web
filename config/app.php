<?php
/**
 * Path: config/app.php
 * 說明: 系統層級設定常數 + 資源 URL helper（採用 filemtime 智能版本）
 */

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

// ===== 系統設定 =====
define('APP_NAME', env('APP_NAME', '遺眷親訪地圖'));
define('APP_ENV', env('APP_ENV', 'local'));

// 網頁的 base URL（對瀏覽器）
// 目前部署在 /visitation_map_web/Public 底下
define('BASE_URL', rtrim(env('APP_BASE_URL', '/visitation_map_web/Public'), '/'));

// 靜態資源版本號（已改為「備援用途」）
// 主要版本號來自檔案本身的 filemtime()
// 若檔案不存在，才會用這個或 time() 當備援
define('ASSET_VERSION', env('ASSET_VERSION', ''));

// ===== 資料庫設定（這幾個就是 db.php 用到的常數） =====
define('DB_HOST', env('DB_HOST', 'localhost'));
define('DB_NAME', env('DB_NAME', 'visitation_map'));
define('DB_USER', env('DB_USER', 'root'));
define('DB_PASS', env('DB_PASS', ''));
define('DB_CHARSET', env('DB_CHARSET', 'utf8mb4'));

// ===== Google Maps API Key =====
define('GOOGLE_MAPS_API_KEY', env('GOOGLE_MAPS_API_KEY', ''));

// ===== Map provider =====
define('MAP_PROVIDER', strtolower(env('MAP_PROVIDER', 'google')));
define('MAPTILER_API_KEY', env('MAPTILER_API_KEY', ''));
define('MAPTILER_STYLE_URL', env('MAPTILER_STYLE_URL', ''));

// ===== Auth options =====
define('AUTH_DEVICE_OTP_ENABLED', in_array(strtolower((string)env('AUTH_DEVICE_OTP_ENABLED', 'false')), ['1', 'true', 'yes', 'on'], true));

// Session name
session_name('visitation_map_session');

// ===== 共用 helper 函式 =====

if (!function_exists('asset_url')) {
    /**
     * 產生附帶版本號的資源 URL（方案 C：filemtime 智能版本）
     *
     * 用法: asset_url('assets/css/login.css')
     *
     * 規則：
     *  1. 以 BASE_URL 為開頭，拼上相對路徑 $path
     *  2. 嘗試尋找對應實體檔案：config/../Public/{path}
     *  3. 若檔案存在 → 使用 filemtime() 當版本號
     *  4. 若檔案不存在 →
     *       - 若 ASSET_VERSION 有值 → 使用 ASSET_VERSION
     *       - 否則使用 time()，避免 404 被快取
     */
    function asset_url(string $path): string
    {
        // URL 前半段：給瀏覽器看的 base（/visitation_map_web/Public）
        $base = rtrim(BASE_URL, '/');

        // 統一路徑格式：前面一定有一個 '/'
        $relativePath = '/' . ltrim($path, '/');

        // 實體檔案路徑：以 config 資料夾為基準往上找 Public
        $filePath = __DIR__ . '/../Public' . $relativePath;

        if (file_exists($filePath)) {
            // 檔案存在 → 以最後修改時間當版本號
            $ver = (string)filemtime($filePath);
        } elseif (ASSET_VERSION !== '') {
            // 檔案不存在，但你有設定 ASSET_VERSION → 當成手動版本號
            $ver = (string)ASSET_VERSION;
        } else {
            // 檔案不存在且沒有 ASSET_VERSION → 用 time() 避免 404 被快取
            $ver = (string)time();
        }

        return $base . $relativePath . '?v=' . rawurlencode($ver);
    }
}

if (!function_exists('route_url')) {
    /**
     * 產生對外路由 URL（例如 /login, /app）
     * 目前你的 .htaccess 已經把 /login → Public/index.php
     * 所以這裡維持簡單回傳 path 即可。
     */
    function route_url(string $path): string
    {
        $path = '/' . ltrim($path, '/');
        return $path;
    }
}

if (!function_exists('google_maps_key')) {
    /**
     * 取得 Google Maps API Key（來自 .env）
     */
    function google_maps_key(): string
    {
        return GOOGLE_MAPS_API_KEY;
    }
}

if (!function_exists('map_provider')) {
    /**
     * 取得目前地圖供應商：google / maplibre
     */
    function map_provider(): string
    {
        return MAP_PROVIDER === 'maplibre' ? 'maplibre' : 'google';
    }
}

if (!function_exists('maptiler_key')) {
    /**
     * 取得 MapTiler API Key（來自 .env）
     */
    function maptiler_key(): string
    {
        return MAPTILER_API_KEY;
    }
}

if (!function_exists('maptiler_style_url')) {
    /**
     * MapLibre 使用的 MapTiler style URL。
     */
    function maptiler_style_url(): string
    {
        if (MAPTILER_STYLE_URL !== '') {
            return MAPTILER_STYLE_URL;
        }

        $key = maptiler_key();
        if ($key === '') {
            return '';
        }

        return 'https://api.maptiler.com/maps/streets-v2/style.json?key=' . rawurlencode($key);
    }
}

if (!function_exists('auth_device_otp_enabled')) {
    /**
     * 是否啟用登入後裝置 OTP 驗證。
     */
    function auth_device_otp_enabled(): bool
    {
        return AUTH_DEVICE_OTP_ENABLED;
    }
}
