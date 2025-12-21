<?php
/**
 * Path: Public/api/admin/auth_events.php
 * 說明: 管理者查詢稽核事件（auth_events）
 * Method: GET
 * 權限: ADMIN
 *
 * Query:
 *  - type: 指定 event_type（可空）
 *  - q: 模糊查 email/ip/detail
 *  - limit: 預設 200（最大 500）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed', 405);
}

$user = require_api_user();
if ((string)($user['role'] ?? '') !== 'ADMIN') {
    json_error('Forbidden', 403);
}

$type = trim((string)($_GET['type'] ?? ''));
$q = trim((string)($_GET['q'] ?? ''));
$limit = (int)($_GET['limit'] ?? 200);
if ($limit <= 0) $limit = 200;
if ($limit > 500) $limit = 500;

$pdo = db();

$where = [];
$params = [];

if ($type !== '') {
    $where[] = "event_type = :type";
    $params[':type'] = $type;
}

if ($q !== '') {
    $where[] = "(email LIKE :q OR ip LIKE :q OR detail LIKE :q)";
    $params[':q'] = '%' . $q . '%';
}

$sql = "
    SELECT
        id, ts, event_type, user_id, email, ip, ua, detail
    FROM auth_events
" . (count($where) ? " WHERE " . implode(" AND ", $where) : "") . "
    ORDER BY id DESC
    LIMIT {$limit}
";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

json_success([
    'now' => (new DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
    'limit' => $limit,
    'type' => $type,
    'q' => $q,
    'items' => array_map(function ($r) {
        return [
            'id' => (int)$r['id'],
            'ts' => (string)$r['ts'],
            'event_type' => (string)$r['event_type'],
            'user_id' => $r['user_id'] !== null ? (int)$r['user_id'] : null,
            'email' => $r['email'] !== null ? (string)$r['email'] : null,
            'ip' => $r['ip'] !== null ? (string)$r['ip'] : null,
            'ua' => $r['ua'] !== null ? (string)$r['ua'] : null,
            'detail' => $r['detail'] !== null ? (string)$r['detail'] : null,
        ];
    }, $rows),
]);
