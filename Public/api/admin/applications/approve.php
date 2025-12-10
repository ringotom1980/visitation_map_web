<?php
/**
 * Path: Public/api/admin/applications/approve.php
 * 說明: 核准申請（POST /api/admin/applications/approve）
 * 輸入: { application_id: int }
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

$appId = isset($input['application_id']) ? (int)$input['application_id'] : 0;
if ($appId <= 0) {
    json_error('application_id 不正確');
}

$pdo = db();

try {
    $pdo->beginTransaction();

    // 抓申請資料（鎖定這筆 PENDING 申請）
    $sql = "SELECT *
            FROM user_applications
            WHERE id = :id AND status = 'PENDING'
            FOR UPDATE";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id' => $appId]);
    $app = $stmt->fetch();

    if (!$app) {
        $pdo->rollBack();
        json_error('申請不存在或已處理');
    }

    // 確認 email 尚未建立使用者
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = :email');
    $stmt->execute([':email' => $app['email']]);
    if ((int)$stmt->fetchColumn() > 0) {
        $pdo->rollBack();
        json_error('此 Email 已存在使用者帳號');
    }

    // 確認申請內有密碼雜湊
    $passwordHash = $app['password_hash'] ?? '';
    if ($passwordHash === '' || $passwordHash === null) {
        $pdo->rollBack();
        json_error('此申請缺少密碼資料，請請申請者重新送出申請。');
    }

    // 建立 users 帳號
    $sql = "INSERT INTO users
            (name, phone, email, organization_id, title, role, status, password_hash, created_at)
            VALUES
            (:name, :phone, :email, :organization_id, :title, 'USER', 'ACTIVE', :password_hash, NOW())";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':name'            => $app['name'],
        ':phone'           => $app['phone'],
        ':email'           => $app['email'],
        ':organization_id' => (int)$app['organization_id'],
        ':title'           => $app['title'],
        ':password_hash'   => $passwordHash,
    ]);

    $newUserId = (int)$pdo->lastInsertId();

    // 更新申請狀態
    $sql = "UPDATE user_applications
            SET status = 'APPROVED',
                reviewer_user_id = :admin_id,
                reviewed_at = NOW()
            WHERE id = :id";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':admin_id' => current_user_id(),
        ':id'       => $appId,
    ]);

    $pdo->commit();

    json_success([
        'user_id' => $newUserId,
        'email'   => $app['email'],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('applications.approve error: ' . $e->getMessage());
    if (APP_ENV === 'local') {
        json_error('核准失敗: ' . $e->getMessage(), 500);
    }
    json_error('系統忙碌中，請稍後再試。', 500);
}
