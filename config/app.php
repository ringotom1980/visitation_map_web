<?php
// config/app.php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

define('APP_NAME', env('APP_NAME', '遺眷親訪地圖'));
define('APP_ENV', env('APP_ENV', 'local'));

define('BASE_URL', env('APP_BASE_URL', '/visitation_map_web/Public'));

// 資料庫設定
define('DB_HOST', env('DB_HOST', 'localhost'));
define('DB_NAME', env('DB_NAME', 'visitation_map'));
define('DB_USER', env('DB_USER', 'root'));
define('DB_PASS', env('DB_PASS', ''));
define('DB_CHARSET', env('DB_CHARSET', 'utf8mb4'));

// Session name
session_name('visitation_map_session');
