<?php
/**
 * Path: config/auth.php
 * 說明: Session 啟動 + 登入 / 角色相關共用函式（方案 B：preauth → otp → 正式 session）
 */

declare(strict_types=1);

require_once __DIR__ . '/app.php';
require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/** ===== 正式登入（已完成 OTP） ===== */
function current_user_id(): ?int
{
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

function current_user_role(): ?string
{
    return $_SESSION['role'] ?? null;
}

function is_admin(): bool
{
    return current_user_role() === 'ADMIN';
}

function current_user(): ?array
{
    $uid = current_user_id();
    if (!$uid) return null;

    static $cache = null;
    if ($cache !== null) return $cache;

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

    if (!$user) return null;

    $cache = $user;
    return $user;
}

/** ===== preauth（帳密正確但尚未完成 DEVICE OTP） =====
 * 結構：
 * $_SESSION['preauth'] = [
 *   'uid' => int,
 *   'email' => string,
 *   'role' => string,
 *   'org_id' => int,
 *   'return_to' => string,
 *   'created_at' => int unix ts
 * ];
 */
function current_preauth(): ?array
{
    if (empty($_SESSION['preauth']) || !is_array($_SESSION['preauth'])) return null;
    $p = $_SESSION['preauth'];

    $uid = isset($p['uid']) ? (int)$p['uid'] : 0;
    $email = isset($p['email']) ? (string)$p['email'] : '';
    if ($uid <= 0 || $email === '') return null;

    return [
        'uid' => $uid,
        'email' => $email,
        'role' => isset($p['role']) ? (string)$p['role'] : '',
        'org_id' => isset($p['org_id']) ? (int)$p['org_id'] : 0,
        'return_to' => isset($p['return_to']) ? (string)$p['return_to'] : '/app',
        'created_at' => isset($p['created_at']) ? (int)$p['created_at'] : 0,
    ];
}

function require_preauth(): array
{
    $p = current_preauth();
    if (!$p) {
        json_error('驗證流程已過期，請重新登入', 401);
    }
    return $p;
}

function clear_preauth(): void
{
    unset($_SESSION['preauth']);
}

/** ===== Pages ===== */
function require_login_page(): void
{
    if (!current_user_id()) {
        header('Location: ' . route_url('login'));
        exit;
    }
}

function require_admin_page(): void
{
    if (!current_user_id()) {
        header('Location: ' . route_url('login'));
        exit;
    }
    if (!is_admin()) {
        header('Location: ' . route_url('app'));
        exit;
    }
}

/** ===== APIs ===== */
function require_login(): void
{
    if (!current_user_id()) {
        json_error('尚未登入或登入已過期', 401);
    }
}

function require_admin(): void
{
    if (!current_user_id()) {
        json_error('尚未登入', 401);
    }
    if (!is_admin()) {
        json_error('無權限操作（需要管理者）', 403);
    }
}
