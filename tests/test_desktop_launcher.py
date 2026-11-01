"""PCManFM regression in an isolated root/Xvfb session; no classroom network."""
import importlib.util
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import unittest
import uuid
from unittest import mock

spec=importlib.util.spec_from_file_location('launcher_updater',Path(__file__).resolve().parents[1]/'tooling/updater.py')
updater=importlib.util.module_from_spec(spec);spec.loader.exec_module(updater)


@unittest.skipUnless(os.environ.get('PI_HELPER_TEST_DESKTOP_LAUNCHER')=='1' and os.environ.get('DISPLAY') and os.geteuid()==0 and shutil.which('pcmanfm') and shutil.which('xdotool'),
                     'Needs an isolated root Xvfb/DBus session with pcmanfm and xdotool')
class DesktopLauncherTests(unittest.TestCase):
    def prompt(self):
        result=subprocess.run(['xdotool','search','--onlyvisible','--name','^Execute File$'],capture_output=True,text=True)
        return result.returncode==0

    def wait(self,condition):
        deadline=time.monotonic()+8
        while time.monotonic()<deadline:
            if condition():return
            time.sleep(.05)
        self.fail('PCManFM did not reach the expected launch state')

    def launch(self,path,condition):
        process=subprocess.Popen(['pcmanfm',str(path)],env=self.fm_env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
        try:self.wait(condition)
        finally:
            if process.poll() is None:
                os.killpg(process.pid,signal.SIGTERM)
                try:process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid,signal.SIGKILL);process.wait()

    def test_registered_application_shortcut_launches_repeatedly_without_execute_dialog(self):
        program=Path.home()/'.local/share/pi-helper-course/updater.py'
        if program.exists() or program.is_symlink():self.skipTest('Refuse to overwrite an existing classroom tool')
        system=Path('/usr/local/share/applications')/('pi-helper-test-'+uuid.uuid4().hex+'.desktop')
        with tempfile.TemporaryDirectory(prefix='pi-helper-launcher-test-') as directory:
            home=Path(directory);desktop=home/'Desktop';marker=home/'opened.txt'
            preferences=home/'.config/libfm/libfm.conf';preferences.parent.mkdir(parents=True)
            preferences.write_text('[config]\nquick_exec=0\n')
            self.fm_env={**os.environ,'XDG_CONFIG_HOME':str(home/'.config'),'LC_ALL':'C.UTF-8'}
            # The real registered entry runs the current user's program, as normal.
            program.parent.mkdir(parents=True,exist_ok=True)
            program.write_text('from pathlib import Path\np=Path('+repr(str(marker))+')\nwith p.open("a") as f: f.write("opened\\n")\n')
            try:
                with mock.patch.object(updater,'SYSTEM_LAUNCHER',system),mock.patch.object(updater,'desktop_directory',return_value=desktop):
                    updater.install_system_launcher();updater.install_shortcuts(home)
                link=desktop/'pi-helper-tools.desktop';fixed=link.read_text()
                # Reproduce 1.5.0's exact Application-entry behaviour first.
                link.write_text((home/'.local/share/applications/pi-helper-tools.desktop').read_text());link.chmod(0o755)
                self.launch(link,self.prompt);self.assertFalse(marker.exists())
                link.write_text(fixed);link.chmod(0o644)
                for count in (1,2,3):
                    self.launch(link,lambda:marker.exists() and len(marker.read_text().splitlines())==count)
                    self.assertFalse(self.prompt())
                self.assertEqual(marker.read_text(),'opened\n'*3)
            finally:
                program.unlink(missing_ok=True);system.unlink(missing_ok=True)


if __name__=='__main__':unittest.main()
