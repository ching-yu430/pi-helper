#!/usr/bin/env python3
"""Student-owned course runner. No root execution, shell audit or remote commands."""
import argparse
import base64
from collections import deque
from contextlib import contextmanager
import fcntl
import getpass
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

VERSION = '1.0.0'
PYTHON = '/usr/bin/python3'
TASKS = ('location', 'folders', 'hello', 'write', 'update', 'install', 'environment', 'camera-install', 'camera')
LAUNCHER = '''#!/usr/bin/python3
# PI_HELPER_COURSE_LAUNCHER_V1
from pathlib import Path
import runpy
runpy.run_path(str(Path.home() / '.local/share/pi-helper-course/pi_course.py'), run_name='__main__')
'''


class CourseError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def hostname():
    return socket.gethostname().split('.')[0]


def paths(home=None):
    home = Path.home() if home is None else Path(home)
    return home, home / 'pi-camera', home / '.config/pi-helper-course'


def validate_config(config):
    if not isinstance(config, dict) or set(config) != {'url', 'key', 'course_token', 'expected_hostname'}:
        raise ValueError('課程設定碼格式不正確。')
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', str(config['url'])):
        raise ValueError('伺服器位址不正確。')
    key = config['key']
    public = isinstance(key, str) and key.startswith('sb_publishable_')
    if isinstance(key, str) and key.startswith('eyJ'):
        try:
            part = key.split('.')[1]
            public = json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))['role'] == 'anon'
        except (ValueError, KeyError, IndexError):
            pass
    if not public or '\n' in key or '\r' in key:
        raise ValueError('只能使用公開連線金鑰。')
    if not re.fullmatch('[a-f0-9]{64}', str(config['course_token'])) or not re.fullmatch(r'pi5-(?:0[1-9]|[1-9][0-9])', str(config['expected_hostname'])):
        raise ValueError('組別或課程憑證不正確。')
    return config


@contextmanager
def lock(directory, name='queue.lock', blocking=True):
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    descriptor = os.open(directory / name, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        except BlockingIOError:
            raise CourseError('interrupted', '已有課程工作正在執行，請先完成或關閉它。') from None
        yield
    finally:
        os.close(descriptor)


def write_json(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, 'w') as output:
            json.dump(value, output, ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class Reporter:
    def __init__(self, home=None):
        self.home, self.project, self.directory = paths(home)
        self.config = None
        try:
            self.config = validate_config(json.loads((self.directory / 'config.json').read_text()))
        except FileNotFoundError:
            pass
        if self.config and self.config['expected_hostname'] != hostname():
            raise CourseError('wrong_host', '課程設定屬於另一組，請助教核對這台 Pi。')
        self.run_id = str(uuid.uuid4())
        self.tag = hashlib.sha256(self.config['course_token'].encode()).hexdigest() if self.config else None

    def emit(self, task, status, evidence=None, network=None, run_id=None):
        evidence = {'program_version': VERSION, **(evidence or {})}
        if not self.config:
            print('尚未設定課程回報；本次結果只顯示在這台 Pi。', flush=True)
            return
        with lock(self.directory):
            state = json.loads((self.directory / 'pending.json').read_text())
            if state.get('tag') != self.tag:
                print('課程設定已更新，請重新啟動程式。', flush=True)
                return
            state['sequence'] += 1
            event = dict(hostname=hostname(), sequence=state['sequence'], run_id=run_id or self.run_id,
                         task=task, status=status, evidence=evidence)
            if network is not None:
                event['network'] = network
            state['events'] = (state['events'] + [event])[-128:]
            write_json(self.directory / 'pending.json', state)
        threading.Thread(target=self.flush, daemon=True).start()

    def flush(self, blocking=False):
        if not self.config:
            return
        # One sender per user. Do not hold the queue lock during a network request.
        try:
            with lock(self.directory, 'sender.lock', blocking=blocking):
                deadline = time.monotonic() + 8
                for _ in range(16):
                    if time.monotonic() > deadline:
                        return
                    with lock(self.directory):
                        state = json.loads((self.directory / 'pending.json').read_text())
                        if state.get('tag') != self.tag or not state['events']:
                            return
                        event = state['events'][0]
                    headers = {'apikey': self.config['key'], 'Content-Type': 'application/json'}
                    if self.config['key'].startswith('eyJ'):
                        headers['Authorization'] = 'Bearer ' + self.config['key']
                    body = json.dumps({'p_course_token': self.config['course_token'], 'p_event': event}).encode()
                    request = urllib.request.Request(self.config['url'] + '/rest/v1/rpc/pi_helper_course_event', data=body, headers=headers)
                    try:
                        with urllib.request.urlopen(request, timeout=4) as response:
                            if json.loads(response.read(1024)) is not True:
                                return
                    except (OSError, ValueError, urllib.error.URLError):
                        return
                    with lock(self.directory):
                        state = json.loads((self.directory / 'pending.json').read_text())
                        if state.get('tag') != self.tag:
                            return
                        state['events'] = [item for item in state['events'] if item['sequence'] > event['sequence']]
                        write_json(self.directory / 'pending.json', state)
        except (CourseError, OSError, ValueError, KeyError):
            return


def setup(home=None):
    home, _, directory = paths(home)
    encoded = getpass.getpass('貼上本組「課程回報設定碼」，按 Enter（輸入不顯示）：').strip()
    if len(encoded) > 8192:
        raise ValueError('設定碼過長。')
    try:
        config = validate_config(json.loads(base64.b64decode(encoded, validate=True)))
    except (ValueError, TypeError):
        raise ValueError('設定碼不正確，請回工作台重新複製。') from None
    if config['expected_hostname'] != hostname():
        raise CourseError('wrong_host', '這不是設定碼指定的 ' + config['expected_hostname'] + '，尚未套用。')
    launcher = home / 'pi-course'
    if launcher.is_symlink() or (launcher.exists() and launcher.read_text() != LAUNCHER):
        raise ValueError('家目錄已有其他 pi-course 檔案，請助教確認後再設定；尚未覆蓋。')
    with lock(directory, 'operation.lock', blocking=False), lock(directory):
        tag = hashlib.sha256(config['course_token'].encode()).hexdigest()
        state = dict(tag=tag, sequence=0, events=[])
        if (directory / 'pending.json').exists():
            try:
                old = json.loads((directory / 'pending.json').read_text())
                if old.get('tag') == tag:
                    if not isinstance(old.get('sequence'), int) or not isinstance(old.get('events'), list):
                        raise ValueError()
                    state = old
            except (ValueError, TypeError):
                raise ValueError('本機回報紀錄無法讀取，請助教重新產生設定碼。') from None
        write_json(directory / 'config.json', config)
        write_json(directory / 'pending.json', state)
        temporary = home / ('.pi-course-' + uuid.uuid4().hex)
        try:
            temporary.write_text(LAUNCHER)
            temporary.chmod(0o755)
            os.replace(temporary, launcher)
        finally:
            temporary.unlink(missing_ok=True)
    print('課程回報已設定。之後使用 ~/pi-course 加上課程操作，例如 ~/pi-course location。')


def network_addresses():
    try:
        data = json.loads(subprocess.run(['ip', '-j', '-4', 'address', 'show'], capture_output=True, text=True, timeout=3).stdout)
        result = []
        ranges = [ipaddress.ip_network(value) for value in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')]
        for interface in data:
            for address in interface.get('addr_info', []):
                ip = ipaddress.ip_address(address['local'])
                if any(ip in net for net in ranges):
                    result.append({'interface': interface['ifname'], 'ip': str(ip)})
        return result[:8]
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired):
        return []


def command_output(command, timeout=5):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, env={**os.environ, 'LC_ALL': 'C'})
        return result.returncode, result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return None, ''


def capture_devices():
    result = []
    for node in sorted(Path('/sys/class/video4linux').glob('video*')):
        if not any((parent / 'idVendor').exists() for parent in node.resolve().parents):
            continue
        device = '/dev/' + node.name
        code, text = command_output(['v4l2-ctl', '-d', device, '--list-formats-ext'])
        if code == 0 and any(value in text for value in ("'MJPG'", "'YUYV'")):
            result.append(device)
    return result


def checked_path(project, name):
    path = project / name
    if project.is_symlink() or not path.resolve().is_relative_to(project.resolve()) or path.is_symlink():
        raise CourseError('missing_script', '課程檔案位置不正確，請確認沒有移到其他資料夾。')
    return path


def execute(command, cwd, timeout=15, limit=65536, interactive=False):
    """Bound student output and execution; apt is never killed by an automatic timeout."""
    process = subprocess.Popen(command, cwd=cwd, stdin=None if interactive else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=not interactive,
                               env={**os.environ, 'LC_ALL': 'C', 'PYTHONUNBUFFERED': '1'})
    chunks = deque(maxlen=64)
    overflow = threading.Event()

    def read():
        total = 0
        while True:
            chunk = process.stdout.read1(1024)
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if interactive:
                sys.stdout.buffer.write(chunk)
                sys.stdout.buffer.flush()
            elif total > limit:
                overflow.set()
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                break
    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    try:
        code = process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
        raise CourseError('timeout', '程式執行太久，請檢查是否有無限迴圈或等待輸入。') from None
    except KeyboardInterrupt:
        if not interactive:
            try:
                os.killpg(process.pid, signal.SIGINT)
            except ProcessLookupError:
                pass
        raise CourseError('interrupted', '本次操作已中斷。請保留終端機畫面，確認後再重試。') from None
    finally:
        reader.join(timeout=2)
        if not reader.is_alive():
            process.stdout.close()
    output = b''.join(chunks).decode('utf-8', errors='replace')
    if not interactive:
        print(output, end='' if output.endswith('\n') else '\n')
    if overflow.is_set():
        raise CourseError('python_failed', '程式輸出過多，請檢查是否有無限迴圈。')
    return max(0, code) if code == 0 else max(1, abs(code)), output


def run_task(task, reporter):
    home, project = reporter.home, reporter.project
    group = hostname()[-2:]
    if task == 'location':
        cwd = Path.cwd().resolve()
        label = 'home' if cwd == home.resolve() else 'project' if cwd == project.resolve() else 'photos' if cwd == (project / 'photos').resolve() else 'other'
        print('主機：' + hostname() + '\n目前位置：' + str(cwd))
        if label == 'other':
            raise CourseError('wrong_directory', '請在終端機先輸入 cd ~，再檢查執行位置。')
        return {'cwd': label, 'python_version': sys.version.split()[0]}, network_addresses()
    if task == 'folders':
        photos = checked_path(project, 'photos')
        if not project.is_dir() or not photos.is_dir():
            raise CourseError('missing_folder', '請先建立 ~/pi-camera/photos 資料夾。')
        probe = photos / ('.check-' + uuid.uuid4().hex)
        try:
            with probe.open('x') as output:
                output.write('test')
        except OSError:
            raise CourseError('missing_folder', '照片資料夾不能寫入，請助教檢查權限。') from None
        finally:
            probe.unlink(missing_ok=True)
        return {'folders_ok': True}, None
    if task in ('hello', 'write'):
        script = checked_path(project, 'hello.py' if task == 'hello' else 'write_note.py')
        if not script.is_file():
            raise CourseError('missing_script', '找不到 ' + script.name + '，請在文字編輯器儲存到 pi-camera。')
        message = checked_path(project, 'message.txt')
        before = message.stat().st_mtime_ns if message.exists() else None
        code, output = execute([PYTHON, str(script)], project)
        if code:
            raise CourseError('python_failed', 'Python 執行失敗。請看上方錯誤、修改並儲存後重試。')
        expected = '第' + group + '組'
        if task == 'hello':
            if expected not in re.sub(r'\s+', '', output):
                raise CourseError('wrong_group', '輸出尚未包含本組名稱，請修改並儲存程式。')
            return {'exit_code': 0, 'group_output': True, 'python_version': sys.version.split()[0]}, None
        if not message.is_file() or message.stat().st_size > 4096:
            raise CourseError('write_missing', '沒有找到本次的文字檔，請檢查程式中的儲存路徑。')
        if before is not None and message.stat().st_mtime_ns == before:
            raise CourseError('write_unchanged', '只有之前留下的檔案，這次尚未重新寫入。')
        if expected not in re.sub(r'\s+', '', message.read_text(encoding='utf-8')):
            raise CourseError('wrong_group', '文字檔尚未包含本組名稱。')
        return {'exit_code': 0, 'group_output': True, 'new_file': True}, None
    if task in ('update', 'install'):
        command = ['sudo', 'apt', 'update'] if task == 'update' else ['sudo', 'apt', 'install', '-y', 'v4l-utils', 'python3-opencv', 'python3-tk']
        print('執行：' + ' '.join(command), flush=True)
        code, output = execute(command, home, timeout=None, interactive=True)
        if code:
            raise CourseError('apt_failed', '更新或安裝尚未成功，請看終端機的完整錯誤，不要刪除 lock 檔。')
        if task == 'update' and any(value in output for value in ('Failed to fetch', 'Some index files failed', 'Temporary failure resolving', 'Err:')):
            raise CourseError('apt_network', '有套件來源下載失敗，請確認 Pi 能連外上網後重試。')
        return {'exit_code': 0}, None
    if task == 'environment':
        try:
            import cv2
            import tkinter
        except ImportError:
            raise CourseError('environment_missing', '系統 Python 尚不能載入 OpenCV 或介面套件，請回上一步安裝。') from None
        devices = capture_devices()
        if not devices:
            raise CourseError('camera_missing', '找不到可取像的 USB 相機，請確認接在 Pi，並先關閉其他相機程式。')
        print('OpenCV：' + cv2.__version__ + '\n可用相機：' + ', '.join(devices))
        release = {}
        try:
            release = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
        except OSError:
            pass
        return {'cv2_ok': True, 'tk_ok': True, 'v4l_ok': True, 'device': devices[0], 'opencv_version': cv2.__version__, 'python_version': sys.version.split()[0], 'arch': os.uname().machine, 'os': release.get('PRETTY_NAME', 'unknown').strip('"')[:100]}, None
    if task == 'camera-install':
        if not (project / 'photos').is_dir():
            raise CourseError('missing_folder', '請先完成建立課程資料夾的練習。')
        source = Path(__file__).resolve().with_name('camera_app.py')
        target = checked_path(project, 'camera_app.py')
        if not source.is_file():
            raise CourseError('missing_script', '缺少統一拍照程式，請助教重新下載課程工具。')
        if target.exists() and target.read_bytes() != source.read_bytes():
            shutil.copyfile(target, project / ('camera_app.' + uuid.uuid4().hex[:8] + '.bak.py'))
        shutil.copyfile(source, target)
        print('統一拍照程式已放入 ' + str(target))
        return None, None
    if task == 'camera':
        script = checked_path(project, 'camera_app.py')
        if not script.is_file():
            raise CourseError('missing_script', '請先執行 camera-install 取得統一拍照程式。')
        code = subprocess.call([PYTHON, str(script), '--run-id', reporter.run_id])
        if code:
            raise CourseError('camera_read', '拍照程式未正常結束，請查看提示後重試。')
        return None, None
    raise ValueError('不支援的課程操作。')


def main():
    parser = argparse.ArgumentParser(description='Pi 課程執行與結果檢查；請使用 user，不要加 sudo。')
    parser.add_argument('task', choices=['setup', 'flush', *TASKS])
    args = parser.parse_args()
    if os.geteuid() == 0:
        raise ValueError('請用 user 執行課程工具，不要在整行前面加 sudo。')
    if args.task == 'setup':
        setup()
        return 0
    reporter = Reporter()
    if args.task == 'flush':
        reporter.flush(blocking=True)
        print('已嘗試補送本機待回報結果，請回網頁按「更新檢查結果」。')
        return 0
    task = args.task
    with lock(reporter.directory, 'operation.lock', blocking=False):
        heartbeat_stop = threading.Event()
        def heartbeat():
            while not heartbeat_stop.wait(30):
                reporter.emit(task, 'running')
        if task in ('update', 'install'):
            threading.Thread(target=heartbeat, daemon=True).start()
        if task != 'camera-install':
            reporter.emit(task, 'running')
        try:
            evidence, network = run_task(task, reporter)
            if evidence is not None:
                reporter.emit(task, 'passed', evidence, network)
            print('本次操作完成。請回網頁確認檢查結果。')
            result = 0
        except (CourseError, OSError, UnicodeError) as error:
            code = error.code if isinstance(error, CourseError) else 'unknown'
            if task != 'camera-install':
                reporter.emit(task, 'cancelled' if code == 'interrupted' else 'failed', {'error_code': code})
            print(str(error) if isinstance(error, CourseError) else '檔案或裝置操作失敗，請保留終端機畫面並請助教確認。', file=sys.stderr)
            result = 1
        finally:
            heartbeat_stop.set()
            reporter.flush(blocking=True)
    return result


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, CourseError, OSError, EOFError, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, (ValueError, CourseError)) else '操作中斷或設定讀取失敗，請助教確認。', file=sys.stderr)
        sys.exit(1)
