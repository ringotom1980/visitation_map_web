"""Real Apache mod_rewrite + PHP against the existing isolated MariaDB fixture."""
from pathlib import Path
import importlib.util, os, shutil, subprocess, socket, time, urllib.request, urllib.error, http.cookiejar, re, json, hashlib
SOURCE=Path(__file__).resolve().parents[1]
FIXTURE=Path(os.environ['TEMP'])/'visitation-professional-preview'
assert json.loads((FIXTURE/'isolation.json').read_text())['isolated_datadir_verified']
ROOT=Path(os.environ['TEMP'])/'visitation-apache-routing';ROOT.mkdir(exist_ok=True)
docroot=ROOT/'www';project=docroot/'visitation_map_web';project.mkdir(parents=True,exist_ok=True)
for folder in ['Public','config']:shutil.copytree(FIXTURE/'app'/folder,project/folder,dirs_exist_ok=True)
# Only copy the known synthetic environment, never SOURCE/.env.
shutil.copyfile(FIXTURE/'app/.env',project/'.env')
spec=importlib.util.spec_from_file_location('root_routes',SOURCE/'.github/scripts/deploy_root_routes.py')
deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
baseline=(SOURCE/'docs/hosting-root.htaccess').read_bytes();patched=deploy.patch_routes(baseline)
current_entry=(SOURCE/'Public/index.php').read_bytes()
# Reproduce the previously published login fallback, then test the actual new
# allowlisted entry under the user's unchanged document-root rewrite rules.
(project/'Public/index.php').write_bytes(subprocess.check_output(['git','show','0da63a3:Public/index.php'],cwd=SOURCE))
assert deploy.patch_routes(patched)==patched
for invalid in [baseline.replace(b'RewriteRule ^admin/?$',b'RewriteRule ^other/?$'),baseline+baseline,baseline+b'\nRewriteRule ^admin/accounts/?$ unrelated.php [L]\n']:
 try:deploy.patch_routes(invalid);raise AssertionError('Unsafe routing accepted')
 except ValueError:pass
(docroot/'.htaccess').write_bytes(baseline)
(ROOT/'sessions').mkdir(exist_ok=True)
(ROOT/'php.ini').write_text('extension_dir=C:/xampp/php/ext\nextension=php_pdo_mysql.dll\nextension=php_mbstring.dll\ndisable_functions=mail\ndisplay_errors=0\nsession.save_path="'+(ROOT/'sessions').as_posix()+'"\n',encoding='utf8')
config=f'''ServerRoot "C:/xampp/apache"
Listen 127.0.0.1:43419
ServerName 127.0.0.1
PidFile "{(ROOT/'apache.pid').as_posix()}"
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule mime_module modules/mod_mime.so
LoadModule dir_module modules/mod_dir.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule log_config_module modules/mod_log_config.so
LoadFile "C:/xampp/php/php8ts.dll"
LoadFile "C:/xampp/php/libsqlite3.dll"
LoadModule php_module "C:/xampp/php/php8apache2_4.dll"
PHPIniDir "{ROOT.as_posix()}"
TypesConfig "C:/xampp/apache/conf/mime.types"
ErrorLog "{(ROOT/'error.log').as_posix()}"
LogLevel warn
DocumentRoot "{docroot.as_posix()}"
DirectoryIndex index.php
<Directory "{docroot.as_posix()}">
AllowOverride All
Options FollowSymLinks
Require all granted
</Directory>
<FilesMatch "\\.php$">
SetHandler application/x-httpd-php
</FilesMatch>
'''
(ROOT/'httpd.conf').write_text(config,encoding='utf8')
subprocess.run(['C:/xampp/apache/bin/httpd.exe','-t','-d',ROOT.as_posix(),'-f','httpd.conf'],check=True,capture_output=True)
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),NoRedirect())
def req(c,path,data=None,csrf=None):
 headers={'Content-Type':'application/json'}
 if csrf:headers['X-CSRF-Token']=csrf
 request=urllib.request.Request('http://127.0.0.1:43419'+path,headers=headers,data=json.dumps(data).encode() if data is not None else None)
 try:r=c.open(request,timeout=15)
 except urllib.error.HTTPError as e:r=e
 return r.status,r.read(),r.headers
results=[]
def check(name,ok):
 assert ok,name
 results.append({'check':name,'passed':True});print('PASS',name,flush=True)
def login(email):
 c=client();code,body,_=req(c,'/login');token=re.search(rb'name="csrf-token" content="([^"]+)"',body).group(1).decode()
 code,body,_=req(c,'/api/auth/login',{'email':email,'password':'Preview-only-2026!'},token)
 check('real Apache login '+email,code==200 and json.loads(body)['success']);return c
process=subprocess.Popen(['C:/xampp/apache/bin/httpd.exe','-X','-d',ROOT.as_posix(),'-f','httpd.conf'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
try:
 for _ in range(100):
  if process.poll() is not None:raise RuntimeError((ROOT/'error.log').read_text())
  try:
   with socket.create_connection(('127.0.0.1',43419),timeout=.1):break
  except OSError:time.sleep(.1)
 anonymous=client()
 for path in ['/admin/accounts','/admin/accounts.php','/admin/transfers','/admin/transfers.php']:
  code,body,_=req(anonymous,path);check('baseline reproduces fallback '+path,code==200 and b'id="loginForm"' in body)
 (project/'Public/index.php').write_bytes(current_entry)
 check('unchanged real root rules with allowlisted application dispatcher',(docroot/'.htaccess').read_bytes()==baseline)
 check('patch idempotent and preserves baseline rules',all(line in patched for line in baseline.splitlines()))
 for path in ['/admin/accounts','/admin/accounts/','/admin/accounts.php','/admin/transfers','/admin/transfers/','/admin/transfers.php','/admin/accounts?view=authorization','/admin','/admin/security','/profile','/app']:
  code,body,headers=req(anonymous,path);check('anonymous login redirect '+path,code==302 and headers.get('Location')=='/login' and b'id="loginForm"' not in body)
 for path in ['/login','/register','/forgot','/reset','/device-verify']:
  code,_,_=req(anonymous,path);check('existing public route retained '+path,code in [200,302])
 for path in ['/api/auth/me','/api/places/list','/api/organization-transfers','/api/organization-transfers.php']:
  code,body,headers=req(anonymous,path);check('existing API protected '+path,code==401 and 'application/json' in headers.get('Content-Type',''))
 for relative in ['assets/css/admin.css','assets/js/admin.js','assets/js/personal.js']:
  code,body,_=req(anonymous,'/'+relative);check('static rewrite byte identity '+relative,code==200 and body==(project/'Public'/relative).read_bytes())
 for path in ['/admin/config.php','/admin/accounts/anything.php','/admin/transfers/anything.php']:
  code,body,_=req(anonymous,path);check('unallowlisted admin route remains fallback '+path,code==200 and b'id="loginForm"' in body)
 for path in ['/admin/anything.php?file=../../config/db.php','/admin/accounts.php/evil','/admin/transfers.php/foo','/admin/accounts/%2e%2e/%2e%2e/config/db.php']:
  code,body,_=req(anonymous,path);check('query/traversal cannot select arbitrary page '+path,code in [400,403,404] or (code==200 and b'id="loginForm"' in body))
 for email,role in [('admin@example.invalid','OWNER'),('target@example.invalid','ADMIN'),('user@example.invalid','USER')]:
  c=login(email)
  for route,marker in [('accounts',b'id="usersContainer"'),('transfers',b'data-transfer-mode="admin"')]:
   for suffix in ['', '.php']:
    code,body,headers=req(c,'/admin/'+route+suffix)
    check(role+' reaches correct canonical/legacy page '+route+suffix,code==302 and headers.get('Location')=='/app' if role=='USER' else code==200 and marker in body and b'id="loginForm"' not in body)
  for suffix in ['', '.php']:
   path='/admin/accounts'+suffix+'?view=authorization&file=../../config/db.php'
   code,body,headers=req(c,path,{'user_id':1,'role':'ADMIN','organization_id':2})
   check(role+' query/POST remains fixed page '+suffix,code==302 and headers.get('Location')=='/app' if role=='USER' else code==200 and b'id="usersContainer"' in body and headers.get('Location') is None)
  code,body,_=req(c,'/api/auth/me');me=json.loads(body)['data']
  check(role+' page POST cannot change role or unit',code==200 and me['role']==('USER' if role=='USER' else 'ADMIN') and int(me['organization_id'])==1)
  code,body,_=req(c,'/admin')
  if role!='USER':
   check(role+' dashboard links canonical pages',b'href="/admin/accounts"' in body and b'href="/admin/transfers"' in body)
 check('configured isolated Apache document root',str(docroot).startswith(os.environ['TEMP']))
 # The optional minimal outer-root patch also works with the same application.
 (docroot/'.htaccess').write_bytes(patched)
 for path in ['/admin/accounts','/admin/accounts.php','/admin/transfers','/admin/transfers.php']:
  code,_,headers=req(anonymous,path);check('optional outer-root patch login redirect '+path,code==302 and headers.get('Location')=='/login')
 (ROOT/'results.json').write_text(json.dumps({'engine':'Apache httpd mod_rewrite + PHP module','synthetic_only':True,'primary_mode':'unchanged document-root rules plus explicit application allowlist','root_rules_sha256':hashlib.sha256(baseline).hexdigest(),'optional_patched_root_sha256':hashlib.sha256(patched).hexdigest(),'results':results},ensure_ascii=False,indent=2),encoding='utf8')
 print('Apache rewrite:',len(results),'checks passed',flush=True)
finally:
 process.terminate()
 try:process.wait(timeout=5)
 except subprocess.TimeoutExpired:process.kill()
