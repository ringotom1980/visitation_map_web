<?php
/**
 * Path: Public/api/places/delete.php
 * 說明: 刪除標記（新版 places schema：硬刪除）
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
        if (is_array($json)) $input = $json;
    }
}

$id = isset($input['id']) ? (int)$input['id'] : 0;
if ($id <= 0) {
    json_error('參數錯誤：缺少 id', 400);
}

$pdo = db();

try {
    $sqlOrig = 'SELECT id, organization_id FROM places WHERE id = :id';
    $stmtOrig = $pdo->prepare($sqlOrig);
    $stmtOrig->execute([':id' => $id]);
    $orig = $stmtOrig->fetch();

    if (!$orig) {
        json_error('標記不存在', 404);
    }

    if (($user['role'] ?? '') !== 'ADMIN'
        && (int)$orig['organization_id'] !== (int)$user['organization_id']
    ) {
        json_error('無權限刪除此標記', 403);
    }

    $stmtDel = $pdo->prepare('DELETE FROM places WHERE id = :id');
    $stmtDel->execute([':id' => $id]);

    json_success(['id' => $id, 'deleted' => true]);

} catch (Throwable $e) {
    json_error('刪除標記時發生錯誤：' . $e->getMessage(), 500);
}
