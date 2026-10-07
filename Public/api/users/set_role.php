<?php
declare(strict_types=1);

require_once __DIR__ . '/../common/bootstrap.php';

json_error('此 API 已停用，請使用 /api/admin/users/set-role。', 410, 'API_DEPRECATED');
