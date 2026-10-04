"""Synthetic HTTP authorization checks, using the existing isolated fixture only."""
import runpy,json,os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ctx=runpy.run_path(str(Path(__file__).with_name('preview_transfers_checks.py')))
globals().update({k:v for k,v in ctx.items() if not k.startswith('__')})
results=[]
def check(name,value):
 assert value,name
 results.append({'check':name,'passed':True});print('PASS',name,flush=True)

def account(c,t,action,uid,value):return req(c,'/api/admin/users/set-'+action,{'user_id':uid,action:value},t)[0]
check('USER backend page denied', '管理後台' not in req(user,'/admin')[1])
check('USER account list denied',req(user,'/api/admin/users/list')[0]==403)
check('USER cannot appoint self',account(user,ut,'role',2,'ADMIN')==403)
for action,value in [('role','USER'),('status','SUSPENDED')]:
 check('ADMIN cannot alter OWNER '+action,account(admin2,a2t,action,1,value)==403)
check('ADMIN cannot appoint USER',account(admin2,a2t,'role',2,'ADMIN')==403)
check('ADMIN cannot remove other ADMIN',account(admin2,a2t,'role',4,'USER')==403)
check('OWNER cannot accidentally demote self',account(admin,at,'role',1,'USER')==403)
for c,t in [(admin,at),(admin2,a2t)]:
 check('administrative password reset disabled',req(c,'/api/admin/users/reset-password',{'user_id':1},t)[0]==403)
check('ADMIN cannot adjust OWNER organization',post(admin2,a2t,action='adjust',user_id=1,organization_id=2,reason='synthetic adjustment')[0]==403)
check('profile rejects authority injection',req(user,'/api/users/update',{'name':'Synthetic','phone':'0123456789','email':'user@example.invalid','title':'Test','role':'ADMIN','organization_id':2},ut)[0]==403)
check('profile saves without review',req(user,'/api/users/update',{'name':'示範承辦人','phone':'0123456789','email':'user@example.invalid','title':'Test'},ut)[0]==200)
check('profile leaves unit and role intact',membership()==1 and req(user,'/api/auth/me')[1]['data']['role']=='USER')
check('OWNER appoints ADMIN',account(admin,at,'role',2,'ADMIN')==200)
check('old USER session acquires assigned ADMIN role',req(user,'/api/admin/users/list')[0]==200)
check('OWNER removes ADMIN',account(admin,at,'role',2,'USER')==200)
check('old ADMIN session loses backend access',req(user,'/api/admin/users/list')[0]==403)
check('ADMIN can suspend USER',account(admin2,a2t,'status',2,'SUSPENDED')==200)
check('suspended session rejected',req(user,'/api/places/list')[0]==401)
check('OWNER restores USER',account(admin,at,'status',2,'ACTIVE')==200)
user,ut=login('user@example.invalid')
# Change only the synthetic OWNER metadata: global access remains independent of it.
sql('UPDATE users SET organization_id=2 WHERE id=1')
check('OWNER metadata does not narrow map',{int(p['organization_id']) for p in req(admin,'/api/places/list')[1]['data']}=={1,2})
sql('UPDATE users SET organization_id=1 WHERE id=1')
sql("UPDATE users SET email='renamed-owner@example.invalid',role='USER' WHERE id=1")
check('OWNER remains highest after editable email and stored role change',req(admin,'/api/admin/users/list')[0]==200 and req(admin,'/api/auth/me')[1]['data']['role']=='ADMIN')
check('USER adopting previous OWNER email does not become OWNER',req(user,'/api/users/update',{'name':'示範承辦人','phone':'0123456789','email':'admin@example.invalid','title':'Test'},ut)[0]==200 and req(user,'/api/admin/users/list')[0]==403)
sql("UPDATE users SET email='admin@example.invalid',role='ADMIN' WHERE id=1")
sql("UPDATE users SET email='user@example.invalid' WHERE id=2")
with ThreadPoolExecutor(2) as pool:
 codes=list(pool.map(lambda value:account(admin,at,'role',4,value),['USER','ADMIN']))
check('concurrent owner role changes serialize',codes==[200,200])
account(admin,at,'role',4,'ADMIN')
# Binding absent: no ADMIN can perform an account mutation, even the previous OWNER.
envfile=ROOT/'app/.env';saved=envfile.read_text(encoding='utf8')
try:
 envfile.write_text(saved.replace('OWNER_USER_ID=1','OWNER_USER_ID='),encoding='utf8')
 check('unconfigured binding fails closed for role',account(admin,at,'role',4,'USER')==503)
 check('unconfigured binding fails closed for status',account(admin,at,'status',2,'SUSPENDED')==503)
 check('unconfigured binding preserves business map access',req(admin,'/api/places/list')[0]==200)
finally:envfile.write_text(saved,encoding='utf8')
check('OWNER badge and permissions supplied by server',any(u['is_owner'] and not u['can_role'] and not u['can_status'] for u in req(admin,'/api/admin/users/list')[1]['data']))
(ROOT/'permissions-http-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print('Permission HTTP:',len(results),'checks passed',flush=True)
