import json,pathlib,unittest
class WorkflowTest(unittest.TestCase):
 def setUp(self):self.value=json.loads(pathlib.Path(__file__).with_name('workflow.json').read_text())
 def test_workflow_starts_inactive_with_no_fake_credentials(self):
  self.assertFalse(self.value['active'])
  for node in self.value['nodes']:self.assertNotIn('credentials',node)
  self.assertFalse(next(n for n in self.value['nodes'] if n['type'].endswith('.chatTrigger'))['parameters']['public'])
 def test_graph_connects_all_agents_models_memory_and_tools(self):
  names={n['name'] for n in self.value['nodes']};self.assertEqual(len(names),len(self.value['nodes']))
  for source,ports in self.value['connections'].items():
   self.assertIn(source,names)
   for kind,outputs in ports.items():
    for edges in outputs:
     for edge in edges:self.assertIn(edge['node'],names);self.assertEqual(edge['type'],kind)
  self.assertEqual(self.value['connections']['Research Agent']['ai_tool'][0][0]['node'],'AI Agent')
  self.assertEqual(self.value['connections']['Append']['ai_tool'][0][0]['node'],'Sheet Agent')
 def test_persistent_memories_have_distinct_session_namespaces(self):
  memories=[n for n in self.value['nodes'] if n['type'].endswith('.memoryPostgresChat')]
  self.assertEqual(len(memories),3);self.assertEqual(len({n['parameters']['sessionKey'] for n in memories}),3)
if __name__=='__main__':unittest.main()
