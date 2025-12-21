<?php
/**
 * Path: Public/api/auth/logout.php
 * 說明: 登出（POST /api/auth/logout）
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

/**
 * ✅ 同步清除 device_id（避免放棄驗證後仍殘留）
 * 注意 secure 判斷：若你有 X-Forwarded-Proto=https 就視為 https
 */
$isHttps = false;
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') $isHttps = true;
if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') $isHttps = true;

setcookie('device_id', '', [
    'expires'  => time() - 3600,
    'path'     => '/',
    'secure'   => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);

json_success(['message' => '已登出']);
