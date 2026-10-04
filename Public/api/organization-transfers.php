<?php
declare(strict_types=1);
require_once __DIR__ . '/common/bootstrap.php';
header('Cache-Control: no-store');
$actor = require_api_user();
if (!in_array(strtolower((string)env('ORGANIZATION_TRANSFERS_ENABLED', 'false')), ['true','1','yes','on'], true)) {
    json_error('單位異動尚未啟用，請洽系統管理者完成設定。',503,'TRANSFER_NOT_READY');
}
$pdo = db();
function transfer_fail(string $message, int $status=400): never { throw new DomainException($message,$status); }
function transfer_id($value): int {
    $id=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if ($id===false) transfer_fail('識別資料不正確。');
    return $id;
}
function transfer_reason($value): string {
    if (!is_string($value)) transfer_fail('請填寫異動／審核原因。');
    $value=trim($value);
    if (mb_strlen($value)<3 || mb_strlen($value)>1000) transfer_fail('原因請填寫 3 至 1000 字。');
    return $value;
}
function transfer_org(PDO $pdo,int $id,bool $active=true): array {
    $stmt=$pdo->prepare('SELECT id,name,is_active FROM organizations WHERE id=? FOR UPDATE');$stmt->execute([$id]);
    $org=$stmt->fetch(PDO::FETCH_ASSOC);
    if (!$org || ($active && (int)$org['is_active']!==1)) transfer_fail('目標單位不存在或已停用。');
    return $org;
}
function transfer_audit(PDO $pdo,array $target,array $actor,array $from,array $to,string $reason,string $type,?int $request): void {
    $stmt=$pdo->prepare('INSERT INTO organization_change_audit(user_id,user_name,actor_user_id,actor_name,from_organization_id,to_organization_id,from_organization_name,to_organization_name,reason,change_type,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([$target['id'],$target['name'],$actor['id'],$actor['name'],$from['id'],$to['id'],$from['name'],$to['name'],$reason,$type,$request]);
}
try {
    // Read-only preflight; never repair schema from an ordinary request.
    $engines=$pdo->query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','organizations','organization_transfer_requests','organization_change_audit')")->fetchAll(PDO::FETCH_ASSOC);
    if (count($engines)!==4 || count(array_filter($engines,fn($r)=>strtoupper((string)$r['ENGINE'])==='INNODB'))!==4) {
        transfer_fail('單位異動需要完整的 InnoDB 資料表，請洽系統管理者完成設定。',503);
    }
    if ($_SERVER['REQUEST_METHOD']==='GET') {
        $view=$_GET['view']??'history';
        if ($view==='options') {
            json_success(['organizations'=>$pdo->query('SELECT id,name FROM organizations WHERE is_active=1 ORDER BY name,id')->fetchAll(PDO::FETCH_ASSOC),'user'=>$actor]);
        }
        $admin=$actor['role']==='ADMIN';
        if ($view==='queue' && !$admin) transfer_fail('沒有審核權限。',403);
        if (!in_array($view,['history','queue','audit'],true)) transfer_fail('查詢類型不正確。');
        $offset=max(0,(int)($_GET['offset']??0));$limit=50;
        $params=[];$where=[];
        $table=$view==='audit'?'organization_change_audit':'organization_transfer_requests';
        if ($view!=='queue') {$where[]='t.user_id=?';$params[]=(int)$actor['id'];}
        if ($view==='audit' && $admin && isset($_GET['user_id'])) {$params=[transfer_id($_GET['user_id'])];}
        if ($view==='audit' && $admin && !isset($_GET['user_id'])) {$where=[];$params=[];}
        if ($view==='queue' && ($_GET['status']??'PENDING')!=='ALL') {
            $status=$_GET['status']??'PENDING';
            if (!in_array($status,['PENDING','APPROVED','REJECTED','WITHDRAWN','SUPERSEDED'],true)) transfer_fail('狀態不正確。');
            $where[]='t.status=?';$params[]=$status;
        }
        if ($view==='queue' && trim((string)($_GET['q']??''))!=='') {
            $where[]='(t.user_name LIKE ? OR t.from_organization_name LIKE ? OR t.to_organization_name LIKE ?)';
            $q='%'.mb_substr((string)$_GET['q'],0,100).'%';array_push($params,$q,$q,$q);
        }
        $clause=$where?' WHERE '.implode(' AND ',$where):'';
        $stmt=$pdo->prepare('SELECT COUNT(*) FROM '.$table.' t'.$clause);$stmt->execute($params);$total=(int)$stmt->fetchColumn();
        $stmt=$pdo->prepare('SELECT t.* FROM '.$table.' t'.$clause.' ORDER BY t.id DESC LIMIT '.$limit.' OFFSET '.$offset);$stmt->execute($params);
        json_success(['rows'=>$stmt->fetchAll(PDO::FETCH_ASSOC),'total'=>$total,'offset'=>$offset,'limit'=>$limit]);
    }
    if ($_SERVER['REQUEST_METHOD']!=='POST') transfer_fail('Method not allowed',405);
    $input=json_decode(file_get_contents('php://input'),true);
    if (!is_array($input)) transfer_fail('請提供有效資料。');
    $action=$input['action']??'';
    if (!in_array($action,['request','withdraw','review','adjust'],true)) transfer_fail('操作不正確。');
    $targetId=(int)$actor['id'];$requestId=null;
    if ($action==='review' || $action==='adjust') {
        if ($actor['role']!=='ADMIN') transfer_fail('沒有管理權限。',403);
        if ($action==='review') {
            $requestId=transfer_id($input['request_id']??null);
            $stmt=$pdo->prepare('SELECT user_id FROM organization_transfer_requests WHERE id=?');$stmt->execute([$requestId]);
            $targetId=(int)$stmt->fetchColumn();if (!$targetId) transfer_fail('找不到申請。',404);
        } else $targetId=transfer_id($input['user_id']??null);
        if ($targetId===(int)$actor['id']) transfer_fail('不可審核或直接調整本人單位。',403);
    }
    // Release session before transaction. Lock users in stable order for every mutation.
    $pdo->beginTransaction();
    $stmt=$pdo->prepare('SELECT id,name,role,status,organization_id FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE');$stmt->execute([(int)$actor['id'],$targetId]);
    $locked=[];foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row)$locked[(int)$row['id']]=$row;
    $fresh=$locked[(int)$actor['id']]??null;$target=$locked[$targetId]??null;
    if (!$fresh || $fresh['status']!=='ACTIVE') transfer_fail('登入狀態已失效。',401);
    if (!$target) transfer_fail('找不到帳戶。',404);
    if (in_array($action,['review','adjust'],true) && $fresh['role']!=='ADMIN') transfer_fail('管理權限已失效。',403);
    if ($action==='request') {
        if ($fresh['role']!=='USER') transfer_fail('此功能僅供一般使用者申請。',403);
        if (transfer_id($input['expected_organization_id']??null)!==(int)$fresh['organization_id']) transfer_fail('目前單位已異動，請重新整理後再申請。',409);
        $toId=transfer_id($input['organization_id']??null);$reason=transfer_reason($input['reason']??null);
        if ($toId===(int)$fresh['organization_id']) transfer_fail('目標單位與目前單位相同。');
        $from=transfer_org($pdo,(int)$fresh['organization_id'],false);$to=transfer_org($pdo,$toId);
        $stmt=$pdo->prepare("SELECT id FROM organization_transfer_requests WHERE user_id=? AND status='PENDING' FOR UPDATE");$stmt->execute([$targetId]);
        if ($stmt->fetchColumn()) transfer_fail('已有待審申請，請等待審核或先撤回。',409);
        $stmt=$pdo->prepare('INSERT INTO organization_transfer_requests(user_id,user_name,from_organization_id,to_organization_id,from_organization_name,to_organization_name,reason) VALUES(?,?,?,?,?,?,?)');
        $stmt->execute([$targetId,$fresh['name'],$from['id'],$to['id'],$from['name'],$to['name'],$reason]);
        $message='申請已送出，核准前仍使用原單位權限。';
    } elseif ($action==='withdraw') {
        $requestId=transfer_id($input['request_id']??null);
        $stmt=$pdo->prepare('SELECT user_id,status FROM organization_transfer_requests WHERE id=? FOR UPDATE');$stmt->execute([$requestId]);$request=$stmt->fetch(PDO::FETCH_ASSOC);
        if (!$request) transfer_fail('找不到申請。',404);
        if ((int)$request['user_id']!==$targetId) transfer_fail('不可撤回其他人的申請。',403);
        if ($request['status']!=='PENDING') transfer_fail('申請已處理，請重新整理。',409);
        $stmt=$pdo->prepare("UPDATE organization_transfer_requests SET status='WITHDRAWN',resolved_at=NOW() WHERE id=? AND status='PENDING'");$stmt->execute([$requestId]);
        $message='已撤回申請，單位沒有變更。';
    } else {
        $reason=transfer_reason($input['reason']??null);
        if ($action==='review') {
            $decision=$input['decision']??'';if (!in_array($decision,['APPROVED','REJECTED'],true)) transfer_fail('審核結果不正確。');
            $stmt=$pdo->prepare('SELECT * FROM organization_transfer_requests WHERE id=? FOR UPDATE');$stmt->execute([$requestId]);$request=$stmt->fetch(PDO::FETCH_ASSOC);
            if (!$request || $request['status']!=='PENDING') transfer_fail('申請已處理或撤回，請重新整理。',409);
            if ((int)$target['organization_id']!==(int)$request['from_organization_id']) transfer_fail('帳戶單位已異動，不能核准過期申請。',409);
            $toId=(int)$request['to_organization_id'];
            if ($decision==='REJECTED') {
                $stmt=$pdo->prepare("UPDATE organization_transfer_requests SET status='REJECTED',reviewed_by_user_id=?,review_reason=?,resolved_at=NOW() WHERE id=? AND status='PENDING'");$stmt->execute([$fresh['id'],$reason,$requestId]);
                $pdo->commit();json_success(['message'=>'已退回申請，原單位保持不變。']);
            }
        } else {
            $toId=transfer_id($input['organization_id']??null);
            if (transfer_id($input['expected_organization_id']??null)!==(int)$target['organization_id']) transfer_fail('帳戶單位已異動，請重新整理後確認。',409);
            if (($input['confirm_user_name']??null)!==$target['name']) transfer_fail('具名確認與帳戶不符，請重新整理。',409);
        }
        if ($target['role']!=='USER' || $target['status']!=='ACTIVE') transfer_fail('僅能異動啟用的一般使用者；停權或角色已變更的帳戶不能核准。',409);
        if ($toId===(int)$target['organization_id']) transfer_fail('目標單位與目前單位相同。');
        $from=transfer_org($pdo,(int)$target['organization_id'],false);$to=transfer_org($pdo,$toId);
        if ($action==='adjust') {
            $stmt=$pdo->prepare("SELECT id FROM organization_transfer_requests WHERE user_id=? AND status='PENDING' FOR UPDATE");$stmt->execute([$targetId]);$pending=$stmt->fetchColumn();
            $requestId=$pending?(int)$pending:null;
            if ($requestId) {
                $stmt=$pdo->prepare("UPDATE organization_transfer_requests SET status='SUPERSEDED',reviewed_by_user_id=?,review_reason=?,resolved_at=NOW() WHERE id=? AND status='PENDING'");$stmt->execute([$fresh['id'],mb_substr('管理者直接調整單位：'.$reason,0,1000),$requestId]);
            }
        } else {
            $stmt=$pdo->prepare("UPDATE organization_transfer_requests SET status='APPROVED',reviewed_by_user_id=?,review_reason=?,resolved_at=NOW() WHERE id=? AND status='PENDING'");$stmt->execute([$fresh['id'],$reason,$requestId]);
        }
        $stmt=$pdo->prepare('UPDATE users SET organization_id=?,updated_at=NOW() WHERE id=? AND organization_id=?');$stmt->execute([$toId,$targetId,$from['id']]);
        if ($stmt->rowCount()!==1) transfer_fail('帳戶已異動，請重新整理。',409);
        transfer_audit($pdo,$target,$fresh,$from,$to,$reason,$action==='adjust'?'DIRECT':'APPROVED_REQUEST',$requestId);
        $message='單位已異動，下一次請求立即使用新單位範圍；既有親訪紀錄保持原歸屬。';
    }
    $pdo->commit();json_success(['message'=>$message]);
} catch (DomainException $e) {
    if ($pdo->inTransaction())$pdo->rollBack();json_error($e->getMessage(),$e->getCode()?:400);
} catch (Throwable $e) {
    if ($pdo->inTransaction())$pdo->rollBack();
    if ($e instanceof PDOException && in_array((int)($e->errorInfo[1]??0),[1062,1213,1205],true))json_error('已有其他操作完成或正在處理，請重新整理後重試。',409);
    if ($e instanceof PDOException && in_array((int)($e->errorInfo[1]??0),[1146,1054],true))json_error('單位異動尚未完成資料庫設定，請洽系統管理者。',503,'TRANSFER_NOT_READY');
    server_error($e,'單位異動未完成，請重新整理確認。');
}
