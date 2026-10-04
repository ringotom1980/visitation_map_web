"""Isolated synthetic preview; never loads the project's .env or production DB.
Usage: python scripts/local_preview.py [--reset]
"""
from pathlib import Path
import subprocess, shutil, socket, time, json, sys, os
import http.server, threading, urllib.parse, urllib.request, mimetypes, gzip

SOURCE = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ['TEMP']) / 'visitation-professional-preview'
ROOT.mkdir(exist_ok=True)
PHP = Path('C:/xampp/php/php.exe')
MARIA = Path('C:/Program Files/MariaDB 12.0/bin')
PHPARGS = [str(PHP), '-n', '-d', 'extension_dir=C:/xampp/php/ext']
for extension in ['pdo_mysql', 'mbstring']:
    PHPARGS += ['-d', 'extension=php_' + extension + '.dll']
PHPARGS += ['-d', 'disable_functions=mail', '-d', 'display_errors=0']
DBPORT, WEBPORT = 43416, 43417

class PreviewProxy(http.server.BaseHTTPRequestHandler):
    """Run existing PHP CGI per request; no idle-socket blocking on Windows."""
    def forward(self):
        url=urllib.parse.urlsplit(self.path);path=urllib.parse.unquote(url.path)
        public=ROOT/'app/Public'
        pages={'/login':'index.php','/app':'app.php','/admin':'admin/index.php','/admin/security':'admin/auth_security.php','/profile':'profile.php','/forgot':'forgot.php','/register':'register.php','/reset':'reset.php','/device-verify':'device_verify.php'}
        relative=pages.get(path,path.lstrip('/')+('.php' if path.startswith('/api/') and not path.endswith('.php') else ''))
        file=(public/relative).resolve()
        if not file.is_relative_to(public.resolve()) or not file.is_file():self.send_error(404);return
        if file.suffix!='.php':
            payload=file.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(file)[0] or 'application/octet-stream')
            if 'gzip' in self.headers.get('Accept-Encoding','') and file.suffix in ['.js','.css','.json']:
                payload=gzip.compress(payload);self.send_header('Content-Encoding','gzip')
        else:
            body=self.rfile.read(int(self.headers.get('Content-Length','0')))
            env=os.environ.copy();env.update({'REDIRECT_STATUS':'1','SCRIPT_FILENAME':str(file),'SCRIPT_NAME':path,'REQUEST_METHOD':self.command,'REQUEST_URI':self.path,'QUERY_STRING':url.query,'CONTENT_TYPE':self.headers.get('Content-Type',''),'CONTENT_LENGTH':str(len(body)),'SERVER_NAME':'127.0.0.1','SERVER_PORT':'43417','SERVER_PROTOCOL':'HTTP/1.1','REMOTE_ADDR':'127.0.0.1'})
            for key,value in self.headers.items():env['HTTP_'+key.upper().replace('-','_')]=value
            args=[str(PHP.with_name('php-cgi.exe'))]+PHPARGS[1:]+['-d','session.save_path='+str(ROOT/'sessions')]
            response=subprocess.run(args,input=body,capture_output=True,env=env,timeout=20)
            header,separator,payload=response.stdout.partition(b'\r\n\r\n')
            if not separator:self.send_error(502,'PHP CGI returned no headers');return
            fields=[line.decode('utf-8').split(':',1) for line in header.split(b'\r\n') if b':' in line]
            status=next((int(value.strip().split()[0]) for key,value in fields if key.lower()=='status'),200)
            self.send_response(status)
            for key,value in fields:
                if key.lower() not in ['status','connection','content-length']:self.send_header(key,value.strip())
        self.send_header('Content-Length',str(len(payload)));self.end_headers()
        if self.command!='HEAD':
            for offset in range(0,len(payload),16384):
                self.wfile.write(payload[offset:offset+16384]);self.wfile.flush()
    do_GET=do_POST=do_HEAD=forward
    def log_message(self,*args):pass

def wait(port, process):
    for _ in range(150):
        if process.poll() is not None:
            raise RuntimeError('Preview process exited before readiness')
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.1): return
        except OSError: time.sleep(.1)
    raise RuntimeError('Readiness timeout')

def main():
    stop_file=ROOT/'stop-preview'
    if '--stop' in sys.argv:
        stop_file.touch();print('Requested stop of the isolated preview.');return
    for port in [DBPORT, WEBPORT]:
        with socket.socket() as sock: sock.bind(('127.0.0.1', port))
    stop_file.unlink(missing_ok=True)
    app = ROOT / 'app'
    for folder in ['Public', 'config']:
        shutil.copytree(SOURCE / folder, app / folder, dirs_exist_ok=True)
    mobile = '--mobile' in sys.argv or '--mobile-before' in sys.argv or '--mobile-preview' in sys.argv
    if '--mobile-before' in sys.argv:
        for relative in ['Public/app.php','Public/partials/navbar.php','Public/assets/css/service.css','Public/assets/js/app.js','Public/assets/js/filters_ui.js']:
            (app/relative).write_bytes(subprocess.check_output(['git','show','61b8593:'+relative],cwd=SOURCE))
    (app / '.env').write_text('APP_NAME=遺眷親訪地圖・本機示範\nAPP_ENV=local\nAPP_BASE_URL=/\nDB_HOST="127.0.0.1;port=43416"\nDB_NAME=visitation_preview_synthetic\nDB_USER=root\nDB_PASS=preview-synthetic-only\nAUTH_DEVICE_OTP_ENABLED=false\nROUTING_PROVIDER=none\nMAP_PROVIDER=google\n', encoding='utf-8')
    if mobile:
        # Same renderer/version as the app, cached locally. No keys, remote tiles or real data.
        for extension in ['js','css']:
            cache=ROOT/('maplibre-gl-5.12.0.'+extension)
            if not cache.exists():
                with urllib.request.urlopen('https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.'+extension,timeout=30) as response:
                    cache.write_bytes(response.read())
            shutil.copyfile(cache,app/'Public'/('qa-maplibre.'+extension))
        env=app/'.env';env.write_text(env.read_text(encoding='utf-8').replace('MAP_PROVIDER=google','MAP_PROVIDER=maplibre\nMAPTILER_STYLE_URL=/qa-map-style.json'),encoding='utf-8')
        for relative in ['Public/app.php','Public/partials/head.php']:
            file=app/relative
            file.write_text(file.read_text(encoding='utf-8').replace('https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.js','/qa-maplibre.js').replace('https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css','/qa-maplibre.css'),encoding='utf-8')
        # PHP builds the external CSS URL in app.php.
        page=app/'Public/app.php';page.write_text(page.read_text(encoding='utf-8').replace('https://unpkg.com/maplibre-gl@5.12.0/dist/maplibre-gl.css','/qa-maplibre.css').replace('<div id="map" class="app-map"></div>','<div id="map" class="app-map"></div><div style="position:absolute;bottom:100px;left:12px;z-index:2;color:#435d6d;font-size:12px;background:#ffffffdd;padding:4px">本機合成底圖・非實際地址</div>'),encoding='utf-8')
        roads=[]
        for i in range(-12,13):
            roads += [{'type':'Feature','geometry':{'type':'LineString','coordinates':[[121.70+i*.004,25.06],[121.70+i*.004,25.22]]}}, {'type':'Feature','geometry':{'type':'LineString','coordinates':[[121.66,25.14+i*.003],[121.85,25.14+i*.003]]}}]
        style={'version':8,'sources':{'streets':{'type':'geojson','data':{'type':'FeatureCollection','features':roads}}},'layers':[{'id':'background','type':'background','paint':{'background-color':'#edf0e7'}},{'id':'road-border','type':'line','source':'streets','paint':{'line-color':'#ccd5d0','line-width':8}},{'id':'roads','type':'line','source':'streets','paint':{'line-color':'#fff','line-width':5}}]}
        (app/'Public/qa-map-style.json').write_text(json.dumps(style),encoding='utf-8')
    sessions = ROOT / 'sessions'; sessions.mkdir(exist_ok=True)
    datadir = ROOT / 'mariadb-data'
    if not (datadir / 'mysql').exists():
        subprocess.run([str(MARIA / 'mariadb-install-db.exe'), '--datadir=' + str(datadir), '--password=preview-synthetic-only', '--port=43416'], check=True, creationflags=subprocess.CREATE_NO_WINDOW)
    seed = '''<?php
$pdo=new PDO('mysql:host=127.0.0.1;port=43416;charset=utf8mb4','root','preview-synthetic-only',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$actual=rtrim(str_replace('\\\\','/',strtolower($pdo->query('SELECT @@datadir')->fetchColumn())),'/');
$expected=rtrim(str_replace('\\\\','/',strtolower(EXPECTED_DATA_DIR)),'/');
if($actual!==$expected)throw new RuntimeException('Refusing non-isolated database');
$pdo->exec('CREATE DATABASE IF NOT EXISTS visitation_preview_synthetic');
$pdo->exec('USE visitation_preview_synthetic');
if (RESET_FIXTURE || !$pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn()) {
foreach(['places','users','organizations','auth_throttles','auth_events','admin_towns','organization_counties'] as $table)$pdo->exec('DROP TABLE IF EXISTS '.$table);
$pdo->exec('CREATE TABLE organizations(id INT PRIMARY KEY,name VARCHAR(100),county_code VARCHAR(20))');
$pdo->exec("INSERT INTO organizations VALUES(1,'示範服務中心','10017'),(2,'示範第二中心','10017')");
$pdo->exec('CREATE TABLE users(id INT PRIMARY KEY,name VARCHAR(100),email VARCHAR(191),phone VARCHAR(30),title VARCHAR(100),organization_id INT,role VARCHAR(20),status VARCHAR(20),password_hash VARCHAR(255),created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME,last_login_at DATETIME)');
$stmt=$pdo->prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,NOW(),NOW(),NULL)');
$hash=password_hash('Preview-only-2026!',PASSWORD_BCRYPT);
foreach([[1,'示範管理者','admin@example.invalid',1,'ADMIN','ACTIVE'],[2,'示範承辦人','user@example.invalid',1,'USER','ACTIVE'],[3,'示範停權帳戶','suspended@example.invalid',2,'USER','SUSPENDED'],[4,'測試管理者','target@example.invalid',1,'ADMIN','ACTIVE']] as $u)$stmt->execute([$u[0],$u[1],$u[2],'','承辦人',$u[3],$u[4],$u[5],$hash]);
$pdo->exec('CREATE TABLE auth_throttles(id INT PRIMARY KEY AUTO_INCREMENT,scope VARCHAR(50),action VARCHAR(50),ip VARCHAR(45),email VARCHAR(191),window_start DATETIME,window_sec INT,count INT,blocked_until DATETIME,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
$pdo->exec('CREATE TABLE auth_events(id INT PRIMARY KEY AUTO_INCREMENT,event_type VARCHAR(60),user_id INT,email VARCHAR(191),ip VARCHAR(45),ua VARCHAR(255),detail VARCHAR(255),ts DATETIME DEFAULT CURRENT_TIMESTAMP)');
$pdo->exec('CREATE TABLE admin_towns(town_code VARCHAR(20) PRIMARY KEY,town_name VARCHAR(50),county_code VARCHAR(20),county_name VARCHAR(50),is_active INT)');
$pdo->exec("INSERT INTO admin_towns VALUES('10017010','中正區','10017','基隆市',1),('10017020','七堵區','10017','基隆市',1)");
$pdo->exec('CREATE TABLE organization_counties(organization_id INT,county_code VARCHAR(20),is_active INT)');
$pdo->exec('CREATE TABLE places(id INT PRIMARY KEY AUTO_INCREMENT,serviceman_name VARCHAR(100),category VARCHAR(50),visit_target VARCHAR(100),visit_name VARCHAR(100),condolence_order_no VARCHAR(100),beneficiary_over65 VARCHAR(1),address_text VARCHAR(255),address_town_code VARCHAR(20),managed_district VARCHAR(50),managed_town_code VARCHAR(20),managed_county_code VARCHAR(20),note TEXT,lat DOUBLE,lng DOUBLE,organization_id INT,updated_by_user_id INT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,deleted_at DATETIME,deleted_by_user_id INT,deleted_note VARCHAR(255))');
$stmt=$pdo->prepare('INSERT INTO places(serviceman_name,category,visit_target,visit_name,condolence_order_no,beneficiary_over65,address_text,address_town_code,managed_district,managed_town_code,managed_county_code,note,lat,lng,organization_id,updated_by_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
foreach([["示範官兵甲","示範眷屬甲",25.14,121.76,'Y'],["示範官兵乙","示範眷屬乙",25.13,121.75,'N']] as $i=>$r)$stmt->execute([$r[0],'示範類別','親屬',$r[1],'DEMO-00'.($i+1),$r[4],'基隆市中正區示範地址（非真實資料）','10017010','中正區','10017010','10017','本機合成資料',$r[2],$r[3],1,1]);
}
echo json_encode(['isolated_datadir_verified'=>true,'synthetic_only'=>true]);
'''.replace('EXPECTED_DATA_DIR', json.dumps(str(datadir))).replace('RESET_FIXTURE', 'true' if '--reset' in sys.argv else 'false')
    if mobile:
        seed=seed.replace("echo json_encode(","""$pdo->exec('DELETE FROM places WHERE id>2');
for($i=3;$i<=24;$i++){
$stmt=$pdo->prepare('INSERT INTO places(id,serviceman_name,category,visit_target,visit_name,beneficiary_over65,address_text,address_town_code,managed_district,managed_town_code,managed_county_code,note,lat,lng,organization_id,updated_by_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
$stmt->execute([$i,'合成測試地點'.str_pad((string)$i,2,'0',STR_PAD_LEFT).($i===20?'・長姓名與長地址呈現測試':''),'示範類別','親屬','示範受訪者'.$i,$i%2?'Y':'N','基隆市中正區合成測試街道'.($i*10).'巷測試社區第'.($i*3).'號（非真實地址，僅供本機測試）','10017010','中正區','10017010','10017','本機合成資料',25.135+($i%5)*.002,121.75+floor(($i-3)/5)*.003,1,1]);
}
echo json_encode(""")
    (ROOT / 'seed.php').write_text(seed, encoding='utf-8')
    router = '''<?php
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH));
error_log('preview route: '.$path);
$pages=['/login'=>'index.php','/app'=>'app.php','/admin'=>'admin/index.php','/admin/security'=>'admin/auth_security.php','/profile'=>'profile.php','/forgot'=>'forgot.php','/register'=>'register.php','/reset'=>'reset.php','/device-verify'=>'device_verify.php'];
if(isset($pages[$path])){require __DIR__.'/Public/'.$pages[$path];return true;}
if(str_starts_with($path,'/api/')){ $file=__DIR__.'/Public'.$path.'.php'; if(is_file($file)){require $file;return true;} }
return false;
'''
    (app / 'router.php').write_text(router, encoding='utf-8')
    processes=[]
    try:
        log=open(ROOT/'db.log','w')
        db=subprocess.Popen([str(MARIA/'mariadbd.exe'),'--no-defaults','--datadir='+str(datadir),'--port=43416','--bind-address=127.0.0.1','--skip-log-bin','--log-error='+str(ROOT/'mariadb.log')],stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW);processes.append(db);wait(DBPORT,db)
        evidence=subprocess.check_output(PHPARGS+[str(ROOT/'seed.php')],encoding='utf-8')
        (ROOT/'isolation.json').write_text(evidence,encoding='utf-8')
        if not json.loads(evidence)['isolated_datadir_verified']: raise RuntimeError('Isolation not verified')
        proxy=http.server.ThreadingHTTPServer(('127.0.0.1',WEBPORT),PreviewProxy)
        threading.Thread(target=proxy.serve_forever,daemon=True).start()
        print('ISOLATED PREVIEW http://127.0.0.1:43417/login',flush=True)
        print('admin@example.invalid / Preview-only-2026! (synthetic fixture only)',flush=True)
        print('Ctrl+C stops only these preview processes. Root: '+str(ROOT),flush=True)
        if '--before' in sys.argv or '--verify' in sys.argv or '--mobile' in sys.argv or '--mobile-before' in sys.argv:
            if '--verify' in sys.argv:
                subprocess.run([sys.executable,str(SOURCE/'scripts/preview_http_checks.py')],check=True,timeout=60)
            chrome_log=open(ROOT/'chrome.log','w')
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0));debug_port=sock.getsockname()[1]
            chrome=subprocess.Popen(['C:/Program Files/Google/Chrome/Application/chrome.exe','--headless=new','--no-sandbox','--enable-unsafe-swiftshader','--disable-extensions','--no-first-run','--remote-debugging-port='+str(debug_port),'--remote-debugging-address=127.0.0.1','--user-data-dir='+str(ROOT/('chrome-'+str(time.time_ns()))),'about:blank'],stdout=chrome_log,stderr=chrome_log,creationflags=subprocess.CREATE_NO_WINDOW)
            processes.append(chrome);wait(debug_port,chrome)
            node_env=os.environ.copy();node_env['VISITATION_CDP_PORT']=str(debug_port)
            script='preview_mobile.mjs' if mobile else 'preview_browser.mjs'
            action='before' if '--before' in sys.argv or '--mobile-before' in sys.argv else 'verify'
            subprocess.run(['node',str(SOURCE/'scripts'/script),action],check=True,timeout=180,env=node_env)
        else:
            while not stop_file.exists() and all(p.poll() is None for p in processes):time.sleep(1)
    finally:
        if 'proxy' in locals():proxy.shutdown();proxy.server_close()
        for process in reversed(processes):
            if process.poll() is None:
                if 'chrome' in locals() and process is chrome:
                    process.terminate()
                else:process.terminate()
                try:process.wait(timeout=3)
                except subprocess.TimeoutExpired:process.kill()

if __name__=='__main__':main()
