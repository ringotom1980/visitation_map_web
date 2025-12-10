<?php
/**
 * Path: Public/api/applications/create.php
 * 說明: 新使用者帳號申請 API（POST /api/applications/create）
 * 對應資料表：user_applications
 * 輸入欄位: name, phone, email, org_id, title, password, password_confirm
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
    $tmp = json_decode($raw, true);
    if (is_array($tmp)) {
      $input = $tmp;
    }
  }
}

$name     = trim($input['name']  ?? '');
$phone    = trim($input['phone'] ?? '');
$email    = trim($input['email'] ?? '');
$orgId    = isset($input['org_id']) ? (int)$input['org_id'] : 0;
$title    = trim($input['title'] ?? '');
$password = (string)($input['password'] ?? '');
$passwordConfirm = (string)($input['password_confirm'] ?? '');

if ($name === '' || $phone === '' || $email === '' || $orgId <= 0) {
  json_error('請完整填寫必填欄位。');
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
  json_error('Email 格式不正確。');
}

// 密碼檢查
if ($password === '' || $passwordConfirm === '') {
  json_error('請輸入密碼與再次確認密碼。');
}

if (strlen($password) < 8) {
  json_error('密碼長度至少需 8 碼。');
}

if ($password !== $passwordConfirm) {
  json_error('兩次輸入的密碼不一致。');
}

$passwordHash = password_hash($password, PASSWORD_DEFAULT);

$pdo = db();

try {
  // 確認 organization 存在且啟用
  $stmt = $pdo->prepare(
    'SELECT COUNT(*) 
     FROM organizations 
     WHERE id = :id AND is_active = 1'
  );
  $stmt->execute([':id' => $orgId]);
  if ((int)$stmt->fetchColumn() === 0) {
    json_error('所屬單位不存在或已停用，請聯絡管理者。');
  }

  // 檢查 users 表中是否已存在帳號
  $stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = :email');
  $stmt->execute([':email' => $email]);
  if ((int)$stmt->fetchColumn() > 0) {
    json_error('此 Email 已有帳號，請直接登入或聯絡管理者。');
  }

  // 檢查 user_applications 是否有待審核紀錄
  $stmt = $pdo->prepare(
    'SELECT COUNT(*) 
     FROM user_applications 
     WHERE email = :email AND status = "PENDING"'
  );
  $stmt->execute([':email' => $email]);
  if ((int)$stmt->fetchColumn() > 0) {
    json_error('此 Email 已送出申請，請等待管理者審核。');
  }

  // 新增一筆申請到 user_applications
  $sql = "INSERT INTO user_applications
          (name, phone, email, organization_id, title, password_hash, status, created_at)
          VALUES
          (:name, :phone, :email, :organization_id, :title, :password_hash, 'PENDING', NOW())";
  $stmt = $pdo->prepare($sql);
  $stmt->execute([
    ':name'            => $name,
    ':phone'           => $phone,
    ':email'           => $email,
    ':organization_id' => $orgId,
    ':title'           => $title,
    ':password_hash'   => $passwordHash,
  ]);

  json_success(['message' => '申請已送出']);
} catch (Throwable $e) {
  if (APP_ENV === 'local') {
    json_error('申請失敗: ' . $e->getMessage(), 500);
  }
  error_log('user_applications.create error: ' . $e->getMessage());
  json_error('系統忙碌中，請稍後再試。', 500);
}
