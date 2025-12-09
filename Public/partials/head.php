<?php
// Public/partials/head.php
require_once __DIR__ . '/../../config/app.php';
?>
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <title><?= htmlspecialchars(APP_NAME, ENT_QUOTES, 'UTF-8') ?></title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- 共用樣式 -->
  <link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/base.css">
