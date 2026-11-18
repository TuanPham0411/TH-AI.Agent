import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('personal_bridge', pathlib.Path(__file__).resolve().parents[1] / 'tools/personal-bridge.py')
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


class PersonalBridge(unittest.TestCase):
    def test_assessment_never_runs_local_code_and_flags_desktop_dependencies(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            (root / 'main.py').write_text("import win32com.client\nopen('EXECUTED', 'w').write('bad')\n")
            result = bridge.project({'roots': {'tools': temporary}}, {'folder': '.'})
            self.assertFalse((root / 'EXECUTED').exists())
            listing = bridge.invoke({'roots': {'tools': temporary}}, 'list_folder', {'folder': '.'})
            self.assertTrue(any(row['name'] == 'main.py' for row in listing['rows']))
            self.assertTrue(listing['readOnly'])
            self.assertFalse(result['localExecutionPerformed'])
            self.assertEqual(result['portability'], 'needs_review')
            self.assertIn('win32com', result['desktopDependencies'])
            with self.assertRaises(ValueError):
                bridge.project({'roots': {'tools': temporary}}, {'folder': '.'}, bundle=True)

    def test_portable_project_transfers_by_hash_without_execution_and_changed_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as server:
            pathlib.Path(source, 'main.py').write_text('import json,sys\nprint(json.dumps({"answer":json.load(sys.stdin)["x"]*2}))\n')
            config = {'roots': {'tools': source}}
            report = bridge.project(config, {'folder': '.'})
            self.assertEqual(report['portability'], 'candidate')
            bundle = bridge.project(config, {'folder': '.'}, bundle=True)
            with patch.object(bridge, 'image_ready', return_value=False):
                staged = bridge.stage({'execution': 'server', 'serverToolsRoot': server}, bundle)
            self.assertEqual(staged['projectHash'], report['projectHash'])
            self.assertFalse(staged['verifiedRun'])
            self.assertTrue(pathlib.Path(server, staged['toolId'], 'main.py').exists())
            with self.assertRaises(ValueError):
                bridge.stage({'execution': 'server', 'serverToolsRoot': server}, {**bundle, 'projectHash': 'a'*64})

    def test_desktop_can_never_claim_unattended_and_fixed_commands_receive_json_on_stdin(self):
        import sys
        config = {'execution': 'desktop', 'unattended': True, 'actions': {'echo': {'argv': [sys.executable, '-c', 'import sys,json; print(json.dumps(json.load(sys.stdin)))'], 'unattended': True}}}
        self.assertFalse(bridge.invoke(config, 'ping', {'action': 'echo'})['unattended'])
        result = bridge.invoke(config, 'echo', {'value': 'hello; do not execute me'})
        self.assertEqual(result['result']['value'], 'hello; do not execute me')
        self.assertTrue(result['confirmed'])

    def test_paths_and_embedded_secrets_are_not_transferred(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(ValueError):
                bridge.project({'roots': {'tools': temporary}}, {'folder': '../'})
            pathlib.Path(temporary, 'main.py').write_text('token="sk-'+'a'*30+'"\n')
            with self.assertRaisesRegex(ValueError, 'tokens'):
                bridge.project({'roots': {'tools': temporary}}, {'folder': '.'})

    def test_server_sandbox_runs_portable_python_with_no_local_project_execution(self):
        config = {'execution': 'server', 'unattended': True}
        if not bridge.image_ready(config):
            self.skipTest('Preinstalled python:3.12-slim runtime not available')
        with tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as server:
            pathlib.Path(source, 'main.py').write_text('import json,sys\nprint(json.dumps({"answer":json.load(sys.stdin)["x"]*2}))\n')
            bundle = bridge.project({'roots': {'tools': source}}, {'folder': '.'}, bundle=True)
            config['serverToolsRoot'] = server
            staged = bridge.stage(config, bundle)
            result = bridge.invoke(config, 'run_python_tool', {'toolId': staged['toolId'], 'input': {'x': 21}})
            self.assertEqual(result['result']['answer'], 42)
            self.assertTrue(result['verifiedRun'])
            self.assertEqual(result['execution'], 'server')
            pathlib.Path(server, staged['toolId'], 'main.py').write_text('print("changed")')
            with self.assertRaisesRegex(ValueError, 'source changed'):
                bridge.invoke(config, 'run_python_tool', {'toolId': staged['toolId'], 'input': {'x': 21}})


if __name__ == '__main__':
    unittest.main()
