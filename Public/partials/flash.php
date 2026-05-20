<?php
declare(strict_types=1);

$flash = $_SESSION['flash'] ?? null;
unset($_SESSION['flash']);

if (!is_array($flash) || empty($flash['message'])) {
    return;
}

$type = preg_replace('/[^a-z0-9_-]/i', '', (string)($flash['type'] ?? 'info'));
$message = (string)$flash['message'];
?>
<div class="flash flash-<?= htmlspecialchars($type, ENT_QUOTES, 'UTF-8') ?>">
  <?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?>
</div>
