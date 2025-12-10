<?php
/**
 * Path: Public/api/admin/applications/reject.php
 * 說明: 拒絕申請（POST /api/admin/applications/reject）
 * 輸入: { application_id: int, reason?: string }
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

$appId  = isset($input['application_id']) ? (int)$input['application_id'] : 0;
$reason = trim($input['reason'] ?? '');

if ($appId <= 0) {
    json_error('application_id 不正確');
}

$pdo = db();

// ★ 欄位名稱對齊：reviewer_user_id / review_note / reviewed_at
$sql = "UPDATE user_applications
        SET status = 'REJECTED',
            reviewer_user_id = :admin_id,
            reviewed_at = NOW(),
            review_note = :note
        WHERE id = :id AND status = 'PENDING'";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':admin_id' => current_user_id(),
    ':note'     => $reason !== '' ? $reason : null,
    ':id'       => $appId,
]);

if ($stmt->rowCount() === 0) {
    json_error('申請不存在或已處理');
}

json_success(['message' => '已拒絕申請']);
