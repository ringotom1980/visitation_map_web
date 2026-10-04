<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/auth.php';

require_login_page();

header('Cache-Control: no-store');
$pageTitle=APP_NAME.' - 我的單位';
$pageCss=['assets/css/admin.css','assets/css/transfers.css'];
$transferAdmin=false;
require __DIR__.'/partials/transfers_page.php';
