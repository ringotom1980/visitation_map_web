<?php
/**
 * Path: Public/api/admin/stats.php
 * 說明: 管理後台統計與路線額度用量
 */

declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed', 405);
}

if (!current_user_id() || !is_admin()) {
    json_error('沒有權限', 403);
}

$pdo = db();

try {
    ensure_places_soft_delete_columns($pdo);

    $users = $pdo->query("
        SELECT
          COUNT(*) AS total,
          SUM(status = 'ACTIVE') AS active,
          SUM(status = 'SUSPENDED') AS suspended,
          SUM(role = 'ADMIN') AS admins
        FROM users
    ")->fetch(PDO::FETCH_ASSOC) ?: [];

    $places = $pdo->query("
        SELECT
          COUNT(*) AS total,
          SUM(deleted_at IS NULL) AS active,
          SUM(deleted_at IS NOT NULL) AS deleted
        FROM places
    ")->fetch(PDO::FETCH_ASSOC) ?: [];

    $routing = [
        'provider' => routing_provider(),
        'daily_limit' => routing_daily_limit(),
        'today_used' => 0,
        'today_remaining' => routing_daily_limit(),
    ];

    $tableExistsStmt = $pdo->query("SHOW TABLES LIKE 'routing_usage_daily'");
    if ($tableExistsStmt && $tableExistsStmt->fetchColumn()) {
        $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Taipei')))->format('Y-m-d');
        $stmt = $pdo->prepare("
            SELECT request_count
            FROM routing_usage_daily
            WHERE usage_date = :d AND provider = :p
            LIMIT 1
        ");
        $stmt->execute([':d' => $today, ':p' => routing_provider()]);
        $used = (int)($stmt->fetchColumn() ?: 0);
        $routing['today_used'] = $used;
        $routing['today_remaining'] = max(0, routing_daily_limit() - $used);
    }

    json_success([
        'users' => [
            'total' => (int)($users['total'] ?? 0),
            'active' => (int)($users['active'] ?? 0),
            'suspended' => (int)($users['suspended'] ?? 0),
            'admins' => (int)($users['admins'] ?? 0),
        ],
        'places' => [
            'total' => (int)($places['total'] ?? 0),
            'active' => (int)($places['active'] ?? 0),
            'deleted' => (int)($places['deleted'] ?? 0),
        ],
        'routing' => $routing,
    ]);
} catch (Throwable $e) {
    server_error($e, '統計資料載入失敗，請稍後再試。');
}
