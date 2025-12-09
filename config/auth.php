<?php
/**
 * Path: config/auth.php
 * 說明: Session 啟動、目前使用者、登入/權限檢查
 */

declare(strict_types=1);

require_once __DIR__ . '/app.php';
require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function current_user_id(): ?int
{
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

function current_user(): ?array
{
    $uid = current_user_id();
    if (!$uid) {
        return null;
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $uid]);
    $user = $stmt->fetch();

    return $user ?: null;
}

function require_login(): void
{
    if (!current_user_id()) {
        header('Location: ' . route_url('login'));
        exit;
    }
}

function require_admin(): void
{
    $user = current_user();
    if (!$user || ($user['role'] ?? '') !== 'ADMIN') {
        http_response_code(403);
        echo 'Forbidden';
        exit;
    }
}
