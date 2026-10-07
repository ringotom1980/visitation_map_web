"""Real login rendering with synthetic env and a DB function that must not run."""
import pathlib,shutil,subprocess,tempfile
source=pathlib.Path(__file__).parents[2]
with tempfile.TemporaryDirectory(prefix='synthetic-login-') as td:
 site=pathlib.Path(td);runtime=site/'visitation-release/runtime';runtime.mkdir(parents=True)
 for name in ['config/app.php','config/auth.php','config/permissions.php','config/bootstrap.php','shared_paths.php','Public/index.php']:
  dest=runtime/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy(source/name,dest)
 shutil.copytree(source/'Public/partials',runtime/'Public/partials')
 bootstrap=runtime/'config/bootstrap.php';bootstrap.write_text(bootstrap.read_text().replace("load_env(hostinger_shared_path('.env'));",'load_env(hostinger_legacy_env_path());').replace("load_env($root . '/.env');",'load_env(hostinger_legacy_env_path());'))
 (runtime/'config/db.php').write_text("<?php function db() { throw new RuntimeException('SYNTHETIC_DB_FORBIDDEN'); }\n")
 old=site/'visitation_map_web';old.mkdir();(old/'.env').write_text('APP_NAME=SyntheticLogin\n')
 code="$_SERVER['REQUEST_URI']='/login'; $_SERVER['REQUEST_METHOD']='GET'; $_SERVER['HTTP_HOST']='synthetic.invalid'; require '/site/visitation-release/runtime/Public/index.php';"
 r=subprocess.run(['docker','run','--rm','--network','none','-v',str(site)+':/site:ro','php:8.3-cli','php','-d','display_errors=0','-r',code],capture_output=True)
 assert r.returncode==0,'Synthetic login failed (output suppressed)'
 assert b'id="loginForm"' in r.stdout and b'SyntheticLogin' in r.stdout
 assert b'SYNTHETIC_DB_FORBIDDEN' not in r.stdout+r.stderr
 print('Anonymous login rendered using fixed synthetic env; DB trap never invoked; network disabled.')
