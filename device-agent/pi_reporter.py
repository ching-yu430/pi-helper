#!/usr/bin/env python3
"""Pi classroom status reporter. Standard library only; no remote commands."""
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

CONFIG = Path('/etc/pi-helper-device.json')
SCRIPT = Path('/usr/local/lib/pi-helper-device/pi_reporter.py')
SERVICE = Path('/etc/systemd/system/pi-helper-device.service')
ACCOUNT = 'pi-helper-reporter'


def run(*args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=5, check=False)
        return result.returncode, result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return None, ''


def service_state(name):
    _, text = run('systemctl', 'is-active', name)
    if text in ('active', 'failed', 'activating', 'deactivating'):
        return text
    code, load = run('systemctl', 'show', name, '--property=LoadState', '--value')
    if code == 0 and load == 'not-found':
        return 'missing'
    return 'inactive' if text == 'inactive' and code == 0 and load in ('loaded', 'masked') else 'unknown'


def installed(name):
    code, text = run('dpkg-query', '-W', '-f=${Status}', name)
    return text == 'install ok installed' if code in (0, 1) else None


def display_backend(root=Path('/etc/lightdm')):
    # Report the configured desktop backend, not whether RDP login succeeded.
    sessions = []
    files = [*sorted((root / 'lightdm.conf.d').glob('*.conf')), root / 'lightdm.conf']
    for file in files:
        try:
            sessions += re.findall(r'^\s*user-session\s*=\s*([^\s#]+)', file.read_text(), re.M)
        except OSError:
            pass
    if not sessions:
        return 'unknown'
    value = sessions[-1].lower()
    if 'wayland' in value or 'labwc' in value or 'wayfire' in value:
        return 'wayland'
    return 'x11' if value in ('lxde-pi-x', 'lxde-pi', 'lxde', 'openbox') else 'unknown'


def usb_cameras(root=Path('/sys/class/video4linux')):
    # A single camera can expose multiple nodes. Count unique USB devices.
    devices = set()
    try:
        for node in root.glob('video*'):
            for parent in (node.resolve(), *node.resolve().parents):
                if (parent / 'idVendor').exists() and (parent / 'idProduct').exists():
                    devices.add(str(parent))
                    break
        return len(devices)
    except OSError:
        return None


def collect():
    code, version = run('python3', '--version')
    version = version if code == 0 and re.fullmatch(r'Python \d+\.\d+\.\d+', version) else None
    try:
        uptime = int(float(Path('/proc/uptime').read_text().split()[0]))
    except (OSError, ValueError, IndexError):
        uptime = None
    try:
        free_mb = shutil.disk_usage('/').free // (1024 * 1024)
    except OSError:
        free_mb = None
    return dict(hostname=socket.gethostname().split('.')[0], ssh=service_state('ssh'),
                xrdp=service_state('xrdp'), display=display_backend(),
                xrdp_installed=installed('xrdp'), xorgxrdp_installed=installed('xorgxrdp'),
                python_version=version, usb_cameras=usb_cameras(),
                free_mb=free_mb, uptime_seconds=uptime)


def validate(config):
    if set(config) != {'url', 'key', 'device_token', 'expected_hostname'}:
        raise ValueError('安裝設定碼格式不正確，請重新複製。')
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
    if not re.fullmatch(r'[a-f0-9]{64}', str(config['device_token'])):
        raise ValueError('設備憑證格式不正確。')
    if not re.fullmatch(r'pi5-(?:0[1-9]|[1-9][0-9])', str(config['expected_hostname'])):
        raise ValueError('組別主機名稱不正確。')
    return config


def report(config, snapshot):
    data = json.dumps({'p_device_token': config['device_token'], 'p_snapshot': snapshot}).encode()
    headers = {'apikey': config['key'], 'Content-Type': 'application/json'}
    if config['key'].startswith('eyJ'):
        headers['Authorization'] = 'Bearer ' + config['key']
    request = urllib.request.Request(config['url'] + '/rest/v1/rpc/pi_helper_device_report', data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if json.loads(response.read(1024)) is not True:
                raise RuntimeError('伺服器未確認收到回報。')
    except urllib.error.HTTPError as error:
        # Do not log response bodies, connection keys or device tokens.
        try:
            message = json.loads(error.read(2048)).get('message')
        except (ValueError, OSError):
            message = None
        messages = {'DEVICE_DENIED': '設備憑證已停用，請助教重新配對。',
                    'ROOM_NOT_FOUND': '課堂已關閉、到期或組別未開放。',
                    'DEVICE_TOO_FREQUENT': '回報間隔太短，稍後再試。',
                    'INVALID_DEVICE_REPORT': '設備資料格式不符，請更新回報程式。'}
        raise RuntimeError(messages.get(message, '無法送出回報，請檢查網路與資料庫升級。')) from None
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        raise RuntimeError('網路暫時無法連線，稍後自動重試。') from None


def install(config=None, report_first=True):
    if os.geteuid() != 0:
        raise ValueError('請使用 sudo python3 /tmp/pi-helper-device.py install 執行。')
    if config is None:
        encoded = getpass.getpass('貼上工作台提供的安裝設定碼，再按 Enter（輸入不顯示）：').strip()
        if len(encoded) > 8192:
            raise ValueError('安裝設定碼過長。')
        try:
            config = validate(json.loads(base64.b64decode(encoded, validate=True)))
        except (ValueError, TypeError, KeyError):
            raise ValueError('安裝設定碼不正確，請回工作台重新複製。') from None
    else:
        config = validate(config)
    if socket.gethostname().split('.')[0] != config['expected_hostname']:
        raise ValueError('這台 Pi 的主機名稱不是 ' + config['expected_hostname'] + '，請先確認組別；尚未安裝。')
    if run('systemctl', '--version')[0] != 0:
        raise ValueError('此安裝方式需要 Raspberry Pi OS 的 systemd。')
    if report_first:
        report(config, collect())
    try:
        pwd.getpwnam(ACCOUNT)
    except KeyError:
        subprocess.run(['useradd', '--system', '--user-group', '--no-create-home', '--shell', '/usr/sbin/nologin', ACCOUNT], check=True)
    SCRIPT.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    shutil.copyfile(Path(__file__).resolve(), SCRIPT)
    SCRIPT.chmod(0o644)
    # Root owns configuration; only the dedicated service group can read it.
    descriptor = os.open(CONFIG, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o640)
    with os.fdopen(descriptor, 'w') as output:
        os.fchmod(output.fileno(), 0o640)
        os.fchown(output.fileno(), 0, pwd.getpwnam(ACCOUNT).pw_gid)
        json.dump(config, output)
    SERVICE.write_text('''[Unit]
Description=Pi classroom device status reporter
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi-helper-reporter
Group=pi-helper-reporter
ExecStart=/usr/bin/python3 /usr/local/lib/pi-helper-device/pi_reporter.py run
Restart=on-failure
RestartSec=30
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectControlGroups=true
UMask=0077

[Install]
WantedBy=multi-user.target
''')
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'enable', 'pi-helper-device.service'], check=True)
    subprocess.run(['systemctl', 'restart', 'pi-helper-device.service'], check=True)
    print('已安裝並送出第一筆回報。請助教在看板確認本組設備狀態；之後每 30 秒回報。')


def main():
    parser = argparse.ArgumentParser(description='樹莓派課堂設備回報；不提供遠端操作。')
    parser.add_argument('action', choices=['install', 'run', 'once'])
    parser.add_argument('--config', type=Path, default=CONFIG)
    args = parser.parse_args()
    if args.action == 'install':
        install()
        return
    config = validate(json.loads(args.config.read_text()))
    delay = 30
    while True:
        try:
            report(config, collect())
            delay = 30
            print('設備狀態已回報。', flush=True)
        except RuntimeError as error:
            print(str(error), file=sys.stderr, flush=True)
            if args.action == 'once':
                raise SystemExit(1)
            delay = min(delay * 2, 300)
        if args.action == 'once':
            return
        time.sleep(delay)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        # Never emit config content or a traceback containing credentials.
        print(str(error) if isinstance(error, (ValueError, RuntimeError)) else '執行失敗，請助教檢查檔案權限與安裝狀態。', file=sys.stderr)
        raise SystemExit(1)
