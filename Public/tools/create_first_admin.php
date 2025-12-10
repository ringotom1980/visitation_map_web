<?php
/**
 * Path: Public/tools/create_first_admin.php
 * 說明: 一次性建立第一個 ADMIN 帳號，執行成功後請刪除本檔案
 */

declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../config/app.php';

// 簡單保護：避免上線後被亂按（你可以改這個 token）
$token = $_GET['token'] ?? '';
if ($token !== 'init123') {
    http_response_code(403);
    echo 'Forbidden';
    exit;
}

$pdo = db();

// ★ 在這裡填入你要的初始管理者資料
$name        = '系統管理員';
$phone       = '0985-715776';
$email       = 'ringo_tom2007@yahoo.com.tw';
$orgId       = 6;                  // 例如：苗栗縣後備指揮部的 id = 6
$title       = '系統管理員';
$plainPass   = '1qaz@WSX3edc';     // 初始密碼（自己記好）

try {
    // 檢查是否已經有任何 ADMIN 帳號
    $stmt = $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'");
    $adminCount = (int)$stmt->fetchColumn();
    if ($adminCount > 0) {
        echo '已經存在 ADMIN 帳號，請勿重複建立。';
        exit;
    }

    // 檢查 email 是否已存在
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = :email');
    $stmt->execute([':email' => $email]);
    if ((int)$stmt->fetchColumn() > 0) {
        echo '此 Email 已存在於 users 表中，請改用其他 Email。';
        exit;
    }

    // 檢查 organization 是否存在且啟用
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM organizations WHERE id = :id AND is_active = 1"
    );
    $stmt->execute([':id' => $orgId]);
    if ((int)$stmt->fetchColumn() === 0) {
        echo '指定的 organization_id 不存在或未啟用。';
        exit;
    }

    // 產生密碼雜湊
    $hash = password_hash($plainPass, PASSWORD_DEFAULT);

    // 寫入 users
    $sql = "INSERT INTO users
            (name, phone, email, organization_id, title, role, status, password_hash, created_at)
            VALUES
            (:name, :phone, :email, :org_id, :title, 'ADMIN', 'ACTIVE', :password_hash, NOW())";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':name'          => $name,
        ':phone'         => $phone,
        ':email'         => $email,
        ':org_id'        => $orgId,
        ':title'         => $title,
        ':password_hash' => $hash,
    ]);

    $newId = (int)$pdo->lastInsertId();

    echo '已建立第一個 ADMIN 帳號。<br>';
    echo 'ID: ' . $newId . '<br>';
    echo '登入 Email: ' . htmlspecialchars($email, ENT_QUOTES, 'UTF-8') . '<br>';
    echo '初始密碼: ' . htmlspecialchars($plainPass, ENT_QUOTES, 'UTF-8') . '<br>';
    echo '<br>請立刻登入系統測試，並在確認後刪除此檔案。';

} catch (Throwable $e) {
    if (APP_ENV === 'local') {
        echo '建立失敗: ' . $e->getMessage();
    } else {
        echo '建立失敗，請稍後再試。';
        error_log('create_first_admin error: ' . $e->getMessage());
    }
}
