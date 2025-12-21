<?php
/**
 * Path: Public/api/auth/login.php
 * 說明: 使用者登入 API（POST /api/auth/login）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

// 支援 JSON 或 form-data
$input = $_POST;
if (empty($input)) {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $json = json_decode($raw, true);
        if (is_array($json)) {
            $input = $json;
        }
    }
}

$email    = trim((string)($input['email'] ?? ''));
$password = (string)($input['password'] ?? '');

if ($email === '' || $password === '') {
    auth_event('LOGIN_FAIL', null, $email ?: null, 'missing credentials');
    json_error('請輸入帳號與密碼');
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    auth_event('LOGIN_FAIL', null, $email, 'invalid email format');
    json_error('Email 格式不正確');
}
// ✅ 只檢查封鎖（不累計）：避免已封鎖者繼續打 API
throttle_assert_not_blocked('LOGIN_FAIL', 'IP_EMAIL', $email);

$pdo = db();

$sql = 'SELECT id, name, email, phone, organization_id, role, status, password_hash
        FROM users
        WHERE email = :email
        LIMIT 1';

$stmt = $pdo->prepare($sql);
$stmt->execute([':email' => $email]);
$user = $stmt->fetch();

if (!$user) {
    // ✅ 只在失敗時累計（15 分鐘內最多 10 次，超過封 15 分鐘）
    throttle_hit('LOGIN_FAIL', 'IP_EMAIL', $email, 900, 10, 15);

    // 不暴露帳號是否存在
    auth_event('LOGIN_FAIL', null, $email, 'bad credentials');
    json_error('帳號或密碼錯誤');
}

if (($user['status'] ?? '') !== 'ACTIVE') {
    auth_event('LOGIN_FAIL', (int)$user['id'], $email, 'inactive or suspended');
    json_error('帳號尚未啟用或已停權');
}

if (!password_verify($password, (string)$user['password_hash'])) {
    // ✅ 只在失敗時累計（15 分鐘內最多 10 次，超過封 15 分鐘）
    throttle_hit('LOGIN_FAIL', 'IP_EMAIL', $email, 900, 10, 15);

    auth_event('LOGIN_FAIL', (int)$user['id'], $email, 'bad credentials');
    json_error('帳號或密碼錯誤');
}

// ✅ 更新最後登入時間（稽核必要）
try {
    $stmt = $pdo->prepare("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = :id");
    $stmt->execute([':id' => (int)$user['id']]);
} catch (Throwable $e) {
    // 不阻斷登入
}

// 設定 Session
session_regenerate_id(true);
$_SESSION['user_id'] = (int)$user['id'];
$_SESSION['role']    = (string)$user['role'];
$_SESSION['org_id']  = (int)$user['organization_id'];

// ✅ 稽核事件
auth_event('LOGIN_OK', (int)$user['id'], (string)$user['email'], 'ok');

// 依角色決定導向頁面：ADMIN → /admin，其他 → /app
$redirect = ((string)$user['role'] === 'ADMIN')
    ? route_url('admin')
    : route_url('app');

json_success([
    'id'              => (int)$user['id'],
    'name'            => (string)$user['name'],
    'email'           => (string)$user['email'],
    'role'            => (string)$user['role'],
    'organization_id' => (int)$user['organization_id'],
    'redirect'        => $redirect,
]);
