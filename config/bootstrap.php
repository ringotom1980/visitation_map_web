<?php
/**
 * Path: config/bootstrap.php
 * 說明: 載入 .env 並提供 env() 讀取環境變數
 */

declare(strict_types=1);

/**
 * 讀取 .env 並設到 $_ENV / putenv()
 */
function load_env(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }

        [$key, $value] = array_map('trim', explode('=', $line, 2));

        if (strlen($value) >= 2 &&
            (($value[0] === '"' && $value[strlen($value)-1] === '"') ||
             ($value[0] === "'" && $value[strlen($value)-1] === "'"))
        ) {
            $value = substr($value, 1, -1);
        }

        putenv("$key=$value");
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }
}

/**
 * 取得 env 變數
 */
function env(string $key, $default = null)
{
    $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
    if ($value === false || $value === null || $value === '') {
        return $default;
    }
    return $value;
}

$root = dirname(__DIR__);
load_env($root . '/.env');
