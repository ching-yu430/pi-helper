#!/usr/bin/env python3
"""Group-bound desktop update client. Only approved, hash-verified releases run."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import queue
import re
import shlex
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

SYSTEM_LAUNCHER = Path('/usr/local/share/applications/pi-helper-tools.desktop')


def install_system_launcher():
    """A static menu entry, launched as the desktop user (never as root)."""
    if os.geteuid() != 0:
        raise PermissionError('需要 Pi 安裝權限。')
    command = ('from pathlib import Path; import runpy; '
               "runpy.run_path(str(Path.home()/'.local/share/pi-helper-course/updater.py'),run_name='__main__')")
    entry = ('[Desktop Entry]\nType=Application\nName=課堂工具\nComment=查看與更新本組課堂工具\n'
             'Icon=system-software-update\nTerminal=false\nCategories=Education;\nExec=/usr/bin/python3 -c "' + command + '"\n')
    SYSTEM_LAUNCHER.parent.mkdir(parents=True, exist_ok=True)
    # The directory is root-owned. Replace only this app's entry atomically.
    fd, temporary = tempfile.mkstemp(prefix='.pi-helper-', dir=SYSTEM_LAUNCHER.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(entry)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
        os.replace(temporary, SYSTEM_LAUNCHER)
    finally:
        Path(temporary).unlink(missing_ok=True)

def installer(home=None):
    path = (Path.home() if home is None else Path(home)) / '.local/share/pi-helper-course/installer.py'
    spec = importlib.util.spec_from_file_location('desktop_bootstrap', path)
    module = importlib.util.module_from_spec(spec)
    previous = sys.dont_write_bytecode
    try:
        sys.dont_write_bytecode = True
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous
    return module


def desktop_directory(home):
    try:
        result = subprocess.run(['xdg-user-dir', 'DESKTOP'], capture_output=True, text=True, timeout=3, check=True)
        path = Path(result.stdout.strip())
        if path.is_absolute() and path.resolve().is_relative_to(home.resolve()) and path.resolve() != home.resolve():
            return path
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    return home / 'Desktop'


def install_shortcuts(home):
    home = Path(home)
    program = home / '.local/share/pi-helper-course/updater.py'
    command = '/usr/bin/python3 ' + json.dumps(str(program), ensure_ascii=False).replace('%', '%%')
    entry = ('[Desktop Entry]\nType=Application\nName=課堂工具\nComment=查看與更新本組課堂工具\n'
             'Icon=system-software-update\nTerminal=false\nCategories=Education;\nExec=' + command + '\n')
    desktop = desktop_directory(home) / 'pi-helper-tools.desktop'
    # PCManFM recognises a Link to a registered system application as a desktop
    # shortcut. A copied Application entry prompts Execute every time, even 0644.
    link = ('[Desktop Entry]\nType=Link\nName=課堂工具\nComment=查看與更新本組課堂工具\n'
            'Icon=system-software-update\nURL=' + str(SYSTEM_LAUNCHER) + '\n')
    for path, data in [(desktop, link), (home / '.local/share/applications/pi-helper-tools.desktop', entry),
                       (home / '.config/autostart/pi-helper-tools.desktop', entry.replace('Exec=' + command, 'Exec=' + command + ' --notify'))]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)
        path.chmod(0o644)
    # Only sudo receives this helper's stdout; no password is saved or logged.
    helper = home / '.local/share/pi-helper-tools/askpass'
    helper.parent.mkdir(parents=True, exist_ok=True)
    helper.write_text('#!/bin/sh\nexec /usr/bin/python3 ' + shlex.quote(str(program)) + ' --askpass\n')
    helper.chmod(0o700)
    try:
        subprocess.run(['gio', 'set', str(desktop), 'metadata::trusted', 'true'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3, check=False)
    except (OSError, subprocess.SubprocessError):
        pass


def start_notifier(home):
    if os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY'):
        try:
            subprocess.Popen(['/usr/bin/python3', str(Path(home) / '.local/share/pi-helper-course/updater.py'), '--notify'],
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        except OSError:
            pass


def start_report_sender(home):
    # Desktop login also recovers an offline outbox after a reboot, without
    # waiting for the next student command. The sender holds its own user lock.
    try:
        subprocess.Popen(['/usr/bin/python3', str(Path(home) / '.local/share/pi-helper-course/pi_course.py'), 'sender'],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        pass


def session_lock(home, kind):
    directory = Path(home) / '.config/pi-helper-install'
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    display = hashlib.sha256((os.environ.get('DISPLAY', '') + os.environ.get('WAYLAND_DISPLAY', '')).encode()).hexdigest()[:12]
    fd = os.open(directory / (kind + '-' + display + '.lock'), os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    stream = os.fdopen(fd, 'w')
    try:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        stream.close()
        return None
    return stream


def owns(job, secret):
    return bool(secret and job.get('request_origin') == 'desktop' and
                hashlib.sha256(secret.encode()).hexdigest()[:8].upper() == job.get('request_code'))


def presentation(job, secret=''):
    """One main action; website and desktop use the same approved job."""
    if not job or job['status'] in ('completed', 'cancelled'):
        return ('更新完成' if job and job['status'] == 'completed' else '目前沒有更新任務', '更新後請關閉舊終端機，再開新終端機開始操作。' if job and job['status']=='completed' else '可以關閉，繼續上課。', None)
    if not job.get('desktop_supported'):
        return ('請助教重新指派', '這個版本不支援桌面更新，請指派 1.5.0 以上。', None)
    if job.get('claim_expired'):
        return ('更新授權已到期', '請助教重新指派，再重新申請更新。', None)
    if not owns(job, secret):
        if job.get('claim_until'):
            return ('另一個安裝正在處理', '請找助教確認原本的安裝，不要重複申請。', None)
        return ('本組有工具更新', '按下申請，再請助教核對畫面上的核對碼。', 'request')
    if job['status'] == 'pending' or job['status'] == 'approved' and job.get('approval_expired'):
        return ('等待助教核准', '請助教在網頁「課堂工具」核對組別與核對碼。', 'request' if not job.get('request_active') else None)
    if job['status'] in ('approved', 'failed', 'installing'):
        text = '需要修改系統服務，稍後可能詢問 Pi 密碼。' if job.get('update_mode') == 'system' else '只更新課堂工具，不需要 Pi 密碼。'
        if job['status'] == 'failed':
            text = '上次未完成，可按重試；仍失敗請找助教。'
        return ('已核准，可以更新' if job['status'] == 'approved' else '更新尚未完成', text, 'update')
    return ('請找助教確認', '暫時無法判斷更新狀態。', None)


class Client:
    def __init__(self, home=None):
        self.home = Path.home() if home is None else Path(home)
        self.bootstrap = installer(self.home)
        self.hostname = socket.gethostname().split('.')[0]

    def config(self):
        value = json.loads((self.home / '.config/pi-helper-course/config.json').read_text())
        # Reuse the same strict URL/public-key/hostname validation as the installer.
        self.bootstrap.validate_ticket(dict(url=value['url'], key=value['key'], expected_hostname=value['expected_hostname'],
                                            job_id='11111111-1111-4111-8111-111111111111', request_secret='a' * 64))
        if value['expected_hostname'] != self.hostname or not re.fullmatch('[a-f0-9]{64}', value['course_token']):
            raise ValueError('本機配對不符，請找助教確認。')
        return value

    def rpc(self, name, args):
        config = self.config()  # Reload after a deliberate rebind; never keep revoked credentials.
        return self.bootstrap.rpc(config, name, dict(p_course_token=config['course_token'], p_hostname=self.hostname, **args))

    def status(self):
        return self.rpc('pi_helper_tool_desktop_status', {})

    def secret(self, job, create=False):
        if not job:
            return ''
        if not re.fullmatch('[a-f0-9-]{36}', job['id']):
            raise ValueError('更新資料不正確。')
        path = self.home / '.config/pi-helper-install' / ('desktop-' + job['id'] + '.json')
        if path.exists():
            value = json.loads(path.read_text()).get('request_secret', '')
            if re.fullmatch('[a-f0-9]{64}', value):
                return value
        if not create:
            return ''
        value = os.urandom(32).hex()
        self.bootstrap.atomic_json(path, dict(request_secret=value))
        return value

    def request(self, job):
        return self.rpc('pi_helper_tool_desktop_request', dict(p_request_secret=self.secret(job, create=True)))

    def update(self, job):
        secret = self.secret(job)
        if not owns(job, secret):
            raise ValueError('請先申請更新並等待助教核准。')
        config = self.config()
        ticket = self.bootstrap.validate_ticket(dict(url=config['url'], key=config['key'], job_id=job['id'],
                                 request_secret=secret, expected_hostname=self.hostname))
        version, checksum = job['version'], job['bootstrap_sha256']
        if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version) or not re.fullmatch('[a-f0-9]{64}', checksum):
            raise ValueError('更新資料不正確。')
        with urllib.request.urlopen(self.bootstrap.ORIGIN + version + '/install.py', timeout=30) as response:
            data = response.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != checksum:
            raise ValueError('下載校驗失敗，尚未執行更新。')
        with tempfile.TemporaryDirectory(prefix='pi-helper-update-') as directory:
            path = Path(directory)
            (path / 'install.py').write_bytes(data)
            self.bootstrap.atomic_json(path / 'ticket.json', ticket)
            env = {**os.environ, 'SUDO_ASKPASS': str(self.home / '.local/share/pi-helper-tools/askpass')}
            args = ['/usr/bin/python3', '-B', str(path / 'install.py'), '--gui', '--ticket-file', str(path / 'ticket.json')]
            if job.get('update_mode') == 'user':
                args.append('--desktop')
            # Output may contain apt messages; keep it local, bounded, and never show
            # subprocess argv / ticket / passwords in the desktop or on the website.
            with tempfile.TemporaryFile() as log:
                result = subprocess.run(args, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
            if result.returncode:
                raise RuntimeError('更新未完成，請按重試；仍失敗請找助教。')


def safe_error(error):
    if isinstance(error, FileNotFoundError):
        return '本機設定不完整，請找助教完成首次安裝。'
    code = getattr(error, 'code', '')
    if code == 'TOOL_EXPIRED':
        return '核准已到期，請助教重新指派或核准。'
    if code in ('TOOL_DENIED', 'TOOL_HOST_MISMATCH'):
        return '本機配對或授權已變更，請找助教。'
    if code == 'TOOL_REQUEST_EXISTS':
        return '另一個視窗已申請更新，請找助教確認。'
    if code == 'TOOL_ALREADY_CLAIMED':
        return '已有安裝在處理，請找助教確認。'
    if code == 'TOOL_VERSION':
        return '請助教指派 1.5.0 以上版本。'
    return '暫時無法完成，請確認網路後重試；仍失敗請找助教。'


class Window:
    def __init__(self, client):
        import tkinter as tk
        from tkinter import ttk
        self.tk, self.client, self.events = tk, client, queue.Queue()
        self.busy, self.updating, self.action, self.job = False, False, None, None
        self.root = tk.Tk()
        self.root.title('課堂工具')
        self.root.geometry('560x420')
        self.root.minsize(420, 350)
        self.root.configure(bg='#f1f5ef')
        style = ttk.Style(self.root)
        style.theme_use('clam')
        style.configure('Update.TButton', font=('sans', 14, 'bold'), padding=14, foreground='white', background='#205b45')
        style.map('Update.TButton', background=[('active', '#174b3c'), ('disabled', '#91b2a2')])
        frame = tk.Frame(self.root, bg='white', padx=24, pady=24)
        frame.pack(fill='both', expand=True, padx=16, pady=16)
        def label(size, bold=False):
            widget = tk.Label(frame, bg='white', fg='#163c32', font=('sans', size, 'bold' if bold else 'normal'), anchor='w', justify='left', wraplength=460)
            widget.pack(fill='x', pady=(0, 14))
            return widget
        self.group, self.version, self.state, self.code, self.message = label(19, True), label(11), label(17, True), label(14, True), label(12)
        frame.bind('<Configure>', lambda event: [widget.config(wraplength=max(260, event.width - 48)) for widget in
                   (self.group, self.version, self.state, self.code, self.message)])
        self.group.config(text=client.hostname + '｜課堂工具')
        self.button = ttk.Button(frame, text='重新檢查', command=self.clicked, style='Update.TButton')
        self.button.pack(fill='x', side='bottom')
        self.state.config(text='正在檢查更新…')
        self.root.protocol('WM_DELETE_WINDOW', self.close)
        self.root.after(100, self.refresh)
        self.root.after(100, self.drain)

    def work(self, name, function):
        if self.busy:
            return
        self.busy = True
        self.button.state(['disabled'])
        def run():
            try:
                self.events.put((name, function(), None))
            except Exception as error:
                self.events.put((name, None, error))
        threading.Thread(target=run, daemon=True).start()

    def refresh(self):
        if not self.busy:
            self.work('status', self.client.status)
        self.root.after(5000, self.refresh)

    def drain(self):
        try:
            while True:
                name, value, error = self.events.get_nowait()
                self.busy = self.updating = False
                if error:
                    self.message.config(text=safe_error(error))
                    self.button.state(['!disabled'])
                    self.button.config(text='重試', command=self.clicked)
                    if name == 'status':
                        self.action = 'refresh'
                        self.state.config(text='無法取得最新狀態')
                elif name == 'status':
                    self.paint(value)
                else:
                    self.work('status', self.client.status)
        except queue.Empty:
            pass
        self.root.after(100, self.drain)

    def paint(self, data):
        self.job = data.get('job')
        title, message, self.action = presentation(self.job, self.client.secret(self.job))
        self.state.config(text=title)
        self.message.config(text=message)
        self.version.config(text='已安裝：' + (data.get('installed_version') or '尚未確認') + ('　→　' + self.job['version'] if self.job and self.job['status'] not in ('completed', 'cancelled') else ''))
        self.code.config(text='核對碼：' + self.job['request_code'] if self.job and self.job.get('request_code') else '')
        self.button.config(text={'request': '申請更新', 'update': '立即更新'}.get(self.action, '重新檢查'))
        self.button.state(['!disabled'])

    def clicked(self):
        if self.busy:
            return
        if self.action == 'request':
            self.work('request', lambda: self.client.request(self.job))
        elif self.action == 'update':
            self.updating = True
            self.state.config(text='正在更新，請保持開啟')
            self.message.config(text='更新後會確認設備與課程回報，可能需要約一分鐘。')
            self.work('update', lambda: self.client.update(self.job))
        else:
            self.work('status', self.client.status)

    def close(self):
        if self.updating:
            self.message.config(text='正在更新，請等完成後再關閉。')
        else:
            self.root.destroy()

    def run(self):
        self.root.mainloop()


def notify(client):
    lock = session_lock(client.home, 'notify')
    if not lock:
        return
    seen = None
    source = Path(__file__).read_bytes()
    while True:
        try:
            # Exit the old notifier after self-update; installer starts the new one.
            current = client.home / '.local/share/pi-helper-course/updater.py'
            if current.resolve() != Path(__file__).resolve() or current.read_bytes() != source:
                lock.close()
                start_notifier(client.home)
                return
            job = client.status().get('job')
            title, _, action = presentation(job, client.secret(job))
            signature = (job['id'], job['status']) if job else None
            if job and action in ('request', 'update') and signature != seen:
                seen = signature
                try:
                    subprocess.run(['notify-send', '--app-name=課堂工具', '課堂工具', title], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3, check=False)
                except (OSError, subprocess.SubprocessError):
                    pass
                subprocess.Popen(['/usr/bin/python3', str(Path(__file__).resolve())], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        except Exception:
            pass  # A temporary outage must not flood students with popup windows.
        time.sleep(30)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--notify', action='store_true')
    parser.add_argument('--askpass', action='store_true')
    args = parser.parse_args()
    if args.askpass:
        import tkinter as tk
        from tkinter import simpledialog
        root = tk.Tk()
        root.withdraw()
        value = simpledialog.askstring('課堂工具｜Pi 密碼', '這次更新需要修改系統服務。\n請輸入這台樹莓派的密碼（不是後台密碼）：', show='*', parent=root)
        root.destroy()
        if value is None:
            return 1
        print(value)
        return 0
    client = Client()
    start_report_sender(client.home)
    if args.notify:
        notify(client)
    else:
        lock = session_lock(client.home, 'window')
        if lock:
            Window(client).run()
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        # A broken/missing initial pairing should still open a comprehensible window.
        if '--notify' not in sys.argv and '--askpass' not in sys.argv:
            try:
                from tkinter import messagebox
                messagebox.showerror('課堂工具', '課堂工具尚未設定完成，請找助教重新指派安裝。')
            except Exception:
                pass
        sys.exit(1)
