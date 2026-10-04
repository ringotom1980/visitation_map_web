<?php
declare(strict_types=1);
require_once __DIR__.'/../../common/bootstrap.php';
require_admin();
json_error('密碼須由帳戶本人透過忘記密碼驗證流程重設。',403,'SELF_SERVICE_PASSWORD_REQUIRED');
