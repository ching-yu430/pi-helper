#!/usr/bin/env python3
"""Remove this project's tools on the pi5-10 test machine, preserving exercises."""
import argparse
from datetime import datetime
import os
from pathlib import Path
import pwd
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time

SERVICE = 'pi-helper-device.service'
SYSTEM_PATHS = ('/etc/systemd/system/pi-helper-device.service', '/etc/pi-helper-device.json',
                '/etc/systemd/system/multi-user.target.wants/pi-helper-device.service',
                '/usr/local/lib/pi-helper-device', '/usr/local/share/applications/pi-helper-tools.desktop')
USER_PATHS = ('pi-course', '.config/pi-helper-course', '.config/pi-helper-install',
              '.local/share/pi-helper-course', '.local/share/pi-helper-tools',
              '.local/share/applications/pi-helper-tools.desktop', '.config/autostart/pi-helper-tools.desktop')
BEGIN, END = '# >>> pi-helper course shell >>>', '# <<< pi-helper course shell <<<'


def without_hook(text):
    if text.count(BEGIN) != text.count(END) or text.count(BEGIN) > 1:
        raise ValueError('.bashrc 的課程區塊不完整，尚未清除；請保留畫面找助教。')
    return re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n?', '', text, flags=re.S)


def remove(path):
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)


def system_cleanup():
    if os.geteuid() != 0:
        raise ValueError('系統清除需要 sudo 權限。')
    if Path(SYSTEM_PATHS[0]).exists():
        subprocess.run(['systemctl', 'disable', '--now', SERVICE], check=True)
    for name in SYSTEM_PATHS:
        remove(Path(name))
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'reset-failed', SERVICE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        pwd.getpwnam('pi-helper-reporter')
    except KeyError:
        pass
    else:
        subprocess.run(['userdel', 'pi-helper-reporter'], check=True)


def is_tool_command(home, args):
    roots = (str(home / '.local/share/pi-helper-course') + '/', str(home / '.local/share/pi-helper-tools/releases') + '/')
    launcher = "runpy.run_path(str(Path.home()/'.local/share/pi-helper-course/updater.py'),run_name='__main__')"
    return any(arg == str(home / 'pi-course') or arg.startswith(roots) for arg in args) or (
        len(args) > 2 and args[1] == '-c' and launcher in args[2])


def tool_processes(home):
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit() or int(entry.name) == os.getpid():
            continue
        try:
            if entry.stat().st_uid != os.geteuid():
                continue
            args = (entry / 'cmdline').read_bytes().decode(errors='replace').split('\0')
            if is_tool_command(home, args):
                yield int(entry.name)
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue


def stop_user_tools(home):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        for pid in tool_processes(home):
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass
        if sig == signal.SIGTERM:
            time.sleep(1)


def desktop_paths(home):
    paths = {home / 'Desktop/pi-helper-tools.desktop', home / '桌面/pi-helper-tools.desktop'}
    try:
        result = subprocess.run(['xdg-user-dir', 'DESKTOP'], capture_output=True, text=True, check=True, timeout=3)
        desktop = Path(result.stdout.strip())
        if desktop.is_absolute() and desktop.resolve().is_relative_to(home.resolve()):
            paths.add(desktop / 'pi-helper-tools.desktop')
    except (OSError, subprocess.SubprocessError):
        pass
    return paths


def reset(home, apply=False):
    home = home.resolve()
    bashrc = home / '.bashrc'
    if bashrc.is_symlink():
        raise ValueError('.bashrc 是連結，請助教先確認；尚未清除。')
    old = bashrc.read_text() if bashrc.exists() else ''
    clean = without_hook(old)
    targets = [home / name for name in USER_PATHS] + sorted(desktop_paths(home))
    for path in targets:
        if not path.parent.resolve().is_relative_to(home):
            raise ValueError('課程工具的上層目錄指向家目錄以外；尚未清除。')
    print('將移除課程回報、桌面更新工具、捷徑與配對設定。')
    print('pi-camera 練習資料會移到家目錄的 pi-helper-reset-backups，不會刪掉。')
    print('保留 SSH、遠端桌面、熱點設定及系統套件。')
    if not apply:
        print('目前只預覽；加上 --apply 才會清除。')
        return
    backup_root = home / 'pi-helper-reset-backups'
    if backup_root.is_symlink():
        raise ValueError('備份資料夾是連結，尚未清除。')
    subprocess.run(['sudo', '-v'], check=True)
    backup_root.mkdir(exist_ok=True, mode=0o700)
    backup = backup_root / datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup.mkdir(mode=0o700)
    if bashrc.exists():
        shutil.copy2(bashrc, backup / 'bashrc-before-reset')
    # Disable desktop autostart before stopping its existing processes.
    remove(home / '.config/autostart/pi-helper-tools.desktop')
    stop_user_tools(home)
    subprocess.run(['sudo', '/usr/bin/python3', '-B', str(Path(__file__).resolve()), '--system'], check=True)
    project = home / 'pi-camera'
    if project.exists() or project.is_symlink():
        project.rename(backup / 'pi-camera')
    if clean != old:
        fd, name = tempfile.mkstemp(prefix='.bashrc-pi-helper-reset-', dir=home)
        temporary = Path(name)
        try:
            with os.fdopen(fd, 'w') as stream:
                stream.write(clean)
                os.fchmod(stream.fileno(), bashrc.stat().st_mode & 0o777)
            os.replace(temporary, bashrc)
        finally:
            temporary.unlink(missing_ok=True)
    for path in targets:
        remove(path)
    print('清除完成。練習與終端機設定備份：' + str(backup))
    print('請關閉所有舊終端機，再開新視窗。之後重裝要在後台重新指派第 10 組，並勾選「重新綁定」。')
    print('網頁中的舊回報不會被本機清除；重新綁定後需重新執行練習。')


def main():
    parser = argparse.ArgumentParser(description='僅供 pi5-10 測試機還原課程工具。')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--system', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if socket.gethostname().split('.')[0] != 'pi5-10':
        raise ValueError('這台不是 pi5-10，拒絕清除。')
    if args.system:
        system_cleanup()
    else:
        if os.geteuid() == 0 or pwd.getpwuid(os.geteuid()).pw_name != 'user':
            raise ValueError('請在 pi5-10 的 user 帳號執行，整行前面不要加 sudo。')
        reset(Path.home(), args.apply)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print('還原未完成：' + str(error), file=sys.stderr)
        sys.exit(1)
