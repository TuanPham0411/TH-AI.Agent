#!/usr/bin/env python3
"""Owner-installed personal tool bridge. Fixed actions; project inspection never imports/runs project code."""
import argparse
import ast
import base64
import hashlib
import io
import json
import os
import pathlib
import platform
import re
import ssl
import subprocess
import tempfile
import threading
import zipfile
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SKIP = {'.git', '.venv', 'venv', 'node_modules', '__pycache__', '.idea'}
SECRET = re.compile(r'(^\.env|credentials|secrets?|\.pem$|\.key$|\.p12$|cookies)', re.I)
TOKEN = re.compile(r'\b(?:sk-[A-Za-z0-9_-]{15,}|AIza[A-Za-z0-9_-]{20,}|EAA[A-Za-z0-9]{30,})\b')
DESKTOP = {'win32com', 'pythoncom', 'winreg', 'pyautogui', 'pywinauto', 'tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'wmi', 'clr'}
HARDWARE = {'serial', 'RPi', 'gpiozero', 'usb', 'board', 'bluetooth', 'sounddevice', 'cv2'}
EXTENSIONS = {'.py', '.txt', '.md', '.toml', '.json', '.yaml', '.yml', '.ini', '.cfg'}


def within(root, relative):
    root = pathlib.Path(root).resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise ValueError('The requested path is outside the configured root.')
    return path


def project(config, request, bundle=False):
    root = config.get('roots', {}).get(request.get('root', 'tools'))
    if not root:
        raise ValueError('Configure an allowed tool root first.')
    folder = within(root, request.get('folder', '.'))
    if not folder.is_dir():
        raise ValueError('The tool folder does not exist.')
    files, imports, warnings, payload = [], set(), [], {}
    candidates = []
    for directory, names, filenames in os.walk(folder, followlinks=False):
        names[:] = [name for name in names if name not in SKIP and not pathlib.Path(directory, name).is_symlink()]
        for name in filenames:
            candidates.append(pathlib.Path(directory, name))
            if len(candidates) > 2000:
                raise ValueError('Narrow the project folder before assessment.')
    preview_remaining = 40000
    for path in sorted(candidates):
        relative = path.relative_to(folder)
        if any(part in SKIP for part in relative.parts) or path.is_symlink() or not path.is_file():
            continue
        if not path.resolve().is_relative_to(folder) or SECRET.search(path.name) or path.name.startswith('.th-'):
            warnings.append('Excluded a secret/configuration file: ' + relative.as_posix())
            continue
        if path.suffix.lower() not in EXTENSIONS:
            continue
        data = path.read_bytes()
        if len(data) > 100000 or sum(len(v) for v in payload.values()) + len(data) > 500000 or len(files) >= 100:
            raise ValueError('Narrow the project: at most 100 text files and 500 KB source are supported.')
        text = data.decode('utf-8-sig')
        if TOKEN.search(text) or re.search(r'''(?i)(?:password|passwd|api_key|client_secret)\s*=\s*['"][^'"]+['"]''', text):
            raise ValueError('Move embedded access tokens into server-side secrets before transferring this project.')
        record = {'path': relative.as_posix(), 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        if path.suffix.lower() == '.py':
            tree = ast.parse(text, filename=relative.as_posix())
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.update(n.name.split('.')[0] for n in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
                    imports.add(node.module.split('.')[0])
            record['sourcePreview'] = text[:min(3000, preview_remaining)]
            preview_remaining -= len(record['sourcePreview'])
            if re.search(r'[A-Za-z]:[\\/]|\\\\[A-Za-z]|\.exe\b|os\.startfile|subprocess\.|os\.system|eval\(|exec\(', text):
                warnings.append('Platform paths, executables or dynamic execution need review: ' + relative.as_posix())
        payload[relative.as_posix()] = data
        files.append(record)
    modules = {pathlib.PurePosixPath(f['path']).parts[0].removesuffix('.py') for f in files}
    external = sorted(imports - set(getattr(__import__('sys'), 'stdlib_module_names', ())) - modules)
    desktop, hardware = sorted(imports & DESKTOP), sorted(imports & HARDWARE)
    if desktop:
        warnings.append('Desktop/Windows application dependency: ' + ', '.join(desktop))
    if hardware:
        warnings.append('Physical device dependency: ' + ', '.join(hardware))
    manifest = [{k: v for k, v in f.items() if k != 'sourcePreview'} for f in files]
    digest = hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    entrypoint = 'main.py' if 'main.py' in payload else next((f['path'] for f in files if f['path'].endswith('.py')), None)
    if not entrypoint:
        raise ValueError('No Python entrypoint found.')
    result = {'root': request.get('root', 'tools'), 'folder': request.get('folder', '.'), 'projectHash': digest, 'files': files, 'imports': sorted(imports), 'dependencies': external, 'warnings': warnings, 'desktopDependencies': desktop, 'hardwareDependencies': hardware, 'entrypoint': entrypoint, 'portability': 'needs_review' if warnings else 'candidate', 'localExecutionPerformed': False, 'note': 'Static assessment only. Dependencies and real behavior must be verified in the server sandbox.'}
    if bundle:
        if warnings:
            raise ValueError('Resolve the portability warnings before packaging for unattended use.')
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, data in payload.items():
                archive.writestr(name, data)
        result = {'archive': base64.b64encode(buffer.getvalue()).decode(), 'manifest': manifest, 'projectHash': digest, 'entrypoint': request.get('entrypoint') or entrypoint}
    return result


def image_ready(config):
    try:
        return subprocess.run(['docker', 'image', 'inspect', config.get('pythonImage', 'python:3.12-slim')], capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def stage(config, request):
    if config.get('execution') != 'server':
        raise ValueError('Stage Python projects on a server bridge, not on the laptop.')
    project_hash = request.get('projectHash', '')
    if not re.fullmatch(r'[a-f0-9]{64}', project_hash):
        raise ValueError('A verified project hash is required.')
    content = base64.b64decode(request['archive'], validate=True)
    if len(content) > 500000:
        raise ValueError('Project archive too large.')
    root = pathlib.Path(config['serverToolsRoot']).resolve()
    root.mkdir(parents=True, exist_ok=True)
    tool_id = hashlib.sha256((project_hash+':'+request['entrypoint']).encode()).hexdigest()
    target = root / tool_id
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if len(archive.infolist()) > 100 or sum(f.file_size for f in archive.infolist()) > 500000:
            raise ValueError('Project expansion limit exceeded.')
        manifest = []
        for member in archive.infolist():
            path = pathlib.PurePosixPath(member.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in member.filename or (member.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe archive path or symlink.')
            data = archive.read(member)
            if path.suffix.lower() == '.py':
                ast.parse(data.decode('utf-8-sig'), filename=member.filename)
            manifest.append({'path': member.filename, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        actual = hashlib.sha256(json.dumps(sorted(manifest, key=lambda f: f['path']), sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        if actual != project_hash or not any(f['path'] == request['entrypoint'] for f in manifest):
            raise ValueError('The project changed since assessment or the entrypoint is invalid.')
        if not target.exists():
            temporary = pathlib.Path(tempfile.mkdtemp(prefix='.stage-', dir=root))
            for member in archive.infolist():
                path = within(temporary, member.filename)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(archive.read(member))
                path.chmod(0o644)
            for path in temporary.rglob('*'):
                if path.is_dir():
                    path.chmod(0o755)
            (temporary / '.th-manifest.json').write_text(json.dumps({'projectHash': project_hash, 'entrypoint': request['entrypoint'], 'files': manifest}))
            temporary.chmod(0o755)
            temporary.rename(target)
    return {'toolId': tool_id, 'projectHash': project_hash, 'execution': 'server', 'entrypoint': request['entrypoint'], 'staged': True, 'runtimeImageReady': image_ready(config), 'verifiedRun': False, 'note': 'Transferred without running the project locally. Run in the server sandbox before enabling automation.'}


def invoke(config, action, value):
    if action == 'ping':
        capability = config.get('actions', {}).get(value.get('action'), {})
        unattended = config.get('execution') == 'server' and config.get('unattended') is True and capability.get('unattended', value.get('action') in {'inspect_python', 'export_python', 'stage_python', 'run_python_tool'}) is True and not capability.get('requiresDesktop')
        return {'execution': config.get('execution', 'desktop'), 'unattended': unattended, 'platform': platform.system(), 'pythonImageReady': image_ready(config) if value.get('action') == 'run_python_tool' else None}
    if action == 'list_folder':
        root = config.get('roots', {}).get(value.get('root', 'tools'))
        if not root:
            raise ValueError('Choose a configured filesystem root.')
        folder = within(root, value.get('folder', '.'))
        entries = []
        for path in sorted(folder.iterdir()):
            if path.is_symlink() or SECRET.search(path.name):
                continue
            entries.append({'name': path.name, 'path': path.relative_to(pathlib.Path(root).resolve()).as_posix(), 'kind': 'folder' if path.is_dir() else 'file', 'size': path.stat().st_size if path.is_file() else None})
            if len(entries) >= 200:
                break
        return {'root': value.get('root', 'tools'), 'folder': value.get('folder', '.'), 'rows': entries, 'rowCount': len(entries), 'limit': 200, 'readOnly': True}
    if action in {'inspect_python', 'export_python'}:
        return project(config, value, bundle=action == 'export_python')
    if action == 'stage_python':
        return stage(config, value)
    if action == 'run_python_tool':
        if config.get('execution') != 'server' or not image_ready(config):
            raise ValueError('A configured server bridge with a preinstalled Python runtime image is required.')
        tool_id = value.get('toolId', '')
        if not re.fullmatch(r'[a-f0-9]{64}', tool_id):
            raise ValueError('Select a staged tool ID.')
        project_root = within(config['serverToolsRoot'], tool_id)
        manifest = json.loads((project_root / '.th-manifest.json').read_text())
        entrypoint = manifest['entrypoint']
        if hashlib.sha256((manifest['projectHash']+':'+entrypoint).encode()).hexdigest() != tool_id:
            raise ValueError('The registered tool version was modified.')
        actual = []
        for path in sorted(project_root.rglob('*')):
            if path.is_file() and path.name != '.th-manifest.json':
                if path.is_symlink():
                    raise ValueError('Symlinks are not permitted in a staged tool.')
                data = path.read_bytes()
                actual.append({'path': path.relative_to(project_root).as_posix(), 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        if hashlib.sha256(json.dumps(actual, sort_keys=True, separators=(',', ':')).encode()).hexdigest() != manifest['projectHash']:
            raise ValueError('The staged source changed. Assess and stage a new version before running it.')
        container_name = 'th-tool-' + uuid.uuid4().hex
        argv = ['docker', 'run', '-i', '--rm', '--pull', 'never', '--name', container_name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '65534:65534', '--memory', '128m', '--cpus', '0.5', '--pids-limit', '32', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--mount', 'type=bind,src='+str(project_root)+',dst=/tool,readonly', '-w', '/tool', config.get('pythonImage', 'python:3.12-slim'), 'python', entrypoint]
        try:
            return run_fixed(argv, value.get('input', {}), timeout=60, extra={'toolId': tool_id, 'execution': 'server', 'verifiedRun': True})
        finally:
            subprocess.run(['docker', 'rm', '-f', container_name], capture_output=True, timeout=15)
    definition = config.get('actions', {}).get(action)
    if not definition or not isinstance(definition.get('argv'), list) or not definition['argv']:
        raise ValueError('This action is not in the owner-approved action list.')
    if not pathlib.Path(definition['argv'][0]).is_absolute():
        raise ValueError('Use an absolute executable path in the owner configuration.')
    return run_fixed(definition['argv'], value, timeout=min(60, definition.get('timeoutSeconds', 30)), cwd=definition.get('cwd'))


def run_fixed(argv, value, timeout=30, cwd=None, extra=None):
    # Tool JSON travels on stdin, never interpolated into a shell command.
    process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd, shell=False)
    buffers = [bytearray(), bytearray()]
    def collect(pipe, destination):
        while chunk := pipe.read(4096):
            if sum(map(len, buffers)) + len(chunk) > 1000000:
                process.kill()
                return
            destination.extend(chunk)
    threads = [threading.Thread(target=collect, args=(pipe, dest), daemon=True) for pipe, dest in zip((process.stdout, process.stderr), buffers)]
    for thread in threads:
        thread.start()
    try:
        process.stdin.write(json.dumps(value).encode())
        process.stdin.close()
        process.wait(timeout=timeout)
    except (subprocess.TimeoutExpired, BrokenPipeError):
        process.kill()
        process.wait()
        raise ValueError('The tool exceeded its deadline or rejected input.')
    for thread in threads:
        thread.join(timeout=3)
    process.stdout.close()
    process.stderr.close()
    if process.returncode or sum(map(len, buffers)) >= 1000000:
        raise ValueError('The approved tool failed or exceeded the output limit. Inspect its local logs/configuration.')
    text = buffers[0].decode('utf-8')
    try:
        output = json.loads(text)
    except json.JSONDecodeError:
        output = {'text': text}
    return {**(extra or {}), 'result': output, 'confirmed': True}


def serve(config):
    token = os.environ.get('TH_COMPANY_BRIDGE_TOKEN', '')
    if len(token) < 32:
        raise ValueError('Set a private bridge token of at least 32 characters.')
    gate = threading.BoundedSemaphore(2)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass
        def do_POST(self):
            import hmac
            if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer '+token):
                self.send_error(401)
                return
            match = re.fullmatch(r'/actions/([a-z][a-z0-9_-]{0,59})/invoke', self.path)
            length = int(self.headers.get('Content-Length', '0'))
            if not match or not 0 < length <= 1000000 or not gate.acquire(blocking=False):
                self.send_error(400)
                return
            try:
                request = json.loads(self.rfile.read(length))
                output = invoke(config, match[1], request.get('input', {}))
                payload, status = {'ok': True, 'output': output}, 200
            except Exception as error:
                payload, status = {'ok': False, 'error': str(error)[:500]}, 400
            finally:
                gate.release()
            sensitive = [v for k, v in os.environ.items() if len(v) >= 8 and re.search(r'token|secret|password|private_key', k, re.I)]
            def redact(value):
                if isinstance(value, str):
                    for private in sensitive:
                        value = value.replace(private, '[secret removed]')
                    return value
                if isinstance(value, dict):
                    return {k: redact(v) for k, v in value.items()}
                if isinstance(value, list):
                    return [redact(v) for v in value]
                return value
            data = json.dumps(redact(payload), ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
    server = ThreadingHTTPServer((config.get('host', '127.0.0.1'), config.get('port', 8766)), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(os.environ['TH_COMPANY_BRIDGE_CERT'], os.environ['TH_COMPANY_BRIDGE_KEY'])
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    serve(json.loads(pathlib.Path(args.config).read_text()))
