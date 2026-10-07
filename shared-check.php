<?php
// Synthetic sibling marker only. No configuration, DB, phpinfo or arbitrary path input.
declare(strict_types=1);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
$marker = dirname(__DIR__) . '/shared-probe.txt';
$value = !is_link($marker) && @is_file($marker) ? @file_get_contents($marker, false, null, 0, 32) : false;
if ($value === "shared-ok" || $value === "shared-ok\n" || $value === "shared-ok\r\n") {
    echo "PASS\n";
} else {
    http_response_code(503);
    echo "FAIL\n";
}
