<?php
/**
 * Path: Public/api/auth/logout.php
 * 說明: 登出（POST /api/auth/logout）
 *
 * E2 正確行為：
 * - 登出只清 Session（PHPSESSID）
 * - 不清 device_id（device_id 是裝置識別，用於 Trusted Device）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// 清除 Session
$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'] ?? '/',
        $params['domain'] ?? '',
        (bool)($params['secure'] ?? false),
        (bool)($params['httponly'] ?? true)
    );
}

session_destroy();

json_success(['message' => '已登出']);
