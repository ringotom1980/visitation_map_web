<?php
// config/auth.php

declare(strict_types=1);

require_once __DIR__ . '/app.php';
require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/**
 * 取得目前登入的 user_id（沒有則回傳 null）
 */
function current_user_id(): ?int
{
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

/**
 * 取得目前登入使用者完整資料（users 表）
 */
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

/**
 * 確認已登入，否則導回登入頁
 */
function require_login(): void
{
    if (!current_user_id()) {
        header('Location: ' . BASE_URL . '/index.php');
        exit;
    }
}

/**
 * 確認為 ADMIN，否則 403 或導回 /app
 */
function require_admin(): void
{
    $user = current_user();
    if (!$user || ($user['role'] ?? '') !== 'ADMIN') {
        http_response_code(403);
        echo 'Forbidden';
        exit;
    }
}
