"""Only synthetic .env fixtures; helper never reads their bytes."""
import os,pathlib,shutil,subprocess,tempfile,unittest
class LegacyEnvTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.site=pathlib.Path(self.tmp.name);self.runtime=self.site/'visitation-release/runtime';self.runtime.mkdir(parents=True)
  shutil.copy(pathlib.Path(__file__).parents[2]/'shared_paths.php',self.runtime/'shared_paths.php')
  self.old=self.site/'visitation_map_web';self.old.mkdir();self.env=self.old/'.env';self.env.write_text('SYNTHETIC_ONLY=never-read\n')
 def tearDown(self):self.tmp.cleanup()
 def runhelper(self,base=None):
  code="require $argv[1]; try { hostinger_legacy_env_path(); echo 'OK'; } catch (RuntimeException $e) { echo $e->getMessage(); }"
  command=['docker','exec',os.environ['RUNTIME_TEST_PHP_CONTAINER'],'php']
  if base:command+=['-d','open_basedir='+str(base)]
  r=subprocess.run(command+['-r',code,str(self.runtime/'shared_paths.php')],capture_output=True)
  return r.stdout.decode()
 def test_fixed_path_success(self):self.assertEqual(self.runhelper(),'OK')
 def test_missing_env(self):self.env.unlink();self.assertEqual(self.runhelper(),'Legacy environment input unavailable')
 def test_file_symlink(self):
  target=self.site/'synthetic';self.env.rename(target);self.env.symlink_to(target);self.assertEqual(self.runhelper(),'Legacy environment input unavailable')
 def test_directory_symlink(self):
  target=self.site/'other';self.old.rename(target);self.old.symlink_to(target,target_is_directory=True);self.assertEqual(self.runhelper(),'Legacy environment input unavailable')
 def test_open_basedir(self):self.assertEqual(self.runhelper(self.runtime),'Legacy environment input unavailable')
 def test_wrong_topology(self):
  wrong=self.site/'other-release';self.runtime.parent.rename(wrong);self.runtime=wrong/'runtime';self.assertEqual(self.runhelper(),'Legacy environment input unavailable')
if __name__=='__main__':unittest.main()
