<?php
// Public/api/common/address_parser.php
// 地址 → town_code 的解析
function parse_address_to_town_code(PDO $pdo, ?string $addressText): ?string
{
  if (!$addressText) return null;

  // 用 admin_towns 的中文名比對（最穩）
  $sql = "SELECT town_code
          FROM admin_towns
          WHERE :addr LIKE CONCAT('%', town_name, '%')
          AND is_active = 1
          ORDER BY
          (CASE WHEN :addr LIKE CONCAT('%', county_name, '%') THEN 1 ELSE 0 END) DESC,
          CHAR_LENGTH(town_name) DESC
          LIMIT 1";
  $stmt = $pdo->prepare($sql);
  $stmt->execute([':addr' => $addressText]);
  return $stmt->fetchColumn() ?: null;
}
