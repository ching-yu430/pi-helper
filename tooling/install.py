#!/usr/bin/env python3
"""One approved classroom install/update. Standard library; no remote command queue."""
import argparse
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

SOURCES = {'device': 'device-agent/pi_reporter.py', 'course': 'courseware/pi_course.py', 'camera': 'courseware/camera_app.py', 'updater': 'tooling/updater.py'}
ORIGIN = 'https://raw.githubusercontent.com/ching-yu430/pi-helper/main/tooling/releases/'
ERRORS = {'TOOL_EXPIRED': '授權已到期，請回網頁請助教重新核准。', 'TOOL_DENIED': '安裝授權不正確或已取消。',
          'TOOL_HOST_MISMATCH': '這台樹莓派不是指派的組別，尚未安裝。',
          'TOOL_REBIND_REQUIRED': '現有配對與本機設定不同，請助教確認是否需要重新綁定。',
          'TOOL_ALREADY_CLAIMED': '這次安裝已由另一台設備領取，請找助教。',
          'TOOL_NOT_VERIFIED': '尚未收到兩項實際回報，請稍後重試。',
          'ROOM_NOT_FOUND': '課堂已關閉、到期或本組未開放，請助教確認。',
          'INVALID_STATE': '安裝任務狀態不符，請回工作台確認指派版本。',
          'NETWORK_ERROR': '網路連線失敗，請確認樹莓派能上網後重試。',
          'TOOL_SYSTEM_REQUIRED': '這次需要更新系統服務，請重新開啟課堂工具再試。',
          'TOOL_REQUEST_EXISTS': '已有另一個更新申請，請找助教確認。',
          'TOOL_VERSION': '請助教指派支援桌面更新的版本（1.5.0 以上）。',
          'REMOTE_ERROR': '伺服器未完成安裝確認，請助教查看課堂設定。'}



STEPS = {'sudo': '取得 Pi 安裝權限', 'read_config': '讀取既有配對', 'claim': '核對安裝授權',
         'download': '下載與驗證工具', 'write_files': '寫入課堂工具', 'course_setup': '設定課程回報',
         'device_setup': '啟動設備回報服務', 'cleanup': '清理安裝暫存檔', 'course_report': '送出課程位置回報',
         'verify': '等候兩項回報確認', 'save': '儲存完成紀錄'}


def diagnostic(error):
    stage = getattr(error, 'install_stage', '')
    stage = stage if stage in STEPS else 'unknown'
    code = getattr(error, 'code', '')
    code = code if isinstance(code, str) and code in ERRORS else ''
    return dict(stage=stage, error_code='install_' + stage if stage != 'unknown' else 'install_failed',
                remote_code=code, exception=type(error).__name__ if type(error).__name__ in
                ('PermissionError', 'FileNotFoundError', 'CalledProcessError', 'RuntimeError', 'ValueError', 'JSONDecodeError', 'TimeoutError') else 'Error',
                errno=error.errno if isinstance(error, OSError) and isinstance(error.errno, int) else None,
                returncode=error.returncode if isinstance(error, subprocess.CalledProcessError) else None,
                time=datetime.now(timezone.utc).isoformat())


def failure_message(error):
    info = diagnostic(error)
    stage = STEPS.get(info['stage'], '安裝流程')
    if info['remote_code']:
        detail = ERRORS[info['remote_code']]
    elif isinstance(error, PermissionError):
        detail = '檔案權限不足（PermissionError）。'
    elif isinstance(error, subprocess.CalledProcessError):
        detail = '子程序執行失敗（結束碼 ' + str(error.returncode) + '），請查看上方訊息。'
    else:
        message = str(error)
        safe = message in ERRORS.values() or message in {
            '請用 user 執行安裝指令，不要在整行前加 sudo。',
            '工具版本與指派內容不同，尚未更新檔案。請助教指派最新版本。',
            '本機已有其他課堂設定，請助教確認；尚未變更。',
            '已有安裝正在執行，請等待完成。', '需要 Raspberry Pi OS 的 systemd。',
            '安裝指令格式不正確，請回網頁重新複製。', '只能使用公開連線金鑰。',
            '授權資料不正確。', '組別不正確。', '伺服器位址不正確。',
            '工具版本格式不正確。', '課堂工具版本不完整。', '版本校驗碼不正確。'
        } or re.fullmatch(r'這台不是 pi5-[0-9]{2}，尚未領取或安裝。', message) is not None
        detail = message if safe else '請保留本機畫面，讓助教查看錯誤紀錄。'
    return '安裝未完成｜' + stage + '：' + detail


@contextmanager
def installation_step(stage, directory):
    try:
        yield
    except Exception as error:
        if not hasattr(error, 'install_stage'):
            error.install_stage = stage
        try:
            atomic_json(directory / 'last-error.json', diagnostic(error))
        except OSError:
            pass
        raise


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
        code = code if isinstance(code, str) and code in ERRORS else 'REMOTE_ERROR'
        problem = RuntimeError(ERRORS[code])
        problem.code = code
        raise problem from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        problem = RuntimeError(ERRORS['NETWORK_ERROR'])
        problem.code = 'NETWORK_ERROR'
        raise problem from None


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    # The sudo helper imports a file inside the student's 0700 temporary directory.
    # A root-owned __pycache__ there prevents the student from cleaning it up.
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
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


class UserBundle:
    """Switch only managed program files; exercises, photos and pairing stay put."""
    def __init__(self, home, files, version):
        self.target = home / '.local/share/pi-helper-course'
        directory = home / '.local/share/pi-helper-tools/releases'
        directory.mkdir(parents=True, exist_ok=True)
        self.release = directory / (version + '-' + uuid.uuid4().hex)
        self.release.mkdir(mode=0o755)
        self.previous = None
        self.switched = False
        names = dict(course='pi_course.py', camera='camera_app.py', device='device.py', updater='updater.py')
        for name, filename in names.items():
            (self.release / filename).write_bytes(files[name])
        shutil.copyfile(Path(__file__).resolve(), self.release / 'installer.py')

    def activate(self):
        if self.target.is_symlink():
            self.previous = self.target.resolve()
        elif self.target.exists():
            self.previous = self.release.parent / ('previous-' + uuid.uuid4().hex)
            self.target.rename(self.previous)
        link = self.target.with_name('.pi-helper-link-' + uuid.uuid4().hex)
        try:
            link.symlink_to(self.release, target_is_directory=True)
            os.replace(link, self.target)
        except OSError:
            if self.previous and not self.target.exists() and not self.target.is_symlink():
                self.target.symlink_to(self.previous, target_is_directory=True)
            raise
        finally:
            link.unlink(missing_ok=True)
        self.switched = True

    def rollback(self):
        if not self.switched:
            return
        if self.previous:
            link = self.target.with_name('.pi-helper-restore-' + uuid.uuid4().hex)
            link.symlink_to(self.previous, target_is_directory=True)
            os.replace(link, self.target)
        else:
            self.target.unlink(missing_ok=True)


def sudo_args(gui):
    return ['sudo', '-A'] if gui else ['sudo']


def install(ticket, home=None, desktop=False, gui=False):
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
        if not desktop:
            with installation_step('sudo', directory):
                subprocess.run(sudo_args(gui) + ['-v'], check=True)
        script = str(Path(__file__).resolve())
        with installation_step('read_config', directory):
            device = {}
            if not desktop:
                existing = subprocess.run(sudo_args(gui) + ['/usr/bin/python3', '-B', script, '--privileged', 'read-device'], check=True, capture_output=True, text=True)
                device = json.loads(existing.stdout)
            course_path = home / '.config/pi-helper-course/config.json'
            course = json.loads(course_path.read_text()) if course_path.exists() else {}
        # Never send an old credential to a different configured server.
        if device and device.get('url') != ticket['url'] or course and course.get('url') != ticket['url']:
            raise ValueError('本機已有其他課堂設定，請助教確認；尚未變更。')
        with installation_step('claim', directory):
            args = dict(p_job_id=ticket['job_id'], p_request_secret=ticket['request_secret'],
                        p_claim_secret=claim_secret, p_hostname=ticket['expected_hostname'], p_course_token=course.get('course_token'))
            if not desktop:
                args['p_device_token'] = device.get('device_token')
            job = rpc(ticket, 'pi_helper_tool_desktop_claim' if desktop else 'pi_helper_tool_claim', args)
        if job.get('completed'):
            state_path.unlink(missing_ok=True)
            print('這次安裝已完成，請回網頁繼續上課。')
            return
        bundle = None
        verifying = False
        try:
            with installation_step('download', directory):
                files = fetch_sources(job['files'], version=job['version'])
            with installation_step('cleanup', directory):
                with tempfile.TemporaryDirectory(prefix='pi-helper-tools-') as temporary:
                    stage = Path(temporary)
                    with installation_step('write_files', directory):
                        for name, data in files.items():
                            (stage / (name + '.py')).write_bytes(data)
                        bundle = UserBundle(home, files, job['version'])
                        bundle.activate()
                        target = bundle.target
                    shared = dict(url=ticket['url'], key=ticket['key'], expected_hostname=ticket['expected_hostname'])
                    with installation_step('course_setup', directory):
                        load_module(target / 'pi_course.py', 'course_installer').setup(home=home, config={**shared, 'course_token': job['course_token']})
                    with installation_step('device_setup', directory):
                        if not desktop:
                            # Tk is needed only for the desktop updater, not the camera assignment.
                            probe = subprocess.run(['/usr/bin/python3', '-c', 'import tkinter'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                            if probe.returncode:
                                subprocess.run(sudo_args(gui) + ['apt-get', 'update'], check=True)
                                subprocess.run(sudo_args(gui) + ['apt-get', 'install', '-y', 'python3-tk'], check=True)
                            payload = dict(config={**shared, 'device_token': job['device_token']}, source=str(stage / 'device.py'), sha256=job['files']['device'])
                            subprocess.run(sudo_args(gui) + ['/usr/bin/python3', '-B', script, '--privileged', 'install-device'], input=json.dumps(payload), text=True, check=True)
                        load_module(target / 'updater.py', 'desktop_installer').install_shortcuts(home)
            with installation_step('course_report', directory):
                subprocess.run(['/usr/bin/python3', str(home / 'pi-course'), 'location'], check=True)
            with installation_step('verify', directory):
                # A lost response may follow a committed finish: keep verified files
                # on confirmation errors instead of rolling back a completed job.
                verifying = True
                for attempt in range(13):
                    try:
                        rpc(ticket, 'pi_helper_tool_finish', dict(p_job_id=ticket['job_id'], p_claim_secret=claim_secret,
                            p_status='completed', p_version=job['version'], p_error_code=None))
                        break
                    except RuntimeError as error:
                        if getattr(error, 'code', '') != 'TOOL_NOT_VERIFIED' or attempt == 12:
                            raise
                        if attempt == 0:
                            print('工具檔案已安裝，正在等候設備與課程回報；請保持終端機開啟。', flush=True)
                        # An offline backlog may need more than one bounded flush.
                        try:
                            subprocess.run(['/usr/bin/python3', str(home / 'pi-course'), 'flush'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15, check=False)
                        except (OSError, subprocess.SubprocessError):
                            pass
                        time.sleep(5)
            with installation_step('save', directory):
                atomic_json(directory / 'version.json', {'version': job['version'], 'job_id': ticket['job_id']})
                state_path.unlink(missing_ok=True)
                (directory / 'last-error.json').unlink(missing_ok=True)
            print('課堂工具安裝完成，設備與課程回報都已收到。請回網頁繼續上課。', flush=True)
            try:
                load_module(target / 'updater.py', 'desktop_notifier').start_notifier(home)
            except Exception:
                # A notification problem cannot undo a server-confirmed install.
                pass
        except Exception as error:
            if bundle and not verifying:
                try:
                    bundle.rollback()
                except OSError:
                    # Preserve the original safe diagnostic, and retain both bundles
                    # for the assistant to recover if filesystem writes also failed.
                    pass
            try:
                rpc(ticket, 'pi_helper_tool_finish', dict(p_job_id=ticket['job_id'], p_claim_secret=claim_secret,
                    p_status='failed', p_version=job['version'], p_error_code=diagnostic(error)['error_code']))
            except Exception:
                pass
            raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('ticket', nargs='?')
    parser.add_argument('--privileged', choices=['read-device', 'install-device'])
    parser.add_argument('--ticket-file')
    parser.add_argument('--desktop', action='store_true', help='Approved user-only desktop update')
    parser.add_argument('--gui', action='store_true', help='Use the desktop sudo password dialog')
    args = parser.parse_args()
    if args.privileged:
        privileged(args.privileged)
    else:
        raw = Path(args.ticket_file).read_text() if args.ticket_file else args.ticket or ''
        if len(raw) > 8192:
            raise ValueError('安裝指令過長。')
        value = json.loads(raw) if args.ticket_file else json.loads(base64.b64decode(raw, validate=True))
        install(validate_ticket(value), desktop=args.desktop, gui=args.gui)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print subprocess arguments, HTTP bodies or credential-bearing payloads.
        print(failure_message(error), file=sys.stderr)
        sys.exit(1)
