<?php
// 路徑:Public/api/common/bootstrap.php
// MUST include in all API entry files

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/auth.php';
$pdo = require __DIR__ . '/../../../config/db.php';

function json_success($message = 'OK', $data = null) {
    echo json_encode([
        'success' => true,
        'message' => $message,
        'data' => $data,
    ]);
    exit;
}

function json_error($code, $message, $http = 400) {
    http_response_code($http);
    echo json_encode([
        'success' => false,
        'error_code' => $code,
        'message' => $message,
        'data' => null,
    ]);
    exit;
}
