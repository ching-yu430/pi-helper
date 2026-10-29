#!/usr/bin/env python3
"""One approved classroom install/update. Standard library; no remote command queue."""
import argparse
import base64
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

SOURCES = {'device': 'device-agent/pi_reporter.py', 'course': 'courseware/pi_course.py', 'camera': 'courseware/camera_app.py'}
ORIGIN = 'https://raw.githubusercontent.com/ching-yu430/pi-helper/main/tooling/releases/'
ERRORS = {'TOOL_EXPIRED': '授權已到期，請回網頁請助教重新核准。', 'TOOL_DENIED': '安裝授權不正確或已取消。',
          'TOOL_HOST_MISMATCH': '這台樹莓派不是指派的組別，尚未安裝。',
          'TOOL_REBIND_REQUIRED': '現有配對與本機設定不同，請助教確認是否需要重新綁定。',
          'TOOL_ALREADY_CLAIMED': '這次安裝已由另一台設備領取，請找助教。',
          'TOOL_NOT_VERIFIED': '尚未收到兩項實際回報，請稍後重試。'}


def atomic_json(path, value):
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def validate_ticket(value):
    if not isinstance(value, dict) or set(value) != {'url', 'key', 'job_id', 'request_secret', 'expected_hostname'}:
        raise ValueError('安裝指令格式不正確，請回網頁重新複製。')
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', str(value['url'])):
        raise ValueError('伺服器位址不正確。')
    if not str(value['key']).startswith('sb_publishable_') or any(c in value['key'] for c in '\r\n'):
        raise ValueError('只能使用公開連線金鑰。')
    if not isinstance(value['job_id'],str) or not re.fullmatch(r'[a-f0-9-]{36}',value['job_id']) or str(uuid.UUID(value['job_id'])) != value['job_id'] or not re.fullmatch('[a-f0-9]{64}', value['request_secret']):
        raise ValueError('授權資料不正確。')
    if not re.fullmatch(r'pi5-(?:0[1-9]|[1-9][0-9])', value['expected_hostname']):
        raise ValueError('組別不正確。')
    return value


def rpc(ticket, name, args):
    request = urllib.request.Request(ticket['url'] + '/rest/v1/rpc/' + name, data=json.dumps(args).encode(),
                                     headers={'apikey': ticket['key'], 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            code = json.loads(error.read(2048)).get('message', '')
        except (ValueError, OSError):
            code = ''
        problem = RuntimeError(ERRORS.get(code, '無法完成安裝回報，請檢查網路或找助教。'))
        problem.code = code
        raise problem from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise RuntimeError('網路連線失敗。請保留網頁，稍後重試同一行安裝指令。') from None


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fetch_sources(manifest, fetch=None, version='1.0.0'):
    if not isinstance(version,str) or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',version):
        raise ValueError('工具版本格式不正確。')
    if not isinstance(manifest, dict) or set(manifest) != set(SOURCES):
        raise ValueError('課堂工具版本不完整。')
    result = {}
    for name, path in SOURCES.items():
        checksum = manifest[name]
        if not isinstance(checksum, str) or not re.fullmatch('[a-f0-9]{64}', checksum):
            raise ValueError('版本校驗碼不正確。')
        if fetch:
            data = fetch(path)
        else:
            with urllib.request.urlopen(ORIGIN + version + '/' + name + '.py', timeout=30) as response:
                data = response.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != checksum:
            raise ValueError('工具版本與指派內容不同，尚未更新檔案。請助教指派最新版本。')
        result[name] = data
    return result


def privileged(action):
    if os.geteuid() != 0:
        raise ValueError('需要樹莓派的 sudo 權限。')
    if action == 'read-device':
        path = Path('/etc/pi-helper-device.json')
        print(path.read_text() if path.exists() else '{}')
        return
    data = json.load(sys.stdin)
    source = Path(data['source'])
    if hashlib.sha256(source.read_bytes()).hexdigest() != data['sha256']:
        raise ValueError('設備工具校驗失敗。')
    load_module(source, 'device_installer').install(config=data['config'], report_first=False)


def install(ticket, home=None):
    home = Path.home() if home is None else Path(home)
    if os.geteuid() == 0:
        raise ValueError('請用 user 執行安裝指令，不要在整行前加 sudo。')
    if socket.gethostname().split('.')[0] != ticket['expected_hostname']:
        raise ValueError('這台不是 ' + ticket['expected_hostname'] + '，尚未領取或安裝。')
    if subprocess.run(['systemctl', '--version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        raise ValueError('需要 Raspberry Pi OS 的 systemd。')
    directory = home / '.config/pi-helper-install'
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    fd = os.open(directory / 'install.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('已有安裝正在執行，請等待完成。') from None
        state_path = directory / (ticket['job_id'] + '.json')
        state = json.loads(state_path.read_text()) if state_path.exists() else {'claim_secret': os.urandom(32).hex()}
        atomic_json(state_path, state)
        claim_secret = state['claim_secret']
        print('確認本組與授權。若詢問密碼，輸入樹莓派密碼，不是後台密碼。', flush=True)
        subprocess.run(['sudo', '-v'], check=True)
        script = str(Path(__file__).resolve())
        existing = subprocess.run(['sudo', '/usr/bin/python3', script, '--privileged', 'read-device'], check=True, capture_output=True, text=True)
        device = json.loads(existing.stdout)
        course_path = home / '.config/pi-helper-course/config.json'
        course = json.loads(course_path.read_text()) if course_path.exists() else {}
        # Never send an old credential to a different configured server.
        if device and device.get('url') != ticket['url'] or course and course.get('url') != ticket['url']:
            raise ValueError('本機已有其他課堂設定，請助教確認；尚未變更。')
        job = rpc(ticket, 'pi_helper_tool_claim', dict(p_job_id=ticket['job_id'], p_request_secret=ticket['request_secret'],
                  p_claim_secret=claim_secret, p_hostname=ticket['expected_hostname'],
                  p_device_token=device.get('device_token'), p_course_token=course.get('course_token')))
        if job.get('completed'):
            state_path.unlink(missing_ok=True)
            print('這次安裝已完成，請回網頁繼續上課。')
            return
        try:
            files = fetch_sources(job['files'], version=job['version'])
            with tempfile.TemporaryDirectory(prefix='pi-helper-tools-') as temporary:
                stage = Path(temporary)
                for name, data in files.items():
                    (stage / (name + '.py')).write_bytes(data)
                target = home / '.local/share/pi-helper-course'
                target.mkdir(parents=True, mode=0o755, exist_ok=True)
                for name, filename in [('course', 'pi_course.py'), ('camera', 'camera_app.py')]:
                    temporary_path = target / (filename + '.' + uuid.uuid4().hex)
                    temporary_path.write_bytes(files[name])
                    temporary_path.chmod(0o644)
                    os.replace(temporary_path, target / filename)
                shared = dict(url=ticket['url'], key=ticket['key'], expected_hostname=ticket['expected_hostname'])
                load_module(target / 'pi_course.py', 'course_installer').setup(home=home, config={**shared, 'course_token': job['course_token']})
                payload = dict(config={**shared, 'device_token': job['device_token']}, source=str(stage / 'device.py'), sha256=job['files']['device'])
                subprocess.run(['sudo', '/usr/bin/python3', script, '--privileged', 'install-device'], input=json.dumps(payload), text=True, check=True)
            subprocess.run(['/usr/bin/python3', str(home / 'pi-course'), 'location'], check=True)
            for attempt in range(8):
                try:
                    rpc(ticket, 'pi_helper_tool_finish', dict(p_job_id=ticket['job_id'], p_claim_secret=claim_secret,
                        p_status='completed', p_version=job['version'], p_error_code=None))
                    break
                except RuntimeError as error:
                    if getattr(error, 'code', '') != 'TOOL_NOT_VERIFIED' or attempt == 7:
                        raise
                    time.sleep(5)
            atomic_json(directory / 'version.json', {'version': job['version'], 'job_id': ticket['job_id']})
            state_path.unlink(missing_ok=True)
            print('課堂工具安裝完成，設備與課程回報都已收到。請回網頁繼續上課。', flush=True)
        except Exception:
            try:
                rpc(ticket, 'pi_helper_tool_finish', dict(p_job_id=ticket['job_id'], p_claim_secret=claim_secret,
                    p_status='failed', p_version=job['version'], p_error_code='install_failed'))
            except Exception:
                pass
            raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('ticket', nargs='?')
    parser.add_argument('--privileged', choices=['read-device', 'install-device'])
    args = parser.parse_args()
    if args.privileged:
        privileged(args.privileged)
    else:
        raw = args.ticket or ''
        if len(raw) > 8192:
            raise ValueError('安裝指令過長。')
        install(validate_ticket(json.loads(base64.b64decode(raw, validate=True))))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        # Only known human-readable messages; never expose requests or credentials.
        message = str(error)
        safe = message in ERRORS.values() or message.startswith(('這台不是 ', '請用 user ', '工具版本與指派內容不同', '本機已有其他課堂設定'))
        print(message if safe else '安裝未完成。請保留本機畫面並回網頁查看狀態，或重試同一行指令。', file=sys.stderr)
        sys.exit(1)
