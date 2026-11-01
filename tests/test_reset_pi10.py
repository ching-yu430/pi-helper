import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('reset_pi10', ROOT / 'tooling/reset_pi10.py')
reset = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reset)


class ResetPiTests(unittest.TestCase):
    def test_registered_desktop_launcher_is_recognised_without_matching_other_apps(self):
        command = "from pathlib import Path; import runpy; runpy.run_path(str(Path.home()/'.local/share/pi-helper-course/updater.py'),run_name='__main__')"
        self.assertTrue(reset.is_tool_command(Path('/home/user'), ['/usr/bin/python3', '-c', command]))
        self.assertFalse(reset.is_tool_command(Path('/home/user'), ['/usr/bin/python3', '-c', 'print("hello")']))

    def test_only_test_host_can_run(self):
        with mock.patch.object(reset.socket, 'gethostname', return_value='pi5-01'), mock.patch('sys.argv', ['reset']):
            with self.assertRaisesRegex(ValueError, 'pi5-10'):
                reset.main()

    def test_preview_changes_nothing_and_apply_preserves_exercises_and_unrelated_files(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            bashrc = home / '.bashrc'
            bashrc.write_text('alias mine="echo keep"\n' + reset.BEGIN + '\nsource managed\n' + reset.END + '\n')
            project = home / 'pi-camera'
            project.mkdir()
            (project / 'hello.py').write_text('print("第 10 組")')
            other = home / 'other.py'
            other.write_text('keep')
            releases = home / '.local/share/pi-helper-tools/releases/test'
            releases.mkdir(parents=True)
            (home / '.local/share/pi-helper-course').symlink_to(releases, target_is_directory=True)
            (home / 'pi-course').write_text('managed')
            original = bashrc.read_text()
            with mock.patch.object(reset, 'desktop_paths', return_value=set()), mock.patch.object(reset, 'stop_user_tools') as stop, mock.patch.object(reset.subprocess, 'run') as run:
                reset.reset(home)
                self.assertEqual(bashrc.read_text(), original)
                self.assertTrue(project.exists())
                run.assert_not_called()
                reset.reset(home, True)
                stop.assert_called_once_with(home)
                self.assertEqual(run.call_args_list[0].args[0], ['sudo', '-v'])
            self.assertFalse((home / 'pi-course').exists())
            self.assertFalse((home / '.local/share/pi-helper-course').is_symlink())
            self.assertFalse(project.exists())
            backup = next((home / 'pi-helper-reset-backups').iterdir())
            self.assertEqual((backup / 'pi-camera/hello.py').read_text(), 'print("第 10 組")')
            self.assertEqual((backup / 'bashrc-before-reset').read_text(), original)
            self.assertEqual(bashrc.read_text(), 'alias mine="echo keep"\n')
            self.assertEqual(other.read_text(), 'keep')

    def test_malformed_bashrc_and_external_parent_are_rejected_before_mutation(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as external:
            home = Path(directory)
            (home / '.bashrc').write_text(reset.BEGIN)
            with self.assertRaises(ValueError):
                reset.reset(home, True)
            (home / '.bashrc').unlink()
            (home / '.config').symlink_to(external, target_is_directory=True)
            with self.assertRaises(ValueError):
                reset.reset(home, True)

    def test_system_cleanup_uses_only_fixed_tool_paths_and_dedicated_account(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = tuple(str(Path(directory) / name) for name in ('service', 'config', 'program', 'launcher'))
            for path in paths:
                Path(path).write_text('managed')
            unrelated = Path(directory) / 'xrdp.service'
            unrelated.write_text('keep')
            with mock.patch.object(reset, 'SYSTEM_PATHS', paths), mock.patch.object(reset.os, 'geteuid', return_value=0), mock.patch.object(reset.pwd, 'getpwnam'), mock.patch.object(reset.subprocess, 'run') as run:
                reset.system_cleanup()
                self.assertIn(mock.call(['systemctl', 'disable', '--now', 'pi-helper-device.service'], check=True), run.call_args_list)
                self.assertIn(mock.call(['userdel', 'pi-helper-reporter'], check=True), run.call_args_list)
            self.assertTrue(all(not Path(path).exists() for path in paths))
            self.assertEqual(unrelated.read_text(), 'keep')

    def test_only_managed_user_process_is_stopped(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            script = home / '.local/share/pi-helper-course/fixture.py'
            script.parent.mkdir(parents=True)
            script.write_text('import time; time.sleep(30)')
            child = subprocess.Popen(['/usr/bin/python3', str(script)])
            try:
                self.assertIn(child.pid, list(reset.tool_processes(home)))
                reset.stop_user_tools(home)
                self.assertIsNotNone(child.wait(timeout=3))
            finally:
                if child.poll() is None:
                    child.kill()
                child.wait()


if __name__ == '__main__':
    unittest.main()
