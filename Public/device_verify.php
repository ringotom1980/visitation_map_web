<?php

/**
 * Path: Public/device_verify.php
 * 說明: 裝置驗證頁（E2 DEVICE OTP）
 */

declare(strict_types=1);

require_once __DIR__ . '/api/common/bootstrap.php';
require_login();

$pageTitle = '裝置驗證｜' . APP_NAME;
$pageCss = [
    'assets/css/layout.css',        // 若裝置驗證也吃主版面
    'assets/css/device_verify.css', // 裝置驗證專用
];

?>
<!doctype html>
<html lang="zh-Hant">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>裝置驗證</title>

    <link rel="stylesheet" href="<?= htmlspecialchars(asset_url('assets/css/device_verify.css')) ?>">
</head>

<body class="dv-page">
    <main class="dv-card">
        <h1 class="dv-title">裝置驗證</h1>
        <p class="dv-desc">我們已寄出 6 位數驗證碼到您的信箱，請於 10 分鐘內輸入。</p>

        <div class="dv-row">
            <input id="dv-code" class="dv-input" inputmode="numeric" maxlength="6" placeholder="輸入 6 位數驗證碼">
            <button id="dv-verify" class="dv-btn">驗證</button>
        </div>

        <div class="dv-row dv-row--muted">
            <button id="dv-resend" class="dv-link" type="button">重新寄送驗證碼</button>
            <span id="dv-msg" class="dv-msg"></span>
        </div>
    </main>
    <script src="<?= asset_url('assets/js/api.js') ?>"></script>
    <script src="<?= asset_url('assets/js/device_verify.js') ?>"></script>
</body>

</html>