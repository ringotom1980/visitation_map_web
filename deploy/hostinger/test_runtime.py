import importlib.util,os,pathlib,subprocess,tempfile,unittest
spec=importlib.util.spec_from_file_location('runtime',pathlib.Path(__file__).with_name('runtime.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RuntimeTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.repo=self.root/'source';self.repo.mkdir()
  self.php=self.root/'php';self.php.write_text('#!/bin/sh\nexec docker exec "$RUNTIME_TEST_PHP_CONTAINER" php "$@"\n' if os.environ.get('RUNTIME_TEST_PHP_CONTAINER') else '#!/bin/sh\nexec docker run --rm -v /tmp:/tmp:ro php:8.3-cli php "$@"\n');self.php.chmod(0o755)
  subprocess.run(['git','init','-q',str(self.repo)],check=True)
  for f in m.CONFIG|{'Public/index.php','Public/register.php','Public/app.php','shared_paths.php'}:self.put(f,'<?php // synthetic fixture\n')
  self.put('Public/assets/css/app.css','body {}');self.put('.env','synthetic-only');self.put('.github/workflows/x.yml','synthetic');self.put('docs/x.sql','synthetic')
  self.commit()
 def tearDown(self):self.tmp.cleanup()
 def put(self,f,s):p=self.repo/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
 def commit(self):
  subprocess.run(['git','-C',str(self.repo),'add','.'],check=True);subprocess.run(['git','-C',str(self.repo),'-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],check=True)
 def build(self,name='out',**kw):return m.build(self.repo,'HEAD',self.root/name,kw.get('reviewed',True),kw.get('php',str(self.php)),kw.get('env_mode','shared'))
 def test_deterministic_and_exclusions(self):
  a=self.build('a');b=self.build('b');self.assertEqual(a,b);paths={x['path'] for x in a['files']};self.assertNotIn('.env',paths);self.assertNotIn('.github/workflows/x.yml',paths);self.assertIn('.htaccess',paths)
 def test_secret_detection_never_echoes_value(self):
  self.put('config/db.php',"<?php $DB_PASSWORD = 'synthetic-value-should-not-appear';");self.commit()
  with self.assertRaises(ValueError) as ctx:self.build()
  self.assertNotIn('synthetic-value-should-not-appear',str(ctx.exception));self.assertIn('config/db.php',str(ctx.exception));self.assertFalse((self.root/'out').exists())
 def test_token_detection(self):
  self.assertIn('provider-token',m.secret_types(b'ghp_' + b'x'*30))
  self.assertIn('private-key',m.secret_types(b'-----BEGIN PRIVATE KEY-----'))
  self.assertIn('literal-define-credential',m.secret_types(b"define('DB_PASSWORD', 'synthetic');"))
 def test_target_local_env_reference_rejected(self):
  self.put('config/bootstrap.php',"<?php load_env($root . '/.env');");self.commit()
  with self.assertRaises(ValueError):self.build()
 def test_legacy_contract_required(self):
  with self.assertRaises(ValueError):self.build(env_mode='legacy-fixed')
 def test_unknown_mode_rejected(self):
  with self.assertRaises(ValueError):self.build(env_mode='other')
 def test_legacy_manifest_and_transformation(self):
  self.put('shared_paths.php',pathlib.Path(__file__).parents[2].joinpath('shared_paths.php').read_text())
  self.put('config/bootstrap.php',"<?php load_env(hostinger_shared_path('.env'));\n")
  self.commit(); report=self.build(env_mode='legacy-fixed')
  self.assertEqual(report['external_required'],['../../visitation_map_web/.env'])
  self.assertFalse(report['production_ready'])
  self.assertIn('hostinger_legacy_env_path()', (self.root/'out/config/bootstrap.php').read_text())
  self.assertNotIn('.env',{f['path'] for f in report['files']})
 def test_legacy_local_source_transformed(self):
  self.put('shared_paths.php',pathlib.Path(__file__).parents[2].joinpath('shared_paths.php').read_text())
  self.put('config/bootstrap.php',"<?php load_env($root . '/.env');\n")
  self.commit();self.build(env_mode='legacy-fixed')
  self.assertIn('load_env(hostinger_legacy_env_path());',(self.root/'out/config/bootstrap.php').read_text())
  self.assertNotIn("$root . '/.env'",(self.root/'out/config/bootstrap.php').read_text())
 def test_review_required(self):
  with self.assertRaises(ValueError):self.build(reviewed=False)
 def test_linter_required(self):
  with self.assertRaises(ValueError):self.build(php='not-a-php-binary')
 def test_dependency_rejected(self):
  self.put('Public/index.php',"<?php require 'vendor/autoload.php';");self.commit()
  with self.assertRaises(ValueError):self.build()
 def test_symlink_rejected(self):
  (self.repo/'Public/assets/leak.php').symlink_to('../../.env');self.commit()
  with self.assertRaises(ValueError):self.build()
 def test_php_syntax_failure_cleans_output(self):
  self.put('Public/index.php','<?php broken syntax !!!!');self.commit()
  with self.assertRaises(ValueError):self.build()
  self.assertFalse((self.root/'out').exists())
 def test_output_must_be_new(self):
  (self.root/'out').mkdir()
  with self.assertRaises(ValueError):self.build()
if __name__=='__main__':unittest.main()
