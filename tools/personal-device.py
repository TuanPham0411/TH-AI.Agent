#!/usr/bin/env python3
"""TH outbound device link: HTTPS polling, local consent, no inbound port."""
import argparse
import importlib.util
import json
import os
import pathlib
import platform
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location('th_bridge', pathlib.Path(__file__).with_name('personal-bridge.py'))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


_odbc_spec = importlib.util.spec_from_file_location('th_odbc', pathlib.Path(__file__).with_name('personal-odbc.py'))
odbc = importlib.util.module_from_spec(_odbc_spec)
_odbc_spec.loader.exec_module(odbc)
_inventory = {'at': 0, 'value': None}


def capabilities(config):
    actions = [
        {'id': 'list_folder', 'effect': 'read', 'description': 'List a folder without executing code. Input {root:"home",folder:"relative path"}.'},
        {'id': 'inspect_python', 'effect': 'read', 'description': 'Statically inspect Python without running/importing it. Input {root:"home",folder:"relative project path"}.'},
        {'id': 'export_python', 'effect': 'read', 'description': 'Export assessed source without execution. Input {root:"home",folder:"relative project path"}.'},
    ]
    for name, definition in config.get('actions', {}).items():
        actions.append({'id': name, 'effect': definition.get('effect', 'write'), 'description': definition.get('description', 'Owner-configured action.'), 'unattended': bool(definition.get('unattended'))})
    odbc_info = None
    if config.get('enableOdbc') is True:
        if time.monotonic() - _inventory['at'] > 15 or _inventory['value'] is None:
            _inventory.update(at=time.monotonic(), value=odbc.inventory())
        odbc_info = _inventory['value']
        actions.append({'id': 'odbc_inventory', 'effect': 'read', 'description': 'Read local ODBC driver/DSN names and Python bitness without opening a database.'})
        if odbc_info['available']:
            actions.append({'id': 'odbc_query', 'effect': 'read', 'description': 'Read-only parameterized query through a configured local DSN. Database credentials are injected privately by the server, never by model input.'})
    if config.get('fullControl') is True:
        actions.extend([
            {'id': 'read_file', 'effect': 'read', 'description': 'Read UTF-8 text on this computer using account permissions. Input {path:"absolute file path"}; up to 300 KB.'},
            {'id': 'write_file', 'effect': 'write', 'description': 'Write UTF-8 text on this computer. Input {path:"absolute file path",text:"content",overwrite:false}; parent must exist.'},
            {'id': 'execute', 'effect': 'write', 'description': 'Run explicit code with the paired account permissions. Input {runtime:"python|powershell|cmd",code:"actual code",cwd:"absolute existing directory",input:{...}}. Python receives JSON stdin; PowerShell/CMD receive TH_INPUT_JSON. Return JSON or text. Maximum 40 seconds. Desktop-only, never independent server automation.'},
        ])
        if platform.system() == 'Windows':
            actions.append({'id': 'office', 'effect': 'write', 'description': 'Desktop Office COM via logged-in Windows user; installed Office required. Input {app:"excel|word",operation:"read|write",path:"absolute document path",sheet:"Sheet1",range:"A1:C10",values:[[...]],text:"document text",overwrite:false}. Excel writes start at A1, supports up to 200 rows. Word reads/writes document text. Returns local path/data, not a server download.'})
    return {'platform': platform.system(), 'execution': config.get('execution', 'desktop'), 'unattended': False, 'fullControl': config.get('fullControl') is True, 'roots': list(config.get('roots', {})), 'actions': actions, 'odbc': odbc_info}


def local_path(value):
    p = pathlib.Path(value)
    if not p.is_absolute():
        raise ValueError('Use an absolute path on this computer.')
    return p


def invoke(config, action, value):
    if action in {'odbc_inventory', 'odbc_query'}:
        if config.get('enableOdbc') is not True:
            raise ValueError('ODBC access was not enabled locally. Re-run the installer with -EnableOdbc.')
        return odbc.inventory() if action == 'odbc_inventory' else odbc.query(value)
    full = config.get('fullControl') is True
    if action in {'read_file', 'write_file', 'execute', 'office'} and not full:
        raise ValueError('Full computer control was not granted in the local agent settings.')
    if action == 'read_file':
        p = local_path(value['path'])
        if p.stat().st_size > 300000:
            raise ValueError('Select a text file smaller than 300 KB.')
        return {'text': p.read_text(encoding='utf-8-sig'), 'path': str(p), 'readOnly': True}
    if action == 'write_file':
        p = local_path(value['path'])
        text = value.get('text')
        if not isinstance(text, str) or len(text.encode()) > 300000:
            raise ValueError('Provide UTF-8 text below 300 KB.')
        with p.open('w' if value.get('overwrite') is True else 'x', encoding='utf-8') as output:
            output.write(text)
        return {'path': str(p), 'bytes': p.stat().st_size, 'confirmed': True}
    if action == 'execute':
        runtime = value.get('runtime')
        if runtime not in {'python', 'powershell', 'cmd'} or not isinstance(value.get('code'), str) or len(value['code']) > 100000:
            raise ValueError('Choose Python, PowerShell or CMD with bounded explicit code.')
        if runtime != 'python' and platform.system() != 'Windows':
            raise ValueError('PowerShell/CMD require this Windows device.')
        cwd = str(local_path(value.get('cwd') or str(pathlib.Path.home())))
        with tempfile.TemporaryDirectory(prefix='th-action-') as folder:
            script = pathlib.Path(folder) / ('action.' + {'python': 'py', 'powershell': 'ps1', 'cmd': 'cmd'}[runtime])
            script.write_text(value['code'], encoding='utf-8-sig' if runtime == 'powershell' else 'utf-8')
            if runtime == 'python':
                argv = [sys.executable, str(script)]
            elif runtime == 'powershell':
                argv = [str(pathlib.Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'), '-NoProfile', '-NonInteractive', '-File', str(script)]
            else:
                argv = [str(pathlib.Path(os.environ['SystemRoot']) / 'System32/cmd.exe'), '/d', '/c', str(script)]
            # JSON values are not concatenated into commands or code.
            old = os.environ.get('TH_INPUT_JSON')
            os.environ['TH_INPUT_JSON'] = json.dumps(value.get('input', {}))
            try:
                return bridge.run_fixed(argv, value.get('input', {}), timeout=40, cwd=cwd)
            finally:
                if old is None:
                    os.environ.pop('TH_INPUT_JSON', None)
                else:
                    os.environ['TH_INPUT_JSON'] = old
    if action == 'office':
        if platform.system() != 'Windows':
            raise ValueError('Desktop Office requires Windows with Office installed.')
        powershell = str(pathlib.Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe')
        return bridge.run_fixed([powershell, '-NoProfile', '-NonInteractive', '-File', str(pathlib.Path(__file__).with_name('office-tool.ps1'))], value, timeout=40)
    return bridge.invoke(config, action, value)


def post(config, path, body):
    origin = config['server'].rstrip('/')
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise ValueError('Use an HTTPS server origin with trusted TLS.')
    req = urllib.request.Request(origin + '/api/device-link/' + path, data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + config['token'], 'Content-Type': 'application/json'}, method='POST')
    # Default trust store, no redirects carrying device credentials.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *_args):
            raise ValueError('Unexpected redirect: verify the saved server origin.')
    with urllib.request.build_opener(NoRedirect).open(req, timeout=20) as response:
        return json.load(response)


def run(config, directory):
    pending = directory / 'pending-result.json'
    seen = directory / 'claimed-tasks.txt'
    print('TH device link active. Close this window or stop its startup task to disconnect.', flush=True)
    print('Full computer control:', config.get('fullControl') is True, '| Server:', config['server'], flush=True)
    while True:
        try:
            if pending.exists():
                result = json.loads(pending.read_text())
                try:
                    post(config, 'tasks/' + result['id'] + '/result', result['body'])
                except urllib.error.HTTPError as error:
                    if error.code not in (400, 409):
                        raise
                pending.unlink()
            answer = post(config, 'poll', {'capabilities': capabilities(config)})
            task = answer.get('task')
            if not task:
                time.sleep(3)
                continue
            # Journal before dispatch: never execute a claimed task again after a crash.
            prior = set(seen.read_text().splitlines()) if seen.exists() else set()
            if task['id'] in prior:
                body = {'ok': False, 'error': 'This command was previously claimed; inspect its outcome before retrying.'}
            elif datetime.fromisoformat(task['deadline'].replace('Z', '+00:00')) <= datetime.now(timezone.utc):
                body = {'ok': False, 'error': 'Task deadline expired before execution.'}
            else:
                with seen.open('a') as journal:
                    journal.write(task['id'] + '\n')
                    journal.flush()
                    os.fsync(journal.fileno())
                try:
                    body = {'ok': True, 'output': invoke(config, task['action'], task.get('input', {}))}
                except Exception as error:
                    body = {'ok': False, 'error': str(error)[:500]}
            body['claim'] = task['claim']
            # Never return the device credential in tool output/errors.
            safe = json.loads(json.dumps({'id': task['id'], 'body': body}).replace(config['token'], '[secret removed]'))
            pending.write_text(json.dumps(safe), encoding='utf-8')
            if os.name != 'nt':
                pending.chmod(0o600)
        except urllib.error.HTTPError as error:
            if error.code == 401:
                print('Device access was revoked or token invalid. Agent stopped.', flush=True)
                return
            print('Server did not acknowledge the request; reconnecting. No command is replayed.', flush=True)
            time.sleep(5)
        except (OSError, ValueError, KeyError):
            print('Connection/configuration unavailable; reconnecting. No command is replayed.', flush=True)
            time.sleep(5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    config_path = pathlib.Path(args.config).resolve()
    run(json.loads(config_path.read_text(encoding='utf-8-sig')), config_path.parent)
