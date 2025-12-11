<?php
/**
 * Path: config/auth.php
 * 說明: Session 啟動 + 登入 / 角色相關共用函式
 */

declare(strict_types=1);

require_once __DIR__ . '/app.php';
require_once __DIR__ . '/db.php';

// 啟動 Session（若尚未啟動）
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/**
 * 取得目前使用者 ID（未登入回 null）
 *
 * @return int|null
 */
function current_user_id(): ?int
{
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

/**
 * 取得目前使用者角色（未登入回 null）
 *
 * @return string|null
 */
function current_user_role(): ?string
{
    return $_SESSION['role'] ?? null;
}

/**
 * 目前使用者是否為管理者
 *
 * @return bool
 */
function is_admin(): bool
{
    return current_user_role() === 'ADMIN';
}

/**
 * 從資料庫取得目前使用者完整資料
 * （包含 organization_name）
 *
 * @return array|null
 */
function current_user(): ?array
{
    $uid = current_user_id();
    if (!$uid) {
        return null;
    }

    // 簡單快取，避免同一次請求重複查 DB
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    $pdo = db();

    $sql = 'SELECT u.id,
                   u.name,
                   u.email,
                   u.phone,
                   u.title,
                   u.organization_id,
                   u.role,
                   u.status,
                   o.name AS organization_name
            FROM users u
            LEFT JOIN organizations o ON o.id = u.organization_id
            WHERE u.id = :id
            LIMIT 1';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id' => $uid]);
    $user = $stmt->fetch();

    if (!$user) {
        return null;
    }

    $cache = $user;
    return $user;
}

/**
 * 頁面用：強制登入（未登入就導回 /login）
 *
 * 用在：
 *   - Public/app.php
 *   - Public/profile.php
 *   - 其他登入後才能看的頁面
 */
function require_login_page(): void
{
    if (!current_user_id()) {
        header('Location: ' . route_url('login'));
        exit;
    }
}

/**
 * 頁面用：強制管理者（未登入或不是 ADMIN 就導回）
 *
 * 用在：
 *   - Public/admin/index.php
 */
function require_admin_page(): void
{
    if (!current_user_id()) {
        // 未登入 → 回登入頁
        header('Location: ' . route_url('login'));
        exit;
    }

    if (!is_admin()) {
        // 已登入但不是管理者 → 回主地圖
        header('Location: ' . route_url('app'));
        exit;
    }
}
/**
 * API 用：必須登入（未登入回 JSON）
 *
 * 用在：
 *   - Public/api/** 所有 API
 */
function require_login(): void
{
    if (!current_user_id()) {
        json_error('尚未登入或登入已過期', 401);
    }
}
/**
 * API 用：必須為 ADMIN（未登入或非管理員回 JSON）
 */
function require_admin(): void
{
    if (!current_user_id()) {
        json_error('尚未登入', 401);
    }
    if (!is_admin()) {
        json_error('無權限操作（需要管理者）', 403);
    }
}
