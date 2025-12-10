<?php
/**
 * Path: Public/dev_logout.php
 * 說明: 強制登出工具（開一次就把目前 Session 清掉，然後導回 /login）
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/app.php';

// 啟動 Session
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// 清空所有 Session 內容
$_SESSION = [];

// 如果有使用 Cookie 儲存 Session，把 Cookie 一併清除
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'],
        $params['domain'],
        $params['secure'],
        $params['httponly']
    );
}

// 銷毀 Session
session_destroy();

// 導回登入頁
header('Location: ' . route_url('login'));
exit;
