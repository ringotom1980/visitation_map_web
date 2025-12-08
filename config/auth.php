<?php
// 路徑:config/auth.php
// TODO: Session start + login check utilities

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function require_login() {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'UNAUTHENTICATED']);
        exit;
    }
}

function require_admin() {
    require_login();
    if ($_SESSION['role'] !== 'ADMIN') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'FORBIDDEN']);
        exit;
    }
}

function current_user_id() {
    return $_SESSION['user_id'] ?? null;
}
