<?php
/**
 * Path: config/auth.php
 * 說明: Session 啟動 + 登入 / 角色相關共用函式
 */

declare(strict_types=1);

require_once __DIR__ . '/app.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/permissions.php';

// 啟動 Session（若尚未啟動）
if (session_status() === PHP_SESSION_NONE) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_validate_request(): bool
{
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        return true;
    }

    $expected = (string)($_SESSION['csrf_token'] ?? '');
    if ($expected === '') {
        return false;
    }

    $actual = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    return $actual !== '' && hash_equals($expected, $actual);
}

/**
 * 取得目前使用者 ID（未登入回 null）
 *
 * @return int|null
 */
function current_user_id(): ?int
{
    $user = current_user();
    return $user ? (int)$user['id'] : null;
}

/**
 * 取得目前使用者角色（未登入回 null）
 *
 * @return string|null
 */
function current_user_role(): ?string
{
    $user = current_user();
    return $user ? (string)$user['role'] : null;
}

/**
 * 目前使用者是否為管理者
 *
 * @return bool
 */
function is_admin(): bool
{
    $user = current_user();
    return $user && user_is_admin($user);
}

/**
 * 從資料庫取得目前使用者完整資料
 * （包含 organization_name）
 *
 * @return array|null
 */
function current_user(): ?array
{
    // Read the raw session ID here: the public helpers validate through this function.
    $uid = (int)($_SESSION['user_id'] ?? 0);
    if (!$uid) {
        return null;
    }

    // 簡單快取，避免同一次請求重複查 DB
    static $cache = null;
    static $cacheId = null;
    static $loaded = false;
    if ($loaded && $cacheId === $uid) {
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
    $cacheId = $uid;
    $loaded = true;
    // A session is not authority. Recheck once per request, including negative results.
    if (!$user || ($user['status'] ?? '') !== 'ACTIVE') {
        $cache = null;
        $_SESSION = [];
        return null;
    }
    if (user_is_owner($user)) $user['role'] = 'ADMIN';
    $user['is_owner'] = user_is_owner($user);
    $_SESSION['role'] = $user['role'];
    $_SESSION['organization_id'] = (int)($user['organization_id'] ?? 0);
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
    // ✅ 若還在 OTP pending（未正式登入）→ 一律去 device-verify
    if (!current_user_id() && !empty($_SESSION['device_otp_email'])) {
        $return = rawurlencode($_SERVER['REQUEST_URI'] ?? '/app');
        header('Location: ' . route_url('device-verify') . '?return=' . $return);
        exit;
    }

    // 未登入 → 回登入頁
    if (!current_user_id()) {
        header('Location: ' . route_url('login'));
        exit;
    }

    // ✅ 已登入就順便清掉殘留的 pending（避免被其他舊邏輯誤判）
    if (isset($_SESSION['device_otp_email'])) {
        unset($_SESSION['device_otp_email']);
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
