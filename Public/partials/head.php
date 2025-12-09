<?php
/**
 * Path: Public/partials/head.php
 * 說明: 共用 <head> 區塊（base.css + 頁面額外 CSS + favicon）
 *
 * 使用方式：
 *   $pageTitle = 'xxx';
 *   $pageCss   = ['assets/css/login.css']; // 相對於 Public/
 *   require __DIR__ . '/partials/head.php';
 */

if (!isset($pageTitle)) {
    $pageTitle = APP_NAME;
}
if (!isset($pageCss) || !is_array($pageCss)) {
    $pageCss = [];
}
?>
<head>
  <meta charset="UTF-8">
  <title><?= htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8') ?></title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- 頁籤 LOGO（favicon），檔案路徑可依你實際調整 -->
  <link rel="icon" type="image/png" href="<?= asset_url('assets/img/logo.png') ?>">

  <!-- 共用樣式 -->
  <link rel="stylesheet" href="<?= asset_url('assets/css/base.css') ?>">

  <?php foreach ($pageCss as $cssPath): ?>
    <link rel="stylesheet" href="<?= asset_url($cssPath) ?>">
  <?php endforeach; ?>

  <!-- 供前端 JS 讀取 API base（預設 /api） -->
  <meta name="api-base" content="/api">
</head>
