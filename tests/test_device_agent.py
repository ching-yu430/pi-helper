"""Host-side tests; never install a service or contact a production server."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('pi_reporter', Path(__file__).resolve().parents[1] / 'device-agent/pi_reporter.py')
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class ReporterTests(unittest.TestCase):
    def config(self):
        return dict(url='https://example.supabase.co', key='sb_publishable_test',
                    device_token='a' * 64, expected_hostname='pi5-03')

    def test_camera_counts_physical_usb_devices_not_video_nodes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            usb = root / 'usb1/1-1'
            usb.mkdir(parents=True)
            (usb / 'idVendor').write_text('0001')
            (usb / 'idProduct').write_text('0002')
            (usb / 'video0').mkdir()
            (usb / 'video1').mkdir()
            nodes = root / 'class'
            nodes.mkdir()
            (nodes / 'video0').symlink_to(usb / 'video0')
            (nodes / 'video1').symlink_to(usb / 'video1')
            (root / 'nonusb').mkdir()
            (nodes / 'video2').symlink_to(root / 'nonusb')
            self.assertEqual(agent.usb_cameras(nodes), 1)
            self.assertEqual(agent.usb_cameras(root / 'missing'), 0)

    def test_display_config_precedence_and_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(agent.display_backend(root), 'unknown')
            (root / 'lightdm.conf.d').mkdir()
            (root / 'lightdm.conf.d/10-default.conf').write_text('[Seat:*]\nuser-session=labwc\n')
            self.assertEqual(agent.display_backend(root), 'wayland')
            (root / 'lightdm.conf').write_text('[Seat:*]\n#user-session=labwc\nuser-session=LXDE-pi-x\n')
            self.assertEqual(agent.display_backend(root), 'x11')
            (root / 'lightdm.conf').write_text('[Seat:*]\nuser-session=custom-session\n')
            self.assertEqual(agent.display_backend(root), 'unknown')

    def test_missing_tools_are_unknown_not_false_success(self):
        with patch.object(agent, 'run', return_value=(None, '')):
            self.assertEqual(agent.service_state('xrdp'), 'unknown')
            self.assertIsNone(agent.installed('xrdp'))
        with patch.object(agent, 'run', side_effect=[(3, 'unknown'), (0, 'not-found')]):
            self.assertEqual(agent.service_state('xrdp'), 'missing')
        with patch.object(agent, 'run', side_effect=[(4, 'inactive'), (0, 'not-found')]):
            self.assertEqual(agent.service_state('xrdp'), 'missing')
        with patch.object(agent, 'run', return_value=(2, '')):
            self.assertIsNone(agent.installed('xrdp'))

    def test_config_rejects_admin_keys_arbitrary_urls_and_extra_commands(self):
        self.assertEqual(agent.validate(self.config()), self.config())
        for field, value in [('url', 'http://example.supabase.co'), ('url', 'https://example.supabase.co@evil.test'), ('key', 'sb_secret_never'), ('expected_hostname', 'pi5-00'), ('device_token', 'wrong')]:
            with self.assertRaises(ValueError):
                agent.validate({**self.config(), field: value})
        with self.assertRaises(ValueError):
            agent.validate({**self.config(), 'command': 'never execute'})

    def test_transport_limits_payload_and_does_not_log_server_bodies(self):
        captured = []

        def send(request, timeout):
            self.assertEqual(timeout, 10)
            captured.append(json.loads(request.data))
            return io.BytesIO(b'true')

        with patch.object(agent.urllib.request, 'urlopen', side_effect=send):
            agent.report(self.config(), {'hostname': 'pi5-03'})
        self.assertEqual(set(captured[0]), {'p_device_token', 'p_snapshot'})
        error = urllib.error.HTTPError('https://example.supabase.co', 403, '', {}, io.BytesIO(b'{"message":"DEVICE_DENIED","secret":"must-not-leak"}'))
        with patch.object(agent.urllib.request, 'urlopen', side_effect=error), self.assertRaisesRegex(RuntimeError, '設備憑證已停用') as result:
            agent.report(self.config(), {})
        self.assertNotIn('must-not-leak', str(result.exception))
        with patch.object(agent.urllib.request, 'urlopen', side_effect=TimeoutError()), self.assertRaisesRegex(RuntimeError, '自動重試'):
            agent.report(self.config(), {})

    def test_wrong_group_stops_before_network_or_installation(self):
        code = base64.b64encode(json.dumps(self.config()).encode()).decode()
        with patch.object(agent.os, 'geteuid', return_value=0), patch.object(agent.getpass, 'getpass', return_value=code), patch.object(agent.socket, 'gethostname', return_value='pi5-04'), patch.object(agent, 'report') as report:
            with self.assertRaisesRegex(ValueError, '尚未安裝'):
                agent.install()
            report.assert_not_called()

    def test_install_writes_restricted_config_and_a_nonroot_service(self):
        config = self.config()
        code = base64.b64encode(json.dumps(config).encode()).decode()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script, service, settings = root / 'lib/reporter.py', root / 'reporter.service', root / 'config.json'
            with patch.object(agent, 'CONFIG', settings), patch.object(agent, 'SCRIPT', script), patch.object(agent, 'SERVICE', service), patch.object(agent.os, 'geteuid', return_value=0), patch.object(agent.os, 'fchown') as chown, patch.object(agent.getpass, 'getpass', return_value=code), patch.object(agent.socket, 'gethostname', return_value='pi5-03'), patch.object(agent.pwd, 'getpwnam', return_value=SimpleNamespace(pw_gid=1234)), patch.object(agent, 'run', return_value=(0, 'systemd')), patch.object(agent, 'collect', return_value={}), patch.object(agent, 'report') as report, patch.object(agent.subprocess, 'run') as command, patch('sys.stdout', new=io.StringIO()) as output:
                agent.install()
                report.assert_called_once_with(config, {})
                self.assertEqual(json.loads(settings.read_text()), config)
                self.assertEqual(settings.stat().st_mode & 0o777, 0o640)
                self.assertEqual(chown.call_args.args[1:], (0, 1234))
                self.assertIn('User=pi-helper-reporter', service.read_text())
                self.assertIn('NoNewPrivileges=true', service.read_text())
                self.assertTrue(script.exists())
                self.assertEqual(command.call_args_list[-1].args[0], ['systemctl', 'restart', 'pi-helper-device.service'])
                self.assertNotIn(config['device_token'], output.getvalue())


if __name__ == '__main__':
    unittest.main()
