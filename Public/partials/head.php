<?php
/**
 * Path: Public/partials/head.php
 * 說明: 共用 <head> 區塊
 *       - 固定載入 base.css（全站共用）
 *       - 依 $pageCss 載入各頁外掛 CSS
 *       - 提供 favicon 與 API base meta（給 api.js 使用）
 */

declare(strict_types=1);

if (!isset($pageTitle)) {
    $pageTitle = APP_NAME;
}
if (!isset($pageCss) || !is_array($pageCss)) {
    $pageCss = [];
}
?>
<head>
  <meta charset="UTF-8">
  <title><?= htmlspecialchars((string)$pageTitle, ENT_QUOTES, 'UTF-8') ?></title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <link rel="icon" type="image/png" href="<?= asset_url('assets/img/logo.png') ?>">

  <!-- 共用樣式（固定載入；各頁請勿重複塞進 $pageCss） -->
  <link rel="stylesheet" href="<?= asset_url('assets/css/base.css') ?>">

  <!-- 各頁外掛 CSS -->
  <?php foreach ($pageCss as $cssPath): ?>
    <link rel="stylesheet" href="<?= asset_url($cssPath) ?>">
  <?php endforeach; ?>

  <!-- 前端 api.js 會讀取此值作為 API_BASE -->
  <meta name="api-base" content="/api">
</head>
