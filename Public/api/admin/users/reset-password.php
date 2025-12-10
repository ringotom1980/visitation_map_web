<?php
/**
 * Path: Public/api/admin/users/reset-password.php
 * 說明: 管理者重設使用者密碼（POST /api/admin/users/reset-password）
 * 輸入: { user_id: int }
 * 輸出: { email, temp_password }
 */

declare(strict_types=1);

require_once __DIR__ . '/../../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

if (!current_user_id() || !is_admin()) {
    json_error('沒有權限', 403);
}

// 讀取 JSON 或 form-data
$input = $_POST;
if (empty($input)) {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $tmp = json_decode($raw, true);
        if (is_array($tmp)) {
            $input = $tmp;
        }
    }
}

$userId = isset($input['user_id']) ? (int)$input['user_id'] : 0;
if ($userId <= 0) {
    json_error('user_id 不正確');
}

$pdo = db();

try {
    // 先找出使用者
    $stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $user = $stmt->fetch();

    if (!$user) {
        json_error('找不到指定使用者');
    }

    // 產生暫時密碼（10 碼）
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    $len   = strlen($chars);
    $tempPassword = '';
    for ($i = 0; $i < 10; $i++) {
        $tempPassword .= $chars[random_int(0, $len - 1)];
    }

    $passwordHash = password_hash($tempPassword, PASSWORD_DEFAULT);

    // 寫回 users
    $stmt = $pdo->prepare(
        'UPDATE users
         SET password_hash = :hash, updated_at = NOW()
         WHERE id = :id'
    );
    $stmt->execute([
        ':hash' => $passwordHash,
        ':id'   => $userId,
    ]);

    json_success([
        'email'         => $user['email'],
        'temp_password' => $tempPassword,
    ]);
} catch (Throwable $e) {
    error_log('admin.users.reset-password error: ' . $e->getMessage());
    if (APP_ENV === 'local') {
        json_error('重設密碼失敗: ' . $e->getMessage(), 500);
    }
    json_error('系統忙碌中，請稍後再試。', 500);
}
