<?php
// Public/api/common/address_parser.php
// 地址 → town_code 的解析
function parse_address_to_town_code(PDO $pdo, ?string $addressText): ?string
{
  if (!$addressText) return null;

  // ✅ 同名 placeholder 不要重複用：拆成 :addr1 / :addr2
  $sql = "SELECT town_code
          FROM admin_towns
          WHERE :addr1 LIKE CONCAT('%', town_name, '%')
            AND is_active = 1
          ORDER BY
            (CASE WHEN :addr2 LIKE CONCAT('%', county_name, '%') THEN 1 ELSE 0 END) DESC,
            CHAR_LENGTH(town_name) DESC
          LIMIT 1";

  $stmt = $pdo->prepare($sql);

  // ✅ execute key 不帶冒號（和你 create/update.php 一致）
  $stmt->execute([
    'addr1' => $addressText,
    'addr2' => $addressText,
  ]);

  return $stmt->fetchColumn() ?: null;
}
