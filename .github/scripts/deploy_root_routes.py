"""Update only verified document-root routes through the existing FTPS deployment.

Never fetch environment files or credentials from the server. The configured
project directory and its immediate parent are the only candidate roots.
"""
import argparse, ftplib, hashlib, io, json, os, posixpath, re, ssl, time

PREFIX = 'visitation_map_web/Public/'
RULES = {
    'accounts': f'RewriteRule ^admin/accounts(?:\\.php)?/?$ {PREFIX}admin/accounts.php [L]',
    'transfers': f'RewriteRule ^admin/transfers(?:\\.php)?/?$ {PREFIX}admin/transfers.php [L]',
}
ANCHOR = re.compile(r'^RewriteRule\s+\^admin/\?\$\s+visitation_map_web/Public/admin/index\.php\s+\[L\]\s*$', re.M)

def patch_routes(original: bytes) -> bytes:
    text=original.decode('utf-8-sig')
    if len(ANCHOR.findall(text)) != 1:
        raise ValueError('Expected exactly one known admin entry route; root routing not modified')
    missing=[]
    for name,rule in RULES.items():
        if rule in text: continue
        if re.search(r'^RewriteRule\s+\^admin/'+name+r'[^\s]*\s',text,re.M):
            raise ValueError('Conflicting route for '+name+'; root routing not modified')
        missing.append(rule)
    if not missing: return original
    newline='\r\n' if b'\r\n' in original else '\n'
    match=ANCHOR.search(text)
    # Insert before the existing admin entry; preserve every original byte.
    prefix=text[:match.start()].encode('utf-8')
    if original.startswith(b'\xef\xbb\xbf'): prefix=b'\xef\xbb\xbf'+prefix
    return prefix+newline.join(missing).encode('utf-8')+newline.encode()+original[len(prefix):]

class SessionTLS(ftplib.FTP_TLS):
    def ntransfercmd(self,cmd,rest=None):
        conn,size=ftplib.FTP.ntransfercmd(self,cmd,rest)
        if self._prot_p:
            conn=self.context.wrap_socket(conn,server_hostname=self.host,session=self.sock.session)
        return conn,size

def retrieve(ftp,path):
    stream=io.BytesIO();ftp.retrbinary('RETR '+path,stream.write)
    if stream.tell()>1_000_000: raise ValueError('Unexpected routing/source file size')
    return stream.getvalue()

def record_result(record):
    print(json.dumps(record),flush=True)
    with open('root-routing-result.json','w',encoding='utf8') as out:json.dump(record,out,indent=2)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    expected=hashlib.sha256(open('Public/admin/index.php','rb').read()).hexdigest()
    for attempt in range(3):
        ftp=None
        try:
            ftp=SessionTLS(context=ssl.create_default_context(),timeout=45)
            ftp.connect(os.environ['FTP_HOST'],21)
            ftp.login(os.environ['FTP_USERNAME'],os.environ['FTP_PASSWORD']);ftp.prot_p()
            ftp.cwd(os.environ['FTP_TARGET_DIR']);project=ftp.pwd()
            roots=list(dict.fromkeys([posixpath.dirname(project.rstrip('/')) or '/',project]))
            record_result({'project_directory':project,'candidate_document_roots':roots,'applied':False,'stage':'probe'})
            if hashlib.sha256(retrieve(ftp,'Public/admin/index.php')).hexdigest()!=expected:
                raise ValueError('Configured FTPS target does not contain this deployed project commit')
            candidates=[]
            for root in roots:
                try:
                    ftp.cwd(root)
                    actual=ftp.pwd()
                    content=retrieve(ftp,'.htaccess')
                    if not ANCHOR.search(content.decode('utf-8-sig')): continue
                    source=retrieve(ftp,PREFIX+'admin/index.php')
                    if hashlib.sha256(source).hexdigest()==expected:candidates.append((actual,content))
                except ftplib.error_perm:continue
            unique={root:content for root,content in candidates}
            if len(unique)!=1:raise ValueError('Cannot uniquely verify an accessible document-root .htaccess; no root write performed')
            root,original=next(iter(unique.items()));ftp.cwd(root);updated=patch_routes(original)
            record={'project_directory':project,'document_root':root,'root_file':posixpath.join(root,'.htaccess'),
                    'mapping':PREFIX,'before_sha256':hashlib.sha256(original).hexdigest(),'after_sha256':hashlib.sha256(updated).hexdigest(),
                    'changed':updated!=original,'applied':False}
            record_result(record)
            if args.apply and updated!=original:
                stamp=re.sub('[^0-9-]','',os.environ.get('GITHUB_RUN_ID','local')+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
                backup='.htaccess.routing-backup-'+stamp
                temporary='.htaccess.routing-tmp-'+stamp
                ftp.storbinary('STOR '+backup,io.BytesIO(original))
                if retrieve(ftp,backup)!=original:raise ValueError('Routing backup verification failed')
                ftp.storbinary('STOR '+temporary,io.BytesIO(updated))
                if retrieve(ftp,temporary)!=updated:raise ValueError('Staged routing verification failed')
                if retrieve(ftp,'.htaccess')!=original:raise ValueError('Root routing changed concurrently; no replacement performed')
                ftp.rename(temporary,'.htaccess')
            if args.apply:
                if retrieve(ftp,'.htaccess')!=updated:raise ValueError('Live root routing verification failed')
                record['applied']=True
            record_result(record)
            ftp.quit();return
        except (OSError,EOFError,ftplib.error_temp):
            if ftp:
                try:ftp.close()
                except Exception:pass
            if attempt==2:raise
            time.sleep(2)

if __name__=='__main__':main()
