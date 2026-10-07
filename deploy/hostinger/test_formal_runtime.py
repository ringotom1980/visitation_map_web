import hashlib,importlib.util,json,os,pathlib,subprocess,sys,tempfile,unittest
sys.path.insert(0,str(pathlib.Path(__file__).parent));import formal_runtime as formal
class FormalRuntimeTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.repo=self.root/'repo';self.repo.mkdir();subprocess.run(['git','init','-q',str(self.repo)],check=True)
  source=pathlib.Path(__file__).parents[2]
  for name in formal.runtime.CONFIG|{'shared_paths.php'}:
   dest=self.repo/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes((source/name).read_bytes())
  for name in ['Public/index.php','Public/register.php','Public/app.php']:
   dest=self.repo/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text('<?php // synthetic page\n')
  self.php=self.root/'php';self.php.write_text('#!/bin/sh\nexec docker exec "$RUNTIME_TEST_PHP_CONTAINER" php "$@"\n');self.php.chmod(0o755);self.commit_review()
 def tearDown(self):self.tmp.cleanup()
 def commit_review(self):
  subprocess.run(['git','-C',str(self.repo),'add','.'],check=True);subprocess.run(['git','-C',str(self.repo),'-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],check=True)
  review={'sha256':{name:hashlib.sha256((self.repo/name).read_bytes()).hexdigest() for name in formal.runtime.CONFIG|{'shared_paths.php'}}};self.review=self.root/'review.json';self.review.write_text(json.dumps(review))
 def build(self):return formal.build(self.repo,'HEAD',self.root/'out',self.review,str(self.php))
 def test_production_and_no_preview(self):
  report=self.build();out=self.root/'out'
  self.assertIn("define('APP_ENV', 'production');",(out/'config/app.php').read_text());self.assertIn("ini_set('display_errors', '0')",(out/'config/bootstrap.php').read_text())
  self.assertEqual((out/'Public/index.php').read_bytes(),(self.repo/'Public/index.php').read_bytes());self.assertNotIn('SetEnvIf',(out/'.htaccess').read_text());self.assertFalse(report['preview_wrapper']);self.assertFalse(report['production_ready']);self.assertFalse((out/'.env').exists())
 def test_changed_config_rejected_before_output(self):
  (self.repo/'config/app.php').write_text('<?php // changed\n');subprocess.run(['git','-C',str(self.repo),'add','.'],check=True);subprocess.run(['git','-C',str(self.repo),'-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-qm','change'],check=True)
  with self.assertRaises(ValueError):self.build()
  self.assertFalse((self.root/'out').exists())
 def test_wrong_production_contract_cleans_output(self):
  f=self.repo/'config/app.php';f.write_text(f.read_text().replace("define('APP_ENV', env('APP_ENV', 'local'));","define('APP_ENV', 'different');"));self.commit_review()
  with self.assertRaises(ValueError):self.build()
  self.assertFalse((self.root/'out').exists())
if __name__=='__main__':unittest.main()
