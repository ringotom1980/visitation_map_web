<?php
/**
 * Path: Public/api/places/delete.php
 * 說明: 刪除標記（軟刪除，將 is_active 設為 0）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed', 405);
}

$user = current_user();
if (!$user) {
    json_error('尚未登入', 401);
}

// 支援 JSON 與 form-data
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

$id = isset($input['id']) ? (int)$input['id'] : 0;
if ($id <= 0) {
    json_error('參數錯誤：缺少 id', 400);
}

$pdo = db();

try {
    // 先抓原始資料，做權限檢查
    $sqlOrig = 'SELECT id, organization_id, is_active FROM places WHERE id = :id';
    $stmtOrig = $pdo->prepare($sqlOrig);
    $stmtOrig->execute(array(':id' => $id));
    $orig = $stmtOrig->fetch();

    if (!$orig || (int)$orig['is_active'] !== 1) {
        json_error('標記不存在或已刪除', 404);
    }

    if (($user['role'] ?? '') !== 'ADMIN'
        && (int)$orig['organization_id'] !== (int)$user['organization_id']
    ) {
        json_error('無權限刪除此標記', 403);
    }

    // 軟刪除
    $sqlDel = 'UPDATE places
               SET is_active = 0,
                   updated_at = NOW()
               WHERE id = :id';

    $stmtDel = $pdo->prepare($sqlDel);
    $stmtDel->execute(array(':id' => $id));

    json_success(array('id' => $id, 'deleted' => true));

} catch (Throwable $e) {
    json_error('刪除標記時發生錯誤：' . $e->getMessage(), 500);
}
