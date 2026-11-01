"""Cross-UID regression: root imports only a tiny temp fixture, never installs services."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def installer(path, name):
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec = importlib.util.spec_from_file_location(name, ROOT / path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.dont_write_bytecode = previous


@unittest.skipUnless(hasattr(os, 'geteuid') and os.geteuid() == 0, 'Requires an isolated root process to reproduce cross-UID permissions')
class InstallerPermissionsTests(unittest.TestCase):
    def exercise(self, loader, expect_cache):
        with tempfile.TemporaryDirectory(prefix='pi-helper-permission-test-') as temporary:
            base = Path(temporary)
            base.chmod(0o755)
            os.chown(base, 1000, 1000)
            stage = base / 'student-stage'
            stage.mkdir(mode=0o700)
            os.chown(stage, 1000, 1000)
            source = stage / 'fixture.py'
            source.write_text('VALUE = 42\n')
            previous = sys.dont_write_bytecode
            previous_mask = os.umask(0o022)
            sys.dont_write_bytecode = False
            try:
                self.assertEqual(loader(source, 'permission_fixture').VALUE, 42)
            finally:
                sys.dont_write_bytecode = previous
                os.umask(previous_mask)
            cache = stage / '__pycache__'
            self.assertEqual(cache.exists(), expect_cache)
            if expect_cache:
                self.assertEqual(cache.stat().st_uid, 0)
                self.assertEqual(stat.S_IMODE(cache.stat().st_mode), 0o755)
            result = subprocess.run([sys.executable, '-c', 'import shutil,sys; shutil.rmtree(sys.argv[1])', str(stage)],
                                    user=1000, group=1000, extra_groups=[], capture_output=True, text=True)
            if expect_cache:
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('PermissionError', result.stderr)
                self.assertIn('.pyc', result.stderr)
            else:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertFalse(stage.exists())

    def test_published_120_reproduces_root_cache_cleanup_failure(self):
        old = installer('tooling/releases/1.2.0/install.py', 'installer_120')
        self.exercise(old.load_module, True)

    def test_fixed_installer_leaves_the_student_temp_directory_removable(self):
        fixed = installer('tooling/install.py', 'installer_fixed')
        self.exercise(fixed.load_module, False)


if __name__ == '__main__':
    unittest.main()
