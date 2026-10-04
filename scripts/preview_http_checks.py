"""HTTP regression checks against the synthetic loopback preview only."""
import urllib.request, urllib.parse, urllib.error, http.cookiejar, re, json, os
from pathlib import Path
BASE='http://127.0.0.1:43417'
ROOT=Path(os.environ['TEMP'])/'visitation-professional-preview'
assert json.loads((ROOT/'isolation.json').read_text())['isolated_datadir_verified']
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None
def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),NoRedirect())
def request(c,path,data=None,token=None):
    headers={'Content-Type':'application/json'}
    if token:headers['X-CSRF-Token']=token
    req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
    try:r=c.open(req,timeout=8)
    except urllib.error.HTTPError as e:r=e
    raw=r.read().decode('utf-8');
    try:body=json.loads(raw)
    except ValueError:body=raw
    return r.status,body,r.headers
results=[]
def check(name,actual,expected):
    assert actual==expected,f'{name}: {actual!r} != {expected!r}'
    results.append({'check':name,'passed':True,'actual':actual})
def login(c,email):
    code,page,_=request(c,'/login');check('login page',code,200)
    token=re.search(r'name="csrf-token" content="([^"]+)"',page).group(1)
    code,body,_=request(c,'/api/auth/login',{'email':email,'password':'Preview-only-2026!'},token)
    check('real login '+email,code,200)
    code,page,_=request(c,'/admin' if email!='user@example.invalid' else '/app')
    token=re.search(r'name="csrf-token" content="([^"]+)"',page).group(1)
    return token
controller,target,user=client(),client(),client()
token=login(controller,'admin@example.invalid');login(target,'target@example.invalid');login(user,'user@example.invalid')
check('missing CSRF rejected',request(controller,'/api/admin/users/set-status',{'user_id':2,'status':'SUSPENDED'})[0],419)
check('self suspension rejected',request(controller,'/api/admin/users/set-status',{'user_id':1,'status':'SUSPENDED'},token)[0],403)
check('self demotion rejected',request(controller,'/api/admin/users/set-role',{'user_id':1,'role':'USER'},token)[0],403)
check('suspend user',request(controller,'/api/admin/users/set-status',{'user_id':2,'status':'SUSPENDED'},token)[0],200)
check('old suspended session me rejected',request(user,'/api/auth/me')[0],401)
check('old suspended session places rejected',request(user,'/api/places/list')[0],401)
fresh=client();_,page,_=request(fresh,'/login');freshToken=re.search(r'name="csrf-token" content="([^"]+)"',page).group(1)
check('new suspended login rejected',request(fresh,'/api/auth/login',{'email':'user@example.invalid','password':'Preview-only-2026!'},freshToken)[0],403)
check('demote administrator',request(controller,'/api/admin/users/set-role',{'user_id':4,'role':'USER'},token)[0],200)
check('old demoted admin list rejected',request(target,'/api/admin/users/list')[0],403)
check('old demoted stats rejected',request(target,'/api/admin/stats')[0],403)
check('legacy endpoint remains disabled',request(target,'/api/users/list')[0],410)
check('demoted session role refreshed',request(target,'/api/auth/me')[1]['data']['role'],'USER')
check('demoted session ordinary places permitted',request(target,'/api/places/list')[0],200)
check('demoted admin page redirects',request(target,'/admin')[2].get('Location'),'/app')
check('restore user',request(controller,'/api/admin/users/set-status',{'user_id':2,'status':'ACTIVE'},token)[0],200)
check('restoring account does not revive cleared session',request(user,'/api/auth/me')[0],401)
userToken=login(user,'user@example.invalid')
check('logout succeeds',request(user,'/api/auth/logout',{},userToken)[0],200)
check('logged out session denied',request(user,'/api/auth/me')[0],401)
login(user,'user@example.invalid')
check('re-login succeeds',request(user,'/api/auth/me')[0],200)
check('restore target admin',request(controller,'/api/admin/users/set-role',{'user_id':4,'role':'ADMIN'},token)[0],200)
check('security throttles endpoint',request(controller,'/api/admin/auth_throttles.php')[0],200)
check('security events endpoint',request(controller,'/api/admin/auth_events.php')[0],200)
(ROOT/'http-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'HTTP regression: {len(results)} assertions passed',flush=True)
