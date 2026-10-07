#!/usr/bin/env python3
"""Publish generated files with runtime-only fast-forward history; never force."""
import argparse,json,os,pathlib,subprocess
BRANCH='hostinger-runtime'
def run(args,cwd=None):return subprocess.check_output(args,cwd=cwd,stderr=subprocess.STDOUT).decode().strip()
def publish(out,repo_url,source_sha):
    if (out/'.git').exists():raise ValueError('Output contains Git metadata before publication')
    run(['git','init','-q','-b',BRANCH],out)
    run(['git','config','user.name','github-actions[bot]'],out)
    run(['git','config','user.email','41898282+github-actions[bot]@users.noreply.github.com'],out)
    run(['git','remote','add','origin',repo_url],out)
    git=['git','-c',"credential.helper=!gh auth git-credential"]
    remote=run(git+['ls-remote','--heads','origin','refs/heads/'+BRANCH],out)
    if remote:
        run(git+['fetch','--no-tags','origin','refs/heads/'+BRANCH],out)
        # Artifact working tree stays generated; index/parent becomes previous runtime.
        run(['git','reset','--soft','FETCH_HEAD'],out)
    run(['git','add','-A'],out)
    changed=subprocess.run(['git','diff','--cached','--quiet'],cwd=out).returncode
    if changed==0:return {'changed':False,'commit':run(['git','rev-parse','HEAD'],out)}
    if changed!=1:raise ValueError('Unable to compare runtime tree')
    run(['git','commit','-qm','Runtime from '+source_sha],out)
    commit=run(['git','rev-parse','HEAD'],out)
    run(git+['push','origin','HEAD:refs/heads/'+BRANCH],out)
    return {'changed':True,'commit':commit}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    if os.environ.get('GITHUB_REF')!='refs/heads/main':raise SystemExit('Publish only from main')
    repo=os.environ['GITHUB_REPOSITORY'];sha=os.environ['GITHUB_SHA']
    current=run(['gh','api','repos/'+repo+'/git/ref/heads/main','--jq','.object.sha'])
    if current!=sha:raise SystemExit('Source superseded; refuse stale runtime publication')
    print(json.dumps(publish(a.output,'https://github.com/'+repo+'.git',sha),sort_keys=True))
