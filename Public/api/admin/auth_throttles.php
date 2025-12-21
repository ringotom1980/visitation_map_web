<?php
/**
 * Path: Public/api/admin/auth_throttles.php
 * 說明: 管理者查詢節流/封鎖狀態（auth_throttles）
 * Method: GET
 * 權限: ADMIN
 *
 * Query:
 *  - q: 模糊查 action/ip/email
 *  - only_blocked: 1 只看目前仍在封鎖者
 *  - limit: 預設 200（最大 500）
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed', 405);
}

$user = current_user();
if (!$user || (string)($user['role'] ?? '') !== 'ADMIN') {
    json_error('Forbidden', 403);
}

$q = trim((string)($_GET['q'] ?? ''));
$onlyBlocked = (int)($_GET['only_blocked'] ?? 0) === 1;
$limit = (int)($_GET['limit'] ?? 200);
if ($limit <= 0) $limit = 200;
if ($limit > 500) $limit = 500;

$pdo = db();

$where = [];
$params = [];

if ($onlyBlocked) {
    $where[] = "blocked_until IS NOT NULL AND blocked_until > NOW()";
}

if ($q !== '') {
    // action / ip / email 任一命中
    $where[] = "(action LIKE :q OR ip LIKE :q OR email LIKE :q)";
    $params[':q'] = '%' . $q . '%';
}

$sql = "
    SELECT
        id, scope, action, ip, email,
        window_start, window_sec, count, blocked_until, updated_at
    FROM auth_throttles
" . (count($where) ? " WHERE " . implode(" AND ", $where) : "") . "
    ORDER BY
        (CASE WHEN blocked_until IS NOT NULL AND blocked_until > NOW() THEN 1 ELSE 0 END) DESC,
        updated_at DESC
    LIMIT {$limit}
";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);

$rows = $stmt->fetchAll();

json_success([
    'now' => (new DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
    'limit' => $limit,
    'only_blocked' => $onlyBlocked,
    'q' => $q,
    'items' => array_map(function ($r) {
        return [
            'id' => (int)$r['id'],
            'scope' => (string)$r['scope'],
            'action' => (string)$r['action'],
            'ip' => $r['ip'] !== null ? (string)$r['ip'] : null,
            'email' => $r['email'] !== null ? (string)$r['email'] : null,
            'window_start' => (string)$r['window_start'],
            'window_sec' => (int)$r['window_sec'],
            'count' => (int)$r['count'],
            'blocked_until' => $r['blocked_until'] !== null ? (string)$r['blocked_until'] : null,
            'updated_at' => (string)$r['updated_at'],
            'is_blocked' => ($r['blocked_until'] !== null) && ((string)$r['blocked_until'] > (new DateTimeImmutable('now'))->format('Y-m-d H:i:s')),
        ];
    }, $rows),
]);
