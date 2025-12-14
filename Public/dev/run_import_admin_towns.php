<?php
/**
 * Path: Public/dev/run_import_admin_towns.php
 * 說明: 測試用 - 透過網址觸發 scripts/import_admin_towns.php
 * 注意：測完請刪除本檔案
 */

declare(strict_types=1);

header('Content-Type: text/plain; charset=utf-8');

$script = realpath(__DIR__ . '/../../scripts/import_admin_towns.php');
if (!$script) {
  http_response_code(500);
  echo "FAIL: cannot find scripts/import_admin_towns.php\n";
  exit;
}

$cmd = 'php ' . escapeshellarg($script) . ' 2>&1';

$output = [];
$code = 0;
exec($cmd, $output, $code);

echo "ReturnCode: {$code}\n";
echo "--------------------------\n";
echo implode("\n", $output) . "\n";
