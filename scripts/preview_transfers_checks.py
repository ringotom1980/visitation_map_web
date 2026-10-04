"""Synthetic loopback API/race tests. No production environment reads."""
import json,os,re,urllib.request,urllib.error,http.cookiejar,subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(os.environ['TEMP'])/'visitation-professional-preview'
assert json.loads((ROOT/'isolation.json').read_text())['isolated_datadir_verified']
BASE='http://127.0.0.1:43417';END='/api/organization-transfers.php';results=[]
def check(name,value):
    assert value,name
    results.append({'check':name,'passed':True});print('PASS',name,flush=True)
def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def req(c,path,data=None,token=None):
    headers={'Content-Type':'application/json'}
    if token:headers['X-CSRF-Token']=token
    request=urllib.request.Request(BASE+path,headers=headers,data=json.dumps(data).encode() if data is not None else None)
    try:r=c.open(request,timeout=12)
    except urllib.error.HTTPError as e:r=e
    raw=r.read().decode('utf8')
    try:body=json.loads(raw)
    except ValueError:body=raw
    return r.status,body
def login(email):
    c=client();_,page=req(c,'/login');token=re.search(r'name="csrf-token" content="([^"]+)"',page).group(1)
    code,_=req(c,'/api/auth/login',{'email':email,'password':'Preview-only-2026!'},token);assert code==200
    _,page=req(c,'/profile');token=re.search(r'name="csrf-token" content="([^"]+)"',page).group(1)
    return c,token
def sql(query):
    # Verify the actual dedicated datadir on every test-only SQL operation.
    code='''<?php $p=new PDO('mysql:host=127.0.0.1;port=43416;dbname=visitation_preview_synthetic;charset=utf8mb4','root','preview-synthetic-only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$actual=rtrim(str_replace('\\\\','/',strtolower($p->query('SELECT @@datadir')->fetchColumn())),'/');
if($actual!==rtrim(str_replace('\\\\','/',strtolower(EXPECTED)),'/'))throw new RuntimeException('Isolation violation');
$r=$p->query(QUERY);echo json_encode($r->columnCount()?$r->fetchAll(PDO::FETCH_ASSOC):[]);
'''.replace('EXPECTED',json.dumps(str(ROOT/'mariadb-data'))).replace('QUERY',json.dumps(query,ensure_ascii=False))
    file=ROOT/'transfer-query.php';file.write_text(code,encoding='utf8')
    return json.loads(subprocess.check_output(['C:/xampp/php/php.exe','-n','-d','extension_dir=C:/xampp/php/ext','-d','extension=php_pdo_mysql.dll',str(file)],encoding='utf8'))
admin,at=login('admin@example.invalid');admin2,a2t=login('target@example.invalid');user,ut=login('user@example.invalid');other,ot=login('other@example.invalid')
def post(c,t,**data):return req(c,END,data,t)
def pending(c):return next(r for r in req(c,END+'?view=history')[1]['data']['rows'] if r['status']=='PENDING')
def make(c=None,t=None,org=2):
    c=user if c is None else c;t=ut if t is None else t
    expected=req(c,'/api/auth/me')[1]['data']['organization_id']
    code,_=post(c,t,action='request',organization_id=org,expected_organization_id=expected,reason='合成測試單位異動原因');assert code==200;return pending(c)['id']
def membership(uid=2):return int(sql('SELECT organization_id FROM users WHERE id='+str(uid))[0]['organization_id'])
def adjust(org,expected=1,**extra):return post(admin,at,action='adjust',user_id=2,organization_id=org,expected_organization_id=expected,confirm_user_name='示範承辦人',reason='合成直接異動原因',**extra)
check('anonymous denied',req(client(),END)[0]==401)
check('CSRF required',req(user,END,{'action':'request','organization_id':2,'reason':'測試原因'})[0]==419)
check('ordinary user cannot view review queue',req(user,END+'?view=queue')[0]==403)
check('only active organizations offered',set(int(o['id']) for o in req(user,END+'?view=options')[1]['data']['organizations'])=={1,2,4})
for label,org,reason in [('same unit',1,'測試原因'),('inactive unit',3,'測試原因'),('missing unit',999,'測試原因'),('empty reason',2,''),('oversize reason',2,'甲'*1001),('invalid id','2abc','測試原因')]:
    check(label+' rejected',post(user,ut,action='request',organization_id=org,expected_organization_id=1,reason=reason)[0]==400)
check('admin self request rejected',post(admin,at,action='request',organization_id=2,reason='測試原因')[0]==403)
rid=make();check('pending leaves membership unchanged',membership()==1)
check('duplicate pending rejected',post(user,ut,action='request',organization_id=4,expected_organization_id=1,reason='再次異動申請')[0]==409)
check('other user history private',not req(other,END+'?view=history')[1]['data']['rows'])
check('other user cannot withdraw',post(other,ot,action='withdraw',request_id=rid)[0]==403)
check('ordinary reviewer denied',post(user,ut,action='review',request_id=rid,decision='APPROVED',reason='審核原因')[0]==403)
check('withdraw succeeds',post(user,ut,action='withdraw',request_id=rid)[0]==200)
check('withdrawn cannot be approved',post(admin,at,action='review',request_id=rid,decision='APPROVED',reason='審核原因')[0]==409)
rid=make();check('reject reason required',post(admin,at,action='review',request_id=rid,decision='REJECTED',reason='')[0]==400)
check('reject preserves unit',post(admin,at,action='review',request_id=rid,decision='REJECTED',reason='資料尚待補充')[0]==200 and membership()==1)
check('user sees rejection reason',req(user,END+'?view=history')[1]['data']['rows'][0]['review_reason']=='資料尚待補充')
rid=make()
def approve(pair):c,t=pair;return post(c,t,action='review',request_id=rid,decision='APPROVED',reason='合成核准理由')[0]
with ThreadPoolExecutor(2) as pool:codes=list(pool.map(approve,[(admin,at),(admin2,a2t)]))
check('simultaneous review exactly one winner',sorted(codes)==[200,409])
check('single transactional audit',int(sql('SELECT COUNT(*) AS n FROM organization_change_audit')[0]['n'])==1)
check('old session now has new unit',req(user,'/api/auth/me')[1]['data']['organization_id']==2)
check('old unit get denied',req(user,'/api/places/get?id=1')[0] in (403,404))
check('old session sees only new unit places',{int(p['organization_id']) for p in req(user,'/api/places/list')[1]['data']}=={2})
check('old unit update denied',req(user,'/api/places/update',{'id':1,'serviceman_name':'不得寫入','category':'因公死亡','condolence_order_no':'DEMO-001'},ut)[0] in (403,404))
check('records ownership unchanged',int(sql('SELECT organization_id FROM places WHERE id=1')[0]['organization_id'])==1)
check('direct revert succeeds',adjust(1,2)[0]==200)
rid=make();check('direct action named confirmation required',post(admin,at,action='adjust',user_id=2,organization_id=4,expected_organization_id=1,confirm_user_name='其他人',reason='調整原因')[0]==409)
check('self direct adjustment forbidden',post(admin,at,action='adjust',user_id=1,organization_id=2,expected_organization_id=1,confirm_user_name='示範管理者',reason='調整原因')[0]==403)
check('admin target not adjustable',post(admin,at,action='adjust',user_id=4,organization_id=2,expected_organization_id=1,confirm_user_name='測試管理者',reason='調整原因')[0]==409)
check('direct supersedes pending',adjust(4)[0]==200 and req(user,END+'?view=history')[1]['data']['rows'][0]['status']=='SUPERSEDED')
check('superseded cannot approve',post(admin,at,action='review',request_id=rid,decision='APPROVED',reason='審核理由')[0]==409)
check('stale direct source rejected',adjust(2)[0]==409)
check('membership restored for inactive tests',adjust(1,4)[0]==200)
rid=make();sql("UPDATE users SET status='SUSPENDED' WHERE id=2")
check('suspended target approval rejected',post(admin,at,action='review',request_id=rid,decision='APPROVED',reason='審核理由')[0]==409)
check('suspended old session rejected',req(user,END)[0]==401)
check('suspended target direct rejected',adjust(4)[0]==409)
check('suspended request can be rejected safely',post(admin,at,action='review',request_id=rid,decision='REJECTED',reason='帳戶已停權')[0]==200)
sql("UPDATE users SET status='ACTIVE' WHERE id=2");user,ut=login('user@example.invalid')
rid=make();sql("UPDATE users SET role='ADMIN' WHERE id=2")
check('promoted target approval rejected',post(admin,at,action='review',request_id=rid,decision='APPROVED',reason='審核理由')[0]==409)
post(admin,at,action='review',request_id=rid,decision='REJECTED',reason='角色已變更');sql("UPDATE users SET role='USER' WHERE id=2")
rid=make();sql('UPDATE organizations SET is_active=0 WHERE id=2')
check('disabled target after submission cannot approve',post(admin,at,action='review',request_id=rid,decision='APPROVED',reason='審核理由')[0]==400)
sql('UPDATE organizations SET is_active=1 WHERE id=2');post(user,ut,action='withdraw',request_id=rid)
rid=make();sql("UPDATE users SET role='USER' WHERE id=4")
check('demoted old reviewer session rejected',post(admin2,a2t,action='review',request_id=rid,decision='APPROVED',reason='審核理由')[0]==403)
sql("UPDATE users SET role='ADMIN' WHERE id=4")
sql("CREATE TRIGGER qa_audit_fail BEFORE INSERT ON organization_change_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'")
check('audit failure rejects change',adjust(4)[0]==500)
check('audit failure rolls back membership and pending',membership()==1 and pending(user)['id']==rid)
sql('DROP TRIGGER qa_audit_fail')
sql('RENAME TABLE organization_change_audit TO organization_change_audit_test_backup')
check('missing schema returns 503 without DDL',req(admin,END+'?view=options')[0]==503)
sql('RENAME TABLE organization_change_audit_test_backup TO organization_change_audit')
post(user,ut,action='withdraw',request_id=rid)
check('audit only visible to owner or admin',not req(other,END+'?view=audit')[1]['data']['rows'])
check('audit records immutable via API',post(admin,at,action='delete-audit',id=1)[0]==400)
rid=make()
try:
    sql("INSERT INTO organization_transfer_requests(user_id,user_name,from_organization_id,to_organization_id,from_organization_name,to_organization_name,reason) SELECT user_id,user_name,from_organization_id,to_organization_id,from_organization_name,to_organization_name,reason FROM organization_transfer_requests WHERE id="+str(rid))
    raise AssertionError('pending unique missing')
except subprocess.CalledProcessError:check('database constraint prevents duplicate pending',True)
post(user,ut,action='withdraw',request_id=rid)
# Clean only transfer fixtures for the real-browser walkthrough.
sql('DELETE FROM organization_change_audit');sql('DELETE FROM organization_transfer_requests')
check('fixture ready for UI',membership()==1)
(ROOT/'transfer-http-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print('Transfer HTTP:',len(results),'checks passed',flush=True)
