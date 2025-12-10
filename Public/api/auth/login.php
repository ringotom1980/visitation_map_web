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

$email    = trim($input['email'] ?? '');
$password = $input['password'] ?? '';

if ($email === '' || $password === '') {
    json_error('請輸入帳號與密碼');
}

$pdo = db();

$sql = 'SELECT id, name, email, phone, organization_id, role, status, password_hash
        FROM users
        WHERE email = :email
        LIMIT 1';

$stmt = $pdo->prepare($sql);
$stmt->execute([':email' => $email]);
$user = $stmt->fetch();

if (!$user) {
    json_error('帳號或密碼錯誤');
}

if (($user['status'] ?? '') !== 'ACTIVE') {
    json_error('帳號尚未啟用或已停權');
}

if (!password_verify($password, $user['password_hash'])) {
    json_error('帳號或密碼錯誤');
}

// 設定 Session
session_regenerate_id(true);
$_SESSION['user_id'] = (int)$user['id'];
$_SESSION['role']    = $user['role'];
$_SESSION['org_id']  = (int)$user['organization_id'];

// 依角色決定導向頁面：ADMIN → /admin，其他 → /app
$redirect = ($user['role'] === 'ADMIN')
    ? route_url('admin')
    : route_url('app');

json_success([
    'id'              => (int)$user['id'],
    'name'            => $user['name'],
    'email'           => $user['email'],
    'role'            => $user['role'],
    'organization_id' => (int)$user['organization_id'],
    'redirect'        => $redirect,
]);
