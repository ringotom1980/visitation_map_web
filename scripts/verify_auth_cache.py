"""Verify per-request auth caching and deleted/suspended sessions without a database."""
from pathlib import Path
import tempfile,subprocess,shutil,json
source=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='visitation-auth-') as folder:
    root=Path(folder)
    shutil.copyfile(source/'config/auth.php',root/'auth.php')
    shutil.copyfile(source/'config/permissions.php',root/'permissions.php')
    (root/'app.php').write_text('<?php session_name("isolated_auth_test"); function env($key,$default=null){return $default;}',encoding='utf-8')
    (root/'db.php').write_text('''<?php
class FixtureStatement {function execute($params) {} function fetch(){return $GLOBALS['fixture'];}}
class FixtureDatabase {function prepare($sql){$GLOBALS['queries']++;return new FixtureStatement();}}
function db(){return new FixtureDatabase();}
''',encoding='utf-8')
    (root/'check.php').write_text('''<?php
require __DIR__.'/auth.php';
$_SESSION=['user_id'=>1,'role'=>'ADMIN'];$queries=0;
$case=$argv[1];
$fixture=$case==='missing'?false:['id'=>1,'role'=>'USER','status'=>$case==='suspended'?'SUSPENDED':'ACTIVE'];
$id=current_user_id();$role=current_user_role();$admin=is_admin();$user=current_user();
if($queries!==1)throw new RuntimeException('Expected exactly one lookup');
if($case==='active') {
 if($id!==1||$role!=='USER'||$admin||$_SESSION['role']!=='USER')throw new RuntimeException('Stale session role accepted');
} else {
 if($id!==null||$role!==null||$admin||$user!==null||$_SESSION!==[])throw new RuntimeException('Invalid session not cleared');
}
echo json_encode(['case'=>$case,'passed'=>true,'queries'=>$queries]);
''',encoding='utf-8')
    results=[]
    for case in ['active','suspended','missing']:
        result=subprocess.check_output(['C:/xampp/php/php.exe','-n',str(root/'check.php'),case],encoding='utf-8')
        results.append(json.loads(result))
    print(json.dumps(results))
