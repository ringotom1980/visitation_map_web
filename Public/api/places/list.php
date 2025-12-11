<?php
// DEBUG 版：先確認這支檔案有沒有被真正執行
declare(strict_types=1);

echo "DEBUG: places/list.php reached\n";
echo "SERVER_NAME = " . ($_SERVER['SERVER_NAME'] ?? '') . "\n";
echo "REQUEST_URI = " . ($_SERVER['REQUEST_URI'] ?? '') . "\n";
exit;
