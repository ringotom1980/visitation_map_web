<?php
// Non-secret topology: <site-container>/runtime and sibling <site-container>/shared.
declare(strict_types=1);
function hostinger_shared_path(string $relative): string
{
    if ($relative === '' || str_starts_with($relative, '/') || str_contains($relative, "\0") || preg_match('~(^|/)\.\.(/|$)~', $relative)) {
        throw new RuntimeException('Invalid shared relative path');
    }
    $root = realpath(dirname(__DIR__) . '/shared');
    if ($root === false || !is_dir($root)) {
        throw new RuntimeException('Shared directory unavailable');
    }
    $path = realpath($root . '/' . $relative);
    if ($path === false || !str_starts_with($path, $root . DIRECTORY_SEPARATOR) || !is_readable($path)) {
        throw new RuntimeException('Shared input unavailable or outside shared directory');
    }
    return $path;
}

// Explicit legacy-env mode: fixed server-local input; no request/path override.
function hostinger_legacy_env_path(): string
{
    $unavailable = 'Legacy environment input unavailable';
    if (basename(__DIR__) !== 'runtime' || basename(dirname(__DIR__)) !== 'visitation-release') {
        throw new RuntimeException($unavailable);
    }
    $site = @realpath(dirname(__DIR__, 2));
    if ($site === false) { throw new RuntimeException($unavailable); }
    $directory = $site . '/visitation_map_web';
    $expected = $directory . '/.env';
    if (@is_link($directory) || @is_link($expected) || !@is_file($expected) || !@is_readable($expected)) {
        throw new RuntimeException($unavailable);
    }
    $actual = @realpath($expected);
    if ($actual === false || $actual !== $expected) { throw new RuntimeException($unavailable); }
    return $actual;
}
