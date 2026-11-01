#!/usr/bin/env python3
"""Student-owned course runner. No root execution, shell audit or remote commands."""
import argparse
import base64
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timezone
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

VERSION = '1.6.0'
PYTHON = '/usr/bin/python3'
TASKS = ('location', 'folders', 'hello', 'write', 'update', 'install', 'environment', 'camera-install', 'camera', 'camera-student', 'run')
OBSERVED = ('terminal_ready', 'host_name', 'working_dir', 'mkdir_photos', 'enter_project', 'list_project')
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
        self.task_statuses = {}
        self.tag = hashlib.sha256(self.config['course_token'].encode()).hexdigest() if self.config else None

    def emit(self, task, status, evidence=None, network=None, run_id=None, asynchronous=True):
        self.task_statuses[(task, run_id or self.run_id)] = status
        evidence = {'program_version': VERSION, 'recorded_at': datetime.now(timezone.utc).isoformat(), **(evidence or {})}
        if not self.config:
            print('尚未設定課程回報；本次結果只顯示在這台 Pi。', flush=True)
            return False
        with lock(self.directory):
            state = json.loads((self.directory / 'pending.json').read_text())
            if state.get('tag') != self.tag:
                write_json(self.directory / 'delivery-error.json', {'code': 'CONFIG_CHANGED'})
                print('課程設定已更新，請重新啟動程式。', flush=True)
                return False
            state['sequence'] += 1
            event = dict(hostname=hostname(), sequence=state['sequence'], run_id=run_id or self.run_id,
                         task=task, status=status, evidence=evidence)
            if network is not None:
                event['network'] = network
            if len(state['events']) >= 4096:
                raise CourseError('queue_full', '本機待送紀錄已滿，請連網補送後再操作；既有紀錄未刪除。')
            # Keep the original running event and latest heartbeat while offline.
            same = [i for i, item in enumerate(state['events']) if item['task'] == task and item['run_id'] == event['run_id'] and item['status'] == 'running']
            if status == 'running' and len(same) >= 2:
                state['events'].pop(same[-1])
            state['events'].append(event)
            write_json(self.directory / 'pending.json', state)
        if asynchronous:
            threading.Thread(target=self.flush, daemon=True).start()
        return True

    def flush(self, blocking=False):
        self.last_flush_progress = 0
        if not self.config:
            return False
        # One sender per user. Do not hold the queue lock during a network request.
        try:
            with lock(self.directory, 'sender.lock', blocking=blocking):
                deadline = time.monotonic() + 8
                for _ in range(16):
                    if time.monotonic() > deadline:
                        return False
                    with lock(self.directory):
                        state = json.loads((self.directory / 'pending.json').read_text())
                        if state.get('tag') != self.tag:
                            write_json(self.directory / 'delivery-error.json', {'code': 'CONFIG_CHANGED'})
                            return False
                        if not state['events']:
                            (self.directory / 'delivery-error.json').unlink(missing_ok=True)
                            return True
                        event = state['events'][0]
                    headers = {'apikey': self.config['key'], 'Content-Type': 'application/json'}
                    if self.config['key'].startswith('eyJ'):
                        headers['Authorization'] = 'Bearer ' + self.config['key']
                    body = json.dumps({'p_course_token': self.config['course_token'], 'p_event': event}).encode()
                    request = urllib.request.Request(self.config['url'] + '/rest/v1/rpc/pi_helper_course_event', data=body, headers=headers)
                    try:
                        with urllib.request.urlopen(request, timeout=4) as response:
                            if json.loads(response.read(1024)) is not True:
                                return False
                    except urllib.error.HTTPError as error:
                        try:
                            code = json.loads(error.read(2048)).get('message', '')
                        except (ValueError, OSError):
                            code = ''
                        code = code if isinstance(code, str) and code in ('INVALID_COURSE_EVENT', 'COURSE_DEVICE_DENIED', 'COURSE_HOST_MISMATCH', 'ROOM_NOT_FOUND') else 'NETWORK_ERROR'
                        write_json(self.directory / 'delivery-error.json', {'code': code})
                        return False
                    except (OSError, ValueError, urllib.error.URLError):
                        write_json(self.directory / 'delivery-error.json', {'code': 'NETWORK_ERROR'})
                        return False
                    with lock(self.directory):
                        state = json.loads((self.directory / 'pending.json').read_text())
                        if state.get('tag') != self.tag:
                            return False
                        state['events'] = [item for item in state['events'] if item['sequence'] > event['sequence']]
                        write_json(self.directory / 'pending.json', state)
                    self.last_flush_progress += 1
                    (self.directory / 'delivery-error.json').unlink(missing_ok=True)
                with lock(self.directory):
                    state = json.loads((self.directory / 'pending.json').read_text())
                    return state.get('tag') == self.tag and not state['events']
        except (CourseError, OSError, ValueError, KeyError):
            return False


def delivery_message(reporter, delivered):
    if not reporter.config:
        return '本機檢查通過，但尚未設定課程回報，請找助教。'
    if delivered:
        return '本機檢查通過，已回報網頁。'
    try:
        code = json.loads((reporter.directory / 'delivery-error.json').read_text()).get('code')
    except (OSError, ValueError):
        code = ''
    if code == 'INVALID_COURSE_EVENT':
        return '本機檢查通過；回報尚未送達，請助教更新 Supabase SQL。'
    if code in ('COURSE_DEVICE_DENIED', 'COURSE_HOST_MISMATCH', 'ROOM_NOT_FOUND'):
        return '本機檢查通過；回報授權或課堂狀態不符，請找助教。'
    if code == 'CONFIG_CHANGED':
        return '本機檢查通過；配對與待送紀錄不符，請助教重新設定課程工具。'
    return '本機檢查通過；回報待送，連線恢復後會自動補送。'


def ensure_sender():
    # Each short observer enqueues locally, then wakes one lock-protected sender.
    try:
        subprocess.Popen([PYTHON, str(Path.home() / '.local/share/pi-helper-course/pi_course.py'), 'sender'],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        pass


def send_forever():
    home, _, directory = paths()
    stable = home / '.local/share/pi-helper-course/pi_course.py'
    signature = stable.read_bytes()
    changed = False
    try:
        with lock(directory, 'watch.lock', blocking=False):
            while True:
                if stable.read_bytes() != signature:
                    changed = True
                    break
                reporter = Reporter()
                delivered = reporter.flush(blocking=True)
                if not delivered and reporter.last_flush_progress:
                    continue
                time.sleep(3)
    except (CourseError, OSError, ValueError):
        return
    if changed:
        ensure_sender()


def setup(home=None, config=None):
    home, _, directory = paths(home)
    if config is None:
        encoded = getpass.getpass('貼上本組「課程回報設定碼」，按 Enter（輸入不顯示）：').strip()
        if len(encoded) > 8192:
            raise ValueError('設定碼過長。')
        try:
            config = validate_config(json.loads(base64.b64decode(encoded, validate=True)))
        except (ValueError, TypeError):
            raise ValueError('設定碼不正確，請回工作台重新複製。') from None
    else:
        config = validate_config(config)
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
        install_shell_hook(home)
    print('課程回報已設定。之後使用 ~/pi-course 加上課程操作，例如 ~/pi-course location。')
    print('請關閉舊終端機，再開啟新的終端機，啟用課程指令回報。')


def install_shell_hook(home):
    path = home / '.bashrc'
    if path.is_symlink():
        raise ValueError('終端機設定是連結，請助教確認後再啟用回報。')
    text = path.read_text() if path.exists() else ''
    begin, end = '# >>> pi-helper course shell >>>', '# <<< pi-helper course shell <<<'
    if text.count(begin) != text.count(end) or text.count(begin) > 1:
        raise ValueError('既有課程終端機設定區塊不完整，請助教確認。')
    block = begin + '\nif [[ $- == *i* && -r "$HOME/.local/share/pi-helper-course/course_shell.bash" ]]; then\n    source "$HOME/.local/share/pi-helper-course/course_shell.bash"\nfi\n' + end
    if begin in text:
        text = re.sub(re.escape(begin) + '.*?' + re.escape(end), lambda _: block, text, flags=re.S)
    else:
        text = text.rstrip('\n') + '\n\n' + block + '\n'
    temporary = path.with_name('.bashrc-pi-helper-' + uuid.uuid4().hex)
    try:
        temporary.write_text(text)
        temporary.chmod(path.stat().st_mode & 0o777 if path.exists() else 0o644)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def observed_task(reporter, task, exit_code, cwd, flag):
    if task not in OBSERVED or not 0 <= exit_code <= 255 or flag not in (0, 1):
        raise ValueError('課程指令回報格式不正確。')
    actual = Path.cwd().resolve()
    if Path(cwd).resolve() != actual:
        raise ValueError('指令回報位置不符。')
    label = 'home' if actual == reporter.home.resolve() else 'project' if actual == reporter.project.resolve() else 'photos' if actual == (reporter.project / 'photos').resolve() else 'other'
    evidence = dict(observed=True, exit_code=exit_code, cwd=label)
    error = None
    if exit_code:
        error = 'command_failed'
    elif task == 'terminal_ready':
        evidence['hook_ready'] = bool(flag)
        if not flag:
            error = 'hook_conflict'
    elif task == 'host_name':
        evidence['hostname_ok'] = hostname() == reporter.config['expected_hostname'] if reporter.config else False
        if not evidence['hostname_ok']:
            error = 'wrong_host'
    elif task == 'mkdir_photos':
        evidence['already_existed'] = bool(flag)
        evidence['folder_exists'] = checked_path(reporter.project, 'photos').is_dir()
        if not evidence['folder_exists']:
            error = 'missing_folder'
    elif task == 'enter_project':
        if label != 'project':
            error = 'wrong_directory'
    elif task == 'list_project':
        evidence['photos_listed'] = label == 'project' and checked_path(reporter.project, 'photos').is_dir()
        if not evidence['photos_listed']:
            error = 'missing_folder'
    if error:
        evidence['error_code'] = error
    if not reporter.emit(task, 'failed' if error else 'passed', evidence, asynchronous=False):
        raise ValueError('尚未設定有效的課程回報。')
    return 0


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


def execute(command, cwd, timeout=15, limit=65536, interactive=False, capture_apt_errors=False):
    """Bound student output and execution; apt is never killed by an automatic timeout."""
    process = subprocess.Popen(command, cwd=cwd, stdin=None if interactive else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=not interactive,
                               env={**os.environ, 'LC_ALL': 'C', 'PYTHONUNBUFFERED': '1'})
    chunks = deque(maxlen=64)
    overflow = threading.Event()
    apt_errors = set()

    def read():
        total = 0
        tail = b''
        while True:
            chunk = process.stdout.read1(1024)
            if not chunk:
                break
            chunks.append(chunk)
            if capture_apt_errors:
                joined = tail + chunk
                for marker in (b'Failed to fetch', b'Some index files failed', b'Temporary failure resolving', b'Err:'):
                    if marker in joined:
                        apt_errors.add(marker)
                tail = joined[-80:]
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
    if apt_errors:
        output += '\n' + '\n'.join(marker.decode() for marker in sorted(apt_errors))
    if not interactive:
        print(output, end='' if output.endswith('\n') else '\n')
    if overflow.is_set():
        raise CourseError('python_failed', '程式輸出過多，請檢查是否有無限迴圈。')
    return max(0, code) if code == 0 else max(1, abs(code)), output



def photo_snapshot(project):
    """Bounded local snapshot; never accept an existing filename as a new photo."""
    folder = checked_path(project, 'photos')
    if not folder.is_dir():
        raise CourseError('missing_folder', '請先建立 ~/pi-camera/photos。')
    result = {}
    for path in folder.iterdir():
        if path.suffix.lower() not in ('.jpg', '.jpeg', '.png'):
            continue
        if len(result) >= 5000:
            raise CourseError('photo_limit', '照片太多，請先整理到其他資料夾後重試。')
        if path.is_symlink() or not path.is_file():
            raise CourseError('photo_name', '照片必須是 photos 裡的實際檔案，不能使用連結。')
        stat = path.stat()
        result[path.name] = (stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
    return result


def new_student_photos(project, before, host):
    import cv2
    import numpy as np
    from datetime import datetime
    after = photo_snapshot(project)
    if any(after.get(name) != stamp for name, stamp in before.items()):
        raise CourseError('photo_overwritten', '舊照片被更改或刪除，請讓程式使用不重複的檔名。')
    names = sorted(after.keys() - before.keys())
    if not names:
        raise CourseError('photo_missing', '這次沒有新照片。請重新執行、按拍照，再按結束。')
    evidence = []
    for name in names:
        match = re.fullmatch(re.escape(host) + r'_([0-9]{8}_[0-9]{6}_[0-9]{6})\.jpg', name)
        try:
            if not match:
                raise ValueError()
            datetime.strptime(match[1], '%Y%m%d_%H%M%S_%f')
        except ValueError:
            raise CourseError('photo_name', '照片檔名請用 ' + host + '_年月日_時分秒_微秒.jpg。') from None
        path = project / 'photos' / name
        if after[name][1] <= 0 or after[name][1] > 32 * 1024 * 1024:
            raise CourseError('save_failed', '照片為空檔或太大，請檢查存檔方式。')
        with path.open('rb') as stream:
            data = stream.read(32 * 1024 * 1024 + 1)
        if not data.startswith(b'\xff\xd8') or len(data) > 32 * 1024 * 1024:
            raise CourseError('save_failed', '照片不是可讀取的 JPG。')
        image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise CourseError('save_failed', '照片無法開啟，請重新拍照。')
        height, width = image.shape[:2]
        if (width, height) != (1920, 1080):
            raise CourseError('camera_size', '照片必須是 1920×1080；不要只放大小張照片。')
        evidence.append(dict(readable=True, fresh_photo=True, width=width, height=height,
                             bytes=len(data), file_name=name, photo_count=len(names), verifier='student-v1'))
    return evidence[-1]


def probe_camera():
    """Probe in a separate process so an unresponsive driver cannot hang the runner."""
    command = """import cv2,sys
cap=cv2.VideoCapture(sys.argv[1],cv2.CAP_V4L2)
try:
    ok=False
    if cap.isOpened():
        for _ in range(8):
            ret,frame=cap.read()
            if ret and frame is not None and frame.size:
                ok=True
                break
    sys.exit(0 if ok else 1)
finally:
    cap.release()
"""
    devices = capture_devices()
    if not devices:
        raise CourseError('camera_missing', '程式已結束，但找不到 USB 相機。請重新接好相機後重試。')
    for device in devices:
        try:
            code = subprocess.run([PYTHON, '-c', command, device], stdout=subprocess.DEVNULL,
                                  stderr=subprocess.DEVNULL, timeout=8).returncode
            if code == 0:
                return device
        except subprocess.TimeoutExpired:
            continue
    raise CourseError('camera_busy', '程式已結束，但相機還不能重新取像。請關閉其他相機程式後重試。')


def run_student_camera(reporter):
    project = reporter.project
    script = checked_path(project, hostname() + '_camera.py')
    if not script.is_file():
        raise CourseError('missing_script', '請在 Thonny 儲存為 ' + str(script) + '。')
    try:
        import cv2
    except ImportError:
        raise CourseError('environment_missing', '請先安裝拍照工具。') from None
    before = photo_snapshot(project)
    print('開啟本組程式：' + script.name + '。請預覽、拍照，最後按程式的結束按鈕；結束後才檢查。', flush=True)
    code, _ = execute([PYTHON, str(script)], project, timeout=None, interactive=True)
    if code:
        raise CourseError('python_failed', '程式沒有正常結束，請保留終端機錯誤，修改並儲存後重試。')
    first_error = None
    photo = None
    for task in ('photo', 'camera_exit'):
        reporter.emit(task, 'running', {'verifier': 'student-v1'})
        try:
            evidence = new_student_photos(project, before, hostname()) if task == 'photo' else {'verifier': 'student-v1', 'camera_reopened': True, 'device': probe_camera()}
            reporter.emit(task, 'passed', evidence)
            if task == 'photo':
                photo = evidence
        except (CourseError, OSError, UnicodeError) as error:
            problem = error if isinstance(error, CourseError) else CourseError('save_failed' if task == 'photo' else 'camera_read', '照片或相機檢查失敗，請保留本機畫面並找助教。')
            reporter.emit(task, 'failed', {'verifier': 'student-v1', 'error_code': problem.code})
            first_error = first_error or problem
    if first_error:
        raise first_error
    print('本次新增 ' + str(photo['photo_count']) + ' 張可讀取的 1920×1080 JPG；相機可再次取像。')
    print('預覽、畫面品質、是否由相機原始尺寸取像，請再親眼確認。')
    return {'verifier': 'student-v1', 'script_name': script.name, 'exit_code': 0}, None



# These are fixed classroom operations, not an arbitrary shell execution API.
OPENCV_CODE = 'import cv2; import tkinter; print(cv2.__version__)'


def resolve_classroom_command(command):
    command = list(command)
    if command[:1] == ['--']:
        command = command[1:]
    fixed = {('sudo', 'apt', 'update'): 'update',
             ('sudo', 'apt', 'install', '-y', 'v4l-utils', 'python3-opencv', 'python3-tk'): 'install',
             ('/usr/bin/python3', '-c', OPENCV_CODE): 'opencv',
             ('v4l2-ctl', '--list-devices'): 'camera_list'}
    if tuple(command) in fixed:
        return fixed[tuple(command)], None
    expected_script = Path.home() / 'pi-camera' / (hostname() + '_camera.py')
    if command == ['/usr/bin/python3', str(expected_script)]:
        return 'camera-student', None
    if len(command) == 4 and command[:2] == ['v4l2-ctl', '-d'] and re.fullmatch(r'/dev/video[0-9]{1,3}', command[2]):
        task = {'--list-formats-ext': 'camera_formats', '--all': 'camera_info'}.get(command[3])
        if task:
            return task, command[2]
    raise ValueError('這不是課程指定指令，請從網頁重新複製完整的一行。')


def run_environment_step(task, reporter, device=None):
    if task == 'opencv':
        code, output = execute([PYTHON, '-c', OPENCV_CODE], reporter.home)
        if code or not re.fullmatch(r'[0-9][0-9A-Za-z.+_-]{0,39}', output.strip()):
            raise CourseError('environment_missing', 'OpenCV 或介面套件還不能載入，請先完成上一行安裝。')
        return {'cv2_ok': True, 'tk_ok': True, 'opencv_version': output.strip(), 'python_version': sys.version.split()[0]}, None
    if task == 'camera_list':
        try:
            code, _ = execute(['v4l2-ctl', '--list-devices'], reporter.home)
        except FileNotFoundError:
            raise CourseError('environment_missing', '找不到 v4l2-ctl，請先安裝相機工具。') from None
        devices = capture_devices() if code == 0 else []
        if not devices:
            raise CourseError('camera_missing', '沒有找到可取像的 USB 相機，請確認相機接在樹莓派。')
        print('可用 USB 相機：' + ', '.join(devices))
        return {'v4l_ok': True, 'device': devices[0]}, None
    if task in ('camera_formats', 'camera_info'):
        if device not in capture_devices():
            raise CourseError('camera_missing', '選定的位置不是可取像的 USB 相機，請依上一行結果重新選擇。')
        option = '--list-formats-ext' if task == 'camera_formats' else '--all'
        code, output = execute(['v4l2-ctl', '-d', device, option], reporter.home)
        if code or not output.strip():
            raise CourseError('camera_read', '相機查詢失敗，請保留終端機畫面並重新確認相機位置。')
        result = {'v4l_ok': True, 'device': device}
        if task == 'camera_formats':
            mjpeg = re.search(r"'MJPG'(?P<body>.*?)(?=\n\s*\[\d+\]:|\Z)", output, re.S)
            if not mjpeg or not re.search(r'\b1920x1080\b', mjpeg['body']):
                raise CourseError('camera_size', '這個相機位置沒有列出 MJPG 1920x1080，請助教確認。')
            result['supports_1080p'] = True
        return result, None
    raise ValueError('不支援的環境檢查。')


def run_task(task, reporter, device=None):
    home, project = reporter.home, reporter.project
    group = hostname()[-2:]
    if task in ('opencv', 'camera_list', 'camera_formats', 'camera_info'):
        return run_environment_step(task, reporter, device)
    if task == 'camera-student':
        return run_student_camera(reporter)
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
        code, output = execute(command, home, timeout=None, interactive=True, capture_apt_errors=task == 'update')
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
    parser.add_argument('task', choices=['setup', 'flush', 'observe', 'sender', *TASKS])
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    device = None
    if args.task == 'run':
        task, device = resolve_classroom_command(args.command)
    else:
        if args.command and args.task != 'observe':
            raise ValueError('這個操作不需要額外參數，請從網頁重新複製。')
        task = args.task
    if os.geteuid() == 0:
        raise ValueError('請用 user 執行課程工具，不要在整行前面加 sudo。')
    if args.task == 'setup':
        setup()
        return 0
    if args.task == 'sender':
        send_forever()
        return 0
    reporter = Reporter()
    if args.task == 'observe':
        observer = argparse.ArgumentParser()
        observer.add_argument('operation', choices=OBSERVED)
        observer.add_argument('exit_code', type=int)
        observer.add_argument('cwd')
        observer.add_argument('flag', type=int)
        observed = observer.parse_args(args.command)
        result = observed_task(reporter, observed.operation, observed.exit_code, observed.cwd, observed.flag)
        ensure_sender()
        return result
    if args.task == 'flush':
        delivered = reporter.flush(blocking=True)
        print('待送紀錄已送達網頁。' if delivered else delivery_message(reporter, False).replace('本機檢查通過；', ''))
        if reporter.config and not delivered:
            ensure_sender()
        return 0
    event_task = 'student_camera' if task == 'camera-student' else task
    with lock(reporter.directory, 'operation.lock', blocking=False):
        heartbeat_stop = threading.Event()
        heartbeat_thread = None
        def stop_heartbeat():
            heartbeat_stop.set()
            if heartbeat_thread:
                heartbeat_thread.join(timeout=10)
        def heartbeat():
            while not heartbeat_stop.wait(30):
                try:
                    reporter.emit(event_task, 'running')
                except (CourseError, OSError, ValueError):
                    return
        if task in ('update', 'install', 'camera-student'):
            heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
            heartbeat_thread.start()
        if task != 'camera-install':
            reporter.emit(event_task, 'running')
        try:
            evidence, network = run_task(task, reporter, device=device) if device else run_task(task, reporter)
            stop_heartbeat()
            if evidence is not None:
                reporter.emit(event_task, 'passed', evidence, network)
            result = 0
        except (CourseError, OSError, UnicodeError, KeyboardInterrupt) as error:
            stop_heartbeat()
            code = error.code if isinstance(error, CourseError) else 'interrupted' if isinstance(error, KeyboardInterrupt) else 'unknown'
            if task == 'camera-student':
                for child in ('photo', 'camera_exit'):
                    if reporter.task_statuses.get((child, reporter.run_id)) == 'running':
                        reporter.emit(child, 'cancelled', {'verifier': 'student-v1', 'error_code': code})
            if task != 'camera-install':
                reporter.emit(event_task, 'cancelled' if code == 'interrupted' else 'failed', {'error_code': code})
            print(str(error) if isinstance(error, CourseError) else '本次操作已中斷。' if isinstance(error, KeyboardInterrupt) else '檔案或裝置操作失敗，請保留終端機畫面並請助教確認。', file=sys.stderr)
            result = 1
        finally:
            stop_heartbeat()
            delivered = reporter.flush(blocking=True)
            if reporter.config and not delivered:
                ensure_sender()
    if result == 0:
        if task == 'camera-install':
            print('本次操作完成。統一程式已放入本機；這個舊版取得步驟不另外回報。')
        elif evidence is None:
            print('程式已結束，請查看網頁各項檢查結果。' + ('' if delivered else '回報尚未送達，連線恢復後會自動補送。'))
        else:
            print('本次操作完成。' + delivery_message(reporter, delivered))
    elif reporter.config and not delivered:
        print('本次錯誤結果尚未送達網頁；請保留畫面，連線恢復後會自動補送。', file=sys.stderr)
    return result


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, CourseError, OSError, EOFError, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, (ValueError, CourseError)) else '操作中斷或設定讀取失敗，請助教確認。', file=sys.stderr)
        sys.exit(1)
