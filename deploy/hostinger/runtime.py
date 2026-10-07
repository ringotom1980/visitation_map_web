#!/usr/bin/env python3
"""Build a fresh runtime tree from committed blobs; never run application PHP."""
import argparse, hashlib, json, pathlib, re, shutil, subprocess, sys
CONFIG = {'config/app.php','config/auth.php','config/bootstrap.php','config/db.php','config/permissions.php'}
EXTENSIONS = {'.php','.js','.css','.png','.jpg','.jpeg','.svg','.ico','.webp','.woff','.woff2','.ttf'}
def git(repo,*args):
    return subprocess.check_output(['git','-C',str(repo),*args])
def allowed(path):
    p=pathlib.PurePosixPath(path)
    forbidden={'.git','.github','vendor','node_modules','uploads','storage','tests','docs','tools'}
    return not any(x.startswith('.') or x in forbidden for x in p.parts) and ((path.startswith('Public/') and p.suffix.lower() in EXTENSIONS) or path in CONFIG or path=='shared_paths.php')

def secret_types(blob):
    """Conservative heuristic; findings contain types only, never matched values."""
    text=blob.decode('utf-8','replace')
    findings=set()
    patterns={
        'private-key': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
        'provider-token': r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{20,})',
        'literal-define-credential': r'''(?i)define\(\s*["'][^"']*(?:password|passwd|secret|token|api_key|db_pass)[^"']*["']\s*,\s*["'][^"'\n]+["']''',
        'credential-url': r'(?i)(?:mysql|postgres(?:ql)?|https?)://[^\s/]+:[^\s/@]+@',
        'literal-credential': r"(?i)(?:[\"']?\b(?:[A-Z_]*(?:password|passwd|secret|token|api_key|apikey|db_pass)[A-Z_]*)\b[\"']?\s*(?:=>|=|:)\s*[\"'])([^\"'\n]+)[\"']",
    }
    for kind,pattern in patterns.items():
        if re.search(pattern,text):findings.add(kind)
    return sorted(findings)

def build(repo,ref,out,reviewed,php,env_mode="shared"):
    if env_mode not in {'shared','legacy-fixed'}: raise ValueError('Unknown environment mode')
    if not reviewed: raise ValueError('Preflight: config paths require secret-free source review; no config contents printed.')
    if not shutil.which(php): raise ValueError('Preflight: PHP lint executable missing.')
    if out.exists(): raise ValueError('Output must be a new empty path.')
    commit=git(repo,'rev-parse',ref+'^{commit}').decode().strip()
    entries=[]
    for entry in git(repo,'ls-tree','-rz',commit).split(b'\0'):
        if not entry: continue
        metadata,raw=entry.split(b'\t',1); mode,kind,oid=metadata.decode().split(); path=raw.decode()
        if allowed(path):
            if mode!='100644' or kind!='blob': raise ValueError('Preflight: non-regular runtime file '+path)
            entries.append((path,oid))
    names={x[0] for x in entries}
    required=CONFIG|{'Public/index.php','Public/register.php','Public/app.php','shared_paths.php'}
    if required-names: raise ValueError('Preflight: missing runtime paths '+str(sorted(required-names)))
    bootstrap=git(repo,'show',commit+':config/bootstrap.php')
    if b"load_env($root . '/.env')" in bootstrap and env_mode != 'legacy-fixed':
        raise ValueError('Preflight: target-local env reference unsafe under replaceable auto-deploy')
    shared_call = b"load_env(hostinger_shared_path('.env'));"
    local_call = b"load_env($root . '/.env');"
    replacement = shared_call if shared_call in bootstrap else local_call
    if env_mode == 'legacy-fixed':
        helper = git(repo,'show',commit+':shared_paths.php')
        if bootstrap.count(shared_call) + bootstrap.count(local_call) != 1 or b'function hostinger_legacy_env_path(): string' not in helper:
            raise ValueError('Preflight: fixed legacy helper/bootstrap contract missing')
    # Scan every selected text blob before writing any output. Never print matches.
    findings=[]
    for path,oid in entries:
        if pathlib.PurePosixPath(path).suffix.lower() in {'.php','.js','.css','.svg'}:
            kinds=secret_types(git(repo,'cat-file','blob',oid))
            if kinds: findings.append({'path':path,'types':kinds})
    if findings: raise ValueError('Preflight: suspected secrets '+json.dumps(findings,sort_keys=True))
    # Refuse new dependency use; vendor must never be silently omitted.
    for path,oid in entries:
        if path.endswith('.php'):
            blob=git(repo,'cat-file','blob',oid)
            if b'autoload.php' in blob or b'TCPDF' in blob or b'tcpdf.php' in blob:
                raise ValueError('Preflight: unresolved external dependency in '+path)
    out.mkdir(parents=True)
    try:
        manifest=[]
        for path,oid in sorted(entries):
            blob=git(repo,'cat-file','blob',oid)
            if env_mode == 'legacy-fixed' and path == 'config/bootstrap.php':
                blob=blob.replace(replacement,b'load_env(hostinger_legacy_env_path());')
            dest=out/path; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(blob)
            if path.endswith('.php'):
                result=subprocess.run([php,'-l',str(dest)],capture_output=True)
                if result.returncode: raise ValueError('PHP lint failed: '+path) # never echo source/error snippets
            manifest.append({'path':path,'sha256':hashlib.sha256(blob).hexdigest()})
        guard=b'Options -Indexes\nRewriteEngine On\nRewriteRule (^|/)(\\.git|\\.github|\\.env[^/]*)(/|$) - [F,L,NC]\nRewriteRule ^config(/|$) - [F,L,NC]\nRewriteRule ^shared_paths\\.php$ - [F,L,NC]\n'
        (out/'.htaccess').write_bytes(guard)
        manifest.append({'path':'.htaccess','sha256':hashlib.sha256(guard).hexdigest()})
        # Audit report stays outside published tree.
        return {'source_commit':commit,'files':sorted(manifest,key=lambda x:x['path']),'env_mode':env_mode,'external_required':['../../visitation_map_web/.env' if env_mode=='legacy-fixed' else '../shared/.env'],'production_ready':False,'host_web_open_basedir_verified':False}
    except Exception:
        shutil.rmtree(out); raise
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--repo',type=pathlib.Path,default=pathlib.Path('.'));p.add_argument('--ref',default='HEAD');p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--manifest',type=pathlib.Path,required=True);p.add_argument('--php',default='php');p.add_argument('--config-reviewed',action='store_true');p.add_argument('--env-mode',choices=['shared','legacy-fixed'],default='shared');a=p.parse_args()
    try:
        if a.manifest.resolve().is_relative_to(a.output.resolve()): raise ValueError('Manifest must be outside runtime output.')
        report=build(a.repo,a.ref,a.output,a.config_reviewed,a.php,a.env_mode);a.manifest.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n'); print('Runtime verified:',len(report['files']),'files')
    except (ValueError,subprocess.CalledProcessError) as e: print(str(e),file=sys.stderr);sys.exit(1)
