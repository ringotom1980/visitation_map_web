<?php
/**
 * Path: Public/dev/run_import_admin_towns.php
 * 說明: 測試用 - 透過網址觸發 scripts/import_admin_towns.php
 * 注意：測完請刪除本檔案（或改回有權限的版本）
 */

declare(strict_types=1);

header('Content-Type: text/plain; charset=utf-8');

// 你專案根目錄到 scripts 的相對路徑（此處以你目前結構計算）
$script = realpath(__DIR__ . '/../../scripts/import_admin_towns.php');
if (!$script) {
  http_response_code(500);
  echo "FAIL: cannot find scripts/import_admin_towns.php\n";
  exit;
}

// 以 php 執行腳本（把 stderr 也抓回來）
$cmd = 'php ' . escapeshellarg($script) . ' 2>&1';

$output = [];
$code = 0;
exec($cmd, $output, $code);

echo "ReturnCode: {$code}\n";
echo "--------------------------\n";
echo implode("\n", $output) . "\n";
