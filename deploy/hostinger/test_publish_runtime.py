import pathlib,subprocess,tempfile,unittest
import publish_runtime as p
class PublishTests(unittest.TestCase):
 def test_runtime_only_ff_delete_and_unchanged(self):
  with tempfile.TemporaryDirectory() as td:
   root=pathlib.Path(td);remote=root/'remote.git';subprocess.run(['git','init','--bare','-q',str(remote)],check=True)
   def output(name,files):
    out=root/name;out.mkdir()
    for path,content in files.items():(out/path).write_text(content)
    return out
   first=p.publish(output('one',{'marker.txt':'v1','obsolete.txt':'synthetic'}),str(remote),'source1');self.assertTrue(first['changed'])
   parent=subprocess.check_output(['git','--git-dir='+str(remote),'rev-list','--parents','-n','1',first['commit']],text=True).split();self.assertEqual(len(parent),1)
   second=p.publish(output('two',{'marker.txt':'v2'}),str(remote),'source2');self.assertTrue(second['changed'])
   parent=subprocess.check_output(['git','--git-dir='+str(remote),'rev-list','--parents','-n','1',second['commit']],text=True).split();self.assertEqual(parent[1:], [first['commit']])
   names=subprocess.check_output(['git','--git-dir='+str(remote),'ls-tree','-r','--name-only',second['commit']],text=True).splitlines();self.assertEqual(names,['marker.txt'])
   third=p.publish(output('three',{'marker.txt':'v2'}),str(remote),'source3');self.assertFalse(third['changed']);self.assertEqual(third['commit'],second['commit'])
   with self.assertRaises(ValueError):p.publish(root/'three',str(remote),'source4')
if __name__=='__main__':unittest.main()
