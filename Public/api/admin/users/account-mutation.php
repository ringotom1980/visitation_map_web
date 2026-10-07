<?php
declare(strict_types=1);
require_once __DIR__.'/../../common/bootstrap.php';
if (!isset($accountAction) || !in_array($accountAction,['role','status'],true)) json_error('Not found',404);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed',405);
$actor=require_api_user();
if (!user_is_admin($actor)) json_error('沒有管理權限。',403);
if (!owner_user_id()) json_error('系統管理員身分尚未完成安全綁定，帳戶管理暫停。',503,'OWNER_NOT_CONFIGURED');
$input=$_POST ?: json_decode(file_get_contents('php://input'),true);
if (!is_array($input)) json_error('請提供有效資料。');
$targetId=filter_var($input['user_id']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
$value=$input[$accountAction]??'';
$allowed=$accountAction==='role'?['USER','ADMIN']:['ACTIVE','SUSPENDED'];
if (!$targetId || !in_array($value,$allowed,true)) json_error('參數不正確。');
$pdo=db();
try {
    $pdo->beginTransaction();
    $stmt=$pdo->prepare('SELECT id,role,status,organization_id FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE');
    $stmt->execute([(int)$actor['id'],$targetId]);
    $rows=[];foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row)$rows[(int)$row['id']]=$row;
    $fresh=$rows[(int)$actor['id']]??null;$target=$rows[$targetId]??null;
    if (!$fresh || !user_is_admin($fresh)) throw new DomainException('管理權限已失效。',403);
    if (!$target) throw new DomainException('找不到帳戶。',404);
    if (!account_action_allowed($fresh,$target,$accountAction)) throw new DomainException('不可變更此帳戶；管理者任免僅限系統管理員。',403);
    $stmt=$pdo->prepare('UPDATE users SET '.$accountAction.'=?,updated_at=NOW() WHERE id=?');
    $stmt->execute([$value,$targetId]);
    $stmt=$pdo->prepare('INSERT INTO auth_events(event_type,user_id,detail) VALUES(?,?,?)');
    $stmt->execute(['ACCOUNT_'.strtoupper($accountAction),(int)$fresh['id'],'target='.$targetId.'; '.$target[$accountAction].' -> '.$value]);
    $pdo->commit();json_success(['message'=>'帳戶已更新。']);
} catch (DomainException $e) {
    if ($pdo->inTransaction())$pdo->rollBack();json_error($e->getMessage(),$e->getCode());
} catch (Throwable $e) {
    if ($pdo->inTransaction())$pdo->rollBack();server_error($e);
}
