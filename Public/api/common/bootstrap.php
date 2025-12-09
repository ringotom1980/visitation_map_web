<?php
/**
 * Path: Public/api/common/bootstrap.php
 * 說明: 所有 API 共用啟動（header、DB、auth、JSON 輸出）
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../config/app.php';
require_once __DIR__ . '/../../../config/db.php';
require_once __DIR__ . '/../../../config/auth.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function json_success($data = null): void
{
    echo json_encode([
        'success' => true,
        'data'    => $data,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $httpStatus = 400, $code = null): void
{
    http_response_code($httpStatus);
    echo json_encode([
        'success' => false,
        'error'   => [
            'message' => $message,
            'code'    => $code,
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
