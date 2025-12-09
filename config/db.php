<?php
/**
 * Path: config/db.php
 * 說明: 建立 PDO 連線（提供 db() 函式）
 */

declare(strict_types=1);

require_once __DIR__ . '/app.php';

/**
 * 取得共用 PDO 連線
 */
function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        DB_HOST,
        DB_NAME,
        DB_CHARSET
    );

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        if (APP_ENV === 'local') {
            die('DB 連線失敗: ' . $e->getMessage());
        }
        error_log('DB connect error: ' . $e->getMessage());
        die('系統忙碌中，請稍後再試。');
    }

    return $pdo;
}
