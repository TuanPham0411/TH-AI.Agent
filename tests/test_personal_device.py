import importlib.util
import json
import pathlib
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('personal_device', pathlib.Path(__file__).resolve().parents[1] / 'tools/personal-device.py')
device = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(device)


class PersonalDevice(unittest.TestCase):
    def test_explicit_local_full_control_required_for_execution_and_files(self):
        with self.assertRaisesRegex(ValueError, 'not granted'):
            device.invoke({'fullControl': False}, 'execute', {'runtime': 'python', 'code': 'print(1)'})
        caps = device.capabilities({'fullControl': False, 'roots': {'home': '.'}})
        self.assertFalse(any(a['id'] == 'execute' for a in caps['actions']))
        self.assertFalse(caps['unattended'])

    def test_python_execution_uses_actual_local_account_and_json_input(self):
        with tempfile.TemporaryDirectory() as directory:
            output = device.invoke({'fullControl': True}, 'execute', {'runtime': 'python', 'cwd': directory, 'input': {'x': 7, 'text': 'a; do not execute'}, 'code': 'import json,sys\nx=json.load(sys.stdin)\nprint(json.dumps({"answer":x["x"]*3,"text":x["text"]}))'})
            self.assertEqual(output['result']['answer'], 21)
            self.assertEqual(output['result']['text'], 'a; do not execute')

    def test_file_writes_require_explicit_overwrite_and_return_actual_content(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(pathlib.Path(directory) / 'report.txt')
            config = {'fullControl': True}
            device.invoke(config, 'write_file', {'path': path, 'text': 'Kết quả thật'})
            self.assertEqual(device.invoke(config, 'read_file', {'path': path})['text'], 'Kết quả thật')
            with self.assertRaises(FileExistsError):
                device.invoke(config, 'write_file', {'path': path, 'text': 'replace'})
            device.invoke(config, 'write_file', {'path': path, 'text': 'updated', 'overwrite': True})
            self.assertEqual(pathlib.Path(path).read_text(), 'updated')

    def test_inspection_through_device_link_does_not_execute_project(self):
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / 'main.py'
            marker = pathlib.Path(directory) / 'BAD'
            source.write_text("open('BAD','w').write('not allowed')")
            result = device.invoke({'roots': {'home': directory}}, 'inspect_python', {'root': 'home', 'folder': '.'})
            self.assertFalse(marker.exists())
            self.assertFalse(result['localExecutionPerformed'])

if __name__ == '__main__':
    unittest.main()
