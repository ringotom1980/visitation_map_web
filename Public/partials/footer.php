<?php
/**
 * Path: Public/partials/footer.php
 * 說明: 共用頁尾腳本載入區塊（共用 JS + 頁面額外 JS）
 *
 * 使用方式：
 *   $pageJs = ['assets/js/login.js']; // 相對於 Public/
 *   require __DIR__ . '/partials/footer.php';
 */

if (!isset($pageJs) || !is_array($pageJs)) {
    $pageJs = [];
}
?>
  <!-- 共用 JS（例如 api.js, session.js） -->
  <script src="<?= asset_url('assets/js/api.js') ?>"></script>

  <?php foreach ($pageJs as $jsPath): ?>
    <script src="<?= asset_url($jsPath) ?>"></script>
  <?php endforeach; ?>
