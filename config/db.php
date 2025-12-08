<?php
// 路徑:config/db.php
// TODO: Database connection (PDO)

$DB_HOST = 'localhost';
$DB_NAME = 'visitation_map';
$DB_USER = 'your_db_user';
$DB_PASS = 'your_db_pass';

try {
    $pdo = new PDO(
        "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'DB connection failed']);
    exit;
}

return $pdo;
