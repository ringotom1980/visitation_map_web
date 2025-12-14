<?php
/**
 * Path: scripts/import_admin_towns.php
 * 說明: 下載 MOI Open Data（COM_004 鄉鎮市區清單）CSV → 匯入 admin_towns_staging → 原子覆蓋 admin_towns → 寫入 admin_towns_import_log
 *
 * 執行：
 *   php scripts/import_admin_towns.php
 */

declare(strict_types=1);

$SOURCE_URL = 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/5619CB99-7D1C-4A80-8C34-47DC15C56FF8/resource/502E607F-0E28-4572-A6C6-0D7F03367257/download';

require_once __DIR__ . '/../config/bootstrap.php';
require_once __DIR__ . '/../config/db.php';

$pdo = db();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$month = date('Y-m'); // 以執行當下月份記錄 source_month

$storageDir = __DIR__ . '/../storage/opendata';
if (!is_dir($storageDir)) {
  mkdir($storageDir, 0775, true);
}

$filePath = $storageDir . '/admin_towns_' . date('Ymd_His') . '.csv';

$httpCode = null;
$sha256 = null;
$rowsLoaded = 0;
$rowsActive = 0;

function log_import(PDO $pdo, array $data): void {
  $sql = "INSERT INTO admin_towns_import_log
          (source_url, http_code, file_path, file_sha256, rows_loaded, rows_active, status, message)
          VALUES (:source_url, :http_code, :file_path, :file_sha256, :rows_loaded, :rows_active, :status, :message)";
  $pdo->prepare($sql)->execute($data);
}

function download_csv(string $url, string $dest, ?int &$httpCode): void {
  $fp = fopen($dest, 'wb');
  if (!$fp) throw new RuntimeException("Cannot open file for write: {$dest}");

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_FILE => $fp,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 20,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_FAILONERROR => false,
    CURLOPT_USERAGENT => 'visitation_map_web-admin_towns-importer/1.0',
  ]);

  $ok = curl_exec($ch);
  $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  fclose($fp);

  if ($ok === false || $httpCode < 200 || $httpCode >= 300) {
    @unlink($dest);
    throw new RuntimeException("Download failed (HTTP {$httpCode}): {$err}");
  }
}

function normalize_header(string $s): string {
  $s = trim($s);
  $s = preg_replace('/\s+/u', '', $s);
  return mb_strtolower($s, 'UTF-8');
}

function detect_columns(array $header): array {
  $h = array_map('normalize_header', $header);

  $pick = function(array $candidates) use ($h): ?int {
    foreach ($candidates as $cand) {
      $cand = normalize_header($cand);
      foreach ($h as $i => $name) {
        if ($name === $cand) return $i;
      }
    }
    return null;
  };

  // 容錯：不同版本欄名可能略不同；第一次若對不到會把 header 印出來
  $iCountyCode = $pick(['縣市代碼','縣市代碼(5碼)','縣市代碼5碼','countycode','citycode']);
  $iCountyName = $pick(['縣市名稱','縣市名','縣市','countyname','cityname']);
  $iTownCode   = $pick(['鄉鎮市區代碼','鄉鎮市區代碼(7碼)','鄉鎮市區代碼7碼','towncode','districtcode']);
  $iTownName   = $pick(['鄉鎮市區名稱','鄉鎮市區名','鄉鎮市區','townname','districtname']);
  $iStatus     = $pick(['狀態','是否有效','有效','is_active','active','enable']);

  if ($iCountyCode===null || $iCountyName===null || $iTownCode===null || $iTownName===null) {
    throw new RuntimeException("CSV header columns not recognized. Header=" . json_encode($header, JSON_UNESCAPED_UNICODE));
  }

  return [$iCountyCode, $iCountyName, $iTownCode, $iTownName, $iStatus];
}

try {
  // 1) 下載 CSV
  download_csv($SOURCE_URL, $filePath, $httpCode);
  $sha256 = hash_file('sha256', $filePath);

  // 2) 清 staging
  $pdo->exec("TRUNCATE TABLE admin_towns_staging");

  // 3) 讀 CSV
  $fh = fopen($filePath, 'rb');
  if (!$fh) throw new RuntimeException("Cannot open downloaded CSV: {$filePath}");

  // 處理 UTF-8 BOM
  $first = fread($fh, 3);
  if ($first !== "\xEF\xBB\xBF") rewind($fh);

  $header = fgetcsv($fh);
  if (!$header || count($header) < 4) {
    throw new RuntimeException("Invalid CSV header. Header=" . json_encode($header, JSON_UNESCAPED_UNICODE));
  }

  [$iCountyCode, $iCountyName, $iTownCode, $iTownName, $iStatus] = detect_columns($header);

  $ins = $pdo->prepare("
    INSERT INTO admin_towns_staging
      (town_code, town_name, county_code, county_name, is_active, source_month)
    VALUES
      (:town_code, :town_name, :county_code, :county_name, :is_active, :source_month)
  ");

  while (($row = fgetcsv($fh)) !== false) {
    if (!is_array($row) || count($row) < 4) continue;

    $countyCode = trim((string)($row[$iCountyCode] ?? ''));
    $countyName = trim((string)($row[$iCountyName] ?? ''));
    $townCode   = trim((string)($row[$iTownCode] ?? ''));
    $townName   = trim((string)($row[$iTownName] ?? ''));

    if ($townCode === '' || $townName === '' || $countyCode === '' || $countyName === '') {
      continue;
    }

    $isActive = 1;
    if ($iStatus !== null) {
      $raw = trim((string)($row[$iStatus] ?? ''));
      if ($raw !== '') {
        $rawN = mb_strtolower($raw, 'UTF-8');
        $isActive = in_array($rawN, ['1','y','yes','是','有效','true'], true) ? 1 : 0;
      }
    }

    $ins->execute([
      ':town_code' => $townCode,
      ':town_name' => $townName,
      ':county_code' => $countyCode,
      ':county_name' => $countyName,
      ':is_active' => $isActive,
      ':source_month' => $month,
    ]);

    $rowsLoaded++;
  }
  fclose($fh);

  if ($rowsLoaded <= 0) {
    throw new RuntimeException("No rows loaded. Please check CSV content/encoding.");
  }

  $rowsActive = (int)$pdo->query("SELECT COUNT(*) FROM admin_towns_staging WHERE is_active=1")->fetchColumn();

  // 4) 原子覆蓋：staging → 正式表
  $pdo->beginTransaction();
  $pdo->exec("TRUNCATE TABLE admin_towns");
  $pdo->exec("INSERT INTO admin_towns (town_code, town_name, county_code, county_name, is_active, source_month)
              SELECT town_code, town_name, county_code, county_name, is_active, source_month
              FROM admin_towns_staging");
  $pdo->commit();

  // 5) 記錄 log
  log_import($pdo, [
    'source_url' => $SOURCE_URL,
    'http_code' => $httpCode,
    'file_path' => $filePath,
    'file_sha256' => $sha256,
    'rows_loaded' => $rowsLoaded,
    'rows_active' => $rowsActive,
    'status' => 'OK',
    'message' => 'Imported successfully',
  ]);

  echo "OK: loaded={$rowsLoaded}, active={$rowsActive}\n";
  exit(0);

} catch (Throwable $e) {
  if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();

  // 失敗也要寫 log（如果寫 log 本身又失敗，就至少把錯印出）
  try {
    log_import($pdo, [
      'source_url' => $SOURCE_URL,
      'http_code' => $httpCode,
      'file_path' => $filePath,
      'file_sha256' => $sha256,
      'rows_loaded' => $rowsLoaded,
      'rows_active' => $rowsActive,
      'status' => 'FAIL',
      'message' => mb_substr($e->getMessage(), 0, 500, 'UTF-8'),
    ]);
  } catch (Throwable $ignored) {}

  fwrite(STDERR, "FAIL: " . $e->getMessage() . "\n");
  exit(1);
}
