<?php
/**
 * Path: scripts/import_admin_towns.php
 * 說明:
 *   以 NLSC 代碼服務 API 取得「縣市 / 鄉鎮市區」資料（XML）
 *   → 匯入 admin_towns_staging
 *   → 原子更新 admin_towns（先全設 inactive，再以 staging 覆蓋/新增 active）
 *   → 寫入 admin_towns_import_log
 *
 *  已在伺服器端設定定時任務，每月1號自動更新
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/bootstrap.php';
require_once __DIR__ . '/../config/db.php';

$pdo = db();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// 來源：NLSC 代碼服務（縣市 / 鄉鎮市區）
// - 縣市清單: https://api.nlsc.gov.tw/other/ListCounty
// - 鄉鎮市區: https://api.nlsc.gov.tw/other/ListTown/{countyCode}
$URL_COUNTY = 'https://api.nlsc.gov.tw/other/ListCounty';
$URL_TOWN_BASE = 'https://api.nlsc.gov.tw/other/ListTown/';

$sourceMonth = date('Y-m');

$httpCode = null;
$filePath = null;   // 本版本不下載檔案，留 NULL
$fileSha  = null;   // 本版本不下載檔案，留 NULL
$rowsLoaded = 0;
$rowsActive = 0;

function log_import(PDO $pdo, array $data): void {
  $sql = "INSERT INTO admin_towns_import_log
          (source_url, http_code, file_path, file_sha256, rows_loaded, rows_active, status, message)
          VALUES (:source_url, :http_code, :file_path, :file_sha256, :rows_loaded, :rows_active, :status, :message)";
  $pdo->prepare($sql)->execute($data);
}

function curl_get(string $url, int $connectTimeout = 30, int $timeout = 120): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => $connectTimeout,
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_FAILONERROR    => false,
    CURLOPT_USERAGENT      => 'visitation_map_web-admin_towns-importer/1.0',
    CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4, // 避免某些主機 IPv6 連線不通
  ]);

  $body = curl_exec($ch);
  $err  = curl_error($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  return [$code, $body === false ? '' : (string)$body, $err ?: ''];
}

function xml_load(string $xml): \SimpleXMLElement {
  libxml_use_internal_errors(true);
  $sx = simplexml_load_string($xml);
  if (!$sx) {
    $errs = array_map(fn($e) => trim($e->message), libxml_get_errors());
    libxml_clear_errors();
    throw new RuntimeException('XML parse failed: ' . implode(' | ', $errs));
  }
  return $sx;
}

function xpath_first_text(\SimpleXMLElement $node, string $xpath): string {
  $arr = $node->xpath($xpath);
  if (!$arr || !isset($arr[0])) return '';
  return trim((string)$arr[0]);
}

/**
 * 解析縣市清單
 * 目標抽出：county_code, county_name
 */
function parse_counties(string $xml): array {
  $doc = xml_load($xml);

  // 優先使用 townitem/countyitem 結構（以 local-name() 避免 namespace 影響）
  $items = $doc->xpath('//*[local-name()="countyitem"]');
  $out = [];

  if ($items) {
    foreach ($items as $it) {
      $cc = xpath_first_text($it, './*[local-name()="countycode"]');
      $cn = xpath_first_text($it, './*[local-name()="countyname"]');
      if ($cc !== '' && $cn !== '') $out[] = [$cc, $cn];
    }
  }

  // Fallback：若 API 直接是平鋪節點，嘗試以兩個陣列配對
  if (!$out) {
    $codes = $doc->xpath('//*[local-name()="countycode"]') ?: [];
    $names = $doc->xpath('//*[local-name()="countyname"]') ?: [];
    $n = min(count($codes), count($names));
    for ($i=0; $i<$n; $i++) {
      $cc = trim((string)$codes[$i]);
      $cn = trim((string)$names[$i]);
      if ($cc !== '' && $cn !== '') $out[] = [$cc, $cn];
    }
  }

  if (!$out) {
    throw new RuntimeException('No counties parsed from ListCounty XML.');
  }
  return $out;
}

/**
 * 解析鄉鎮市區清單
 * 目標抽出：town_code, town_name
 */
function parse_towns(string $xml): array {
  $doc = xml_load($xml);

  $items = $doc->xpath('//*[local-name()="townitem"]');
  $out = [];

  if ($items) {
    foreach ($items as $it) {
      $tc = xpath_first_text($it, './*[local-name()="towncode"]');
      $tn = xpath_first_text($it, './*[local-name()="townname"]');
      if ($tc !== '' && $tn !== '') $out[] = [$tc, $tn];
    }
  }

  // Fallback：平鋪節點
  if (!$out) {
    $codes = $doc->xpath('//*[local-name()="towncode"]') ?: [];
    $names = $doc->xpath('//*[local-name()="townname"]') ?: [];
    $n = min(count($codes), count($names));
    for ($i=0; $i<$n; $i++) {
      $tc = trim((string)$codes[$i]);
      $tn = trim((string)$names[$i]);
      if ($tc !== '' && $tn !== '') $out[] = [$tc, $tn];
    }
  }

  if (!$out) {
    throw new RuntimeException('No towns parsed from ListTown XML.');
  }
  return $out;
}

try {
  // 0) 確保 PHP 不被 execution time 卡死（CLI/被 web exec 時都保險）
  @set_time_limit(0);

  // 1) 取得縣市清單
  [$c1, $body1, $err1] = curl_get($URL_COUNTY, 30, 120);
  $httpCode = $c1;

  if ($c1 !== 200 || $body1 === '') {
    throw new RuntimeException("ListCounty failed (HTTP {$c1}) {$err1}");
  }
  $counties = parse_counties($body1);

  // 2) 清 staging
  $pdo->exec("TRUNCATE TABLE admin_towns_staging");

  // 3) Insert staging
  $ins = $pdo->prepare("
    INSERT INTO admin_towns_staging
      (town_code, town_name, county_code, county_name, is_active, source_month)
    VALUES
      (:town_code, :town_name, :county_code, :county_name, 1, :source_month)
    ON DUPLICATE KEY UPDATE
      town_name=VALUES(town_name),
      county_code=VALUES(county_code),
      county_name=VALUES(county_name),
      is_active=1,
      source_month=VALUES(source_month)
  ");

  foreach ($counties as [$countyCode, $countyName]) {
    [$c2, $body2, $err2] = curl_get($URL_TOWN_BASE . rawurlencode($countyCode), 30, 120);
    if ($c2 !== 200 || $body2 === '') {
      throw new RuntimeException("ListTown failed county={$countyCode} (HTTP {$c2}) {$err2}");
    }

    $towns = parse_towns($body2);

    foreach ($towns as [$townCode, $townName]) {
      $ins->execute([
        ':town_code'    => $townCode,
        ':town_name'    => $townName,
        ':county_code'  => $countyCode,
        ':county_name'  => $countyName,
        ':source_month' => $sourceMonth,
      ]);
      $rowsLoaded++;
    }
  }

  if ($rowsLoaded <= 0) {
    throw new RuntimeException('No rows loaded into staging.');
  }

  $rowsActive = (int)$pdo->query("SELECT COUNT(*) FROM admin_towns_staging WHERE is_active=1")->fetchColumn();

  // 4) 更新正式表（保留歷史：先全設 inactive，再用 staging 覆蓋/新增）
  $pdo->beginTransaction();

  $pdo->exec("UPDATE admin_towns SET is_active=0");

  $pdo->exec("
    INSERT INTO admin_towns (town_code, town_name, county_code, county_name, is_active, source_month)
    SELECT town_code, town_name, county_code, county_name, 1, source_month
    FROM admin_towns_staging
    ON DUPLICATE KEY UPDATE
      town_name=VALUES(town_name),
      county_code=VALUES(county_code),
      county_name=VALUES(county_name),
      is_active=1,
      source_month=VALUES(source_month)
  ");

  $pdo->commit();

  // 5) 寫入 log
  log_import($pdo, [
    'source_url'   => $URL_COUNTY . ' | ' . $URL_TOWN_BASE . '{county}',
    'http_code'    => $httpCode,
    'file_path'    => $filePath,
    'file_sha256'  => $fileSha,
    'rows_loaded'  => $rowsLoaded,
    'rows_active'  => $rowsActive,
    'status'       => 'OK',
    'message'      => 'Imported via NLSC XML API',
  ]);

  echo "OK: loaded={$rowsLoaded}, active={$rowsActive}\n";
  exit(0);

} catch (Throwable $e) {
  if ($pdo instanceof PDO && $pdo->inTransaction()) {
    $pdo->rollBack();
  }

  try {
    log_import($pdo, [
      'source_url'   => $URL_COUNTY . ' | ' . $URL_TOWN_BASE . '{county}',
      'http_code'    => $httpCode,
      'file_path'    => $filePath,
      'file_sha256'  => $fileSha,
      'rows_loaded'  => $rowsLoaded,
      'rows_active'  => $rowsActive,
      'status'       => 'FAIL',
      'message'      => mb_substr($e->getMessage(), 0, 500, 'UTF-8'),
    ]);
  } catch (Throwable $ignored) {}

  fwrite(STDERR, "FAIL: " . $e->getMessage() . "\n");
  exit(1);
}
