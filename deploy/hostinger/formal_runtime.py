#!/usr/bin/env python3
"""Formal runtime proposal: exact review hashes, fixed env, production error mode."""
import argparse,hashlib,json,pathlib,shutil,subprocess,sys
import runtime

def build(repo,ref,out,review_file,php):
    commit=runtime.git(repo,'rev-parse',ref+'^{commit}').decode().strip()
    review=json.loads(review_file.read_text())
    required=runtime.CONFIG|{'shared_paths.php'}
    if set(review['sha256'])!=required:raise ValueError('Incomplete config review path set')
    for path,digest in review['sha256'].items():
        if hashlib.sha256(runtime.git(repo,'show',commit+':'+path)).hexdigest()!=digest:
            raise ValueError('Config review hash changed: '+path)
    report=runtime.build(repo,ref,out,True,php,'legacy-fixed')
    try:
        app=out/'config/app.php';text=app.read_bytes()
        contract=b"define('APP_ENV', env('APP_ENV', 'local'));"
        if text.count(contract)!=1:raise ValueError('Production environment contract changed')
        app.write_bytes(text.replace(contract,b"define('APP_ENV', 'production');"))
        bootstrap=out/'config/bootstrap.php';text=bootstrap.read_bytes()
        contract=b'declare(strict_types=1);'
        if text.count(contract)!=1:raise ValueError('Bootstrap contract changed')
        safety=b'''declare(strict_types=1);
// Formal runtime: errors never render configuration/physical paths to clients.
@ini_set('display_errors', '0');
@ini_set('display_startup_errors', '0');
if (!in_array(strtolower((string)ini_get('display_errors')), ['', '0', 'off', 'false'], true)) {
    throw new RuntimeException('Runtime configuration unavailable');
}'''
        bootstrap.write_bytes(text.replace(contract,safety))
        guard=b'''# Formal runtime; public application routes, metadata/config denied.
Options -Indexes
AuthMerging Off
Require all granted
RewriteEngine On
RewriteRule (^|/)\\. - [F,END]
RewriteRule !^Public(/|$) - [F,END]
'''
        (out/'.htaccess').write_bytes(guard)
        # Source login entry is restored exactly: no preview cookie/query/method wrapper.
        if (out/'Public/index.php').read_bytes()!=runtime.git(repo,'show',commit+':Public/index.php'):
            raise ValueError('Unexpected login entry transformation')
        files=[]
        for f in sorted(out.rglob('*')):
            if not f.is_file():continue
            path=f.relative_to(out).as_posix();blob=f.read_bytes()
            if f.suffix.lower() in {'.php','.js','.css','.svg'} and runtime.secret_types(blob):
                raise ValueError('Suspected literal credentials: '+path)
            if f.suffix=='.php':
                result=subprocess.run([php,'-l',str(f)],capture_output=True)
                if result.returncode:raise ValueError('PHP lint failed: '+path)
            files.append({'path':path,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()})
        report.update(files=files,routing_mode='formal',source_config_review=review['sha256'],production_ready=False,
            derived_changes=['legacy-fixed original env bootstrap','production APP_ENV constant','display_errors off bootstrap','formal Public-only HTTP rules'],preview_wrapper=False)
        return report
    except Exception:
        shutil.rmtree(out);raise
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--repo',type=pathlib.Path,default=pathlib.Path('.'));p.add_argument('--ref',default='HEAD');p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--manifest',type=pathlib.Path,required=True);p.add_argument('--review',type=pathlib.Path,required=True);p.add_argument('--php',default='php');a=p.parse_args()
    try:
        if a.manifest.resolve().is_relative_to(a.output.resolve()):raise ValueError('Manifest must be outside runtime')
        report=build(a.repo,a.ref,a.output,a.review,a.php);a.manifest.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n');print('Formal runtime validated:',len(report['files']),'files')
    except (ValueError,subprocess.CalledProcessError,KeyError) as e:print(str(e),file=sys.stderr);sys.exit(1)
