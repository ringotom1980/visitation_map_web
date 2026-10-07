<?php
declare(strict_types=1);
require_once __DIR__.'/../../config/auth.php';
require_admin_page();
header('Cache-Control: no-store');
$pageTitle=APP_NAME.' - 單位異動管理';
$pageCss=['assets/css/admin.css','assets/css/transfers.css'];
$transferAdmin=true;
require __DIR__.'/../partials/transfers_page.php';
