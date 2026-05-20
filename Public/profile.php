<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/auth.php';

require_login_page();

header('Location: ' . route_url('app'));
exit;
