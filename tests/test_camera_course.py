import base64
import importlib.util
import io
import json
from pathlib import Path
import socket
import sys
import subprocess
import tempfile
import queue
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


course = load('pi_course', ROOT / 'courseware/pi_course.py')
camera = load('camera_app', ROOT / 'courseware/camera_app.py')


class CourseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.project = self.home / 'pi-camera'
        self.host_patch = patch.object(course, 'hostname', return_value='pi5-03')
        self.host_patch.start()

    def tearDown(self):
        self.host_patch.stop()
        self.tmp.cleanup()

    def reporter(self):
        return course.Reporter(self.home)

    def test_folder_check_does_not_do_the_exercise(self):
        with self.assertRaisesRegex(course.CourseError, '先建立'):
            course.run_task('folders', self.reporter())
        self.assertFalse(self.project.exists())
        (self.project / 'photos').mkdir(parents=True)
        evidence, _ = course.run_task('folders', self.reporter())
        self.assertTrue(evidence['folders_ok'])
        self.assertEqual(list((self.project / 'photos').iterdir()), [])

    def test_hello_runs_actual_student_code_and_requires_group_output(self):
        self.project.mkdir()
        script = self.project / 'hello.py'
        script.write_text('print("第 03 組")\n')
        with patch('sys.stdout', new=io.StringIO()):
            evidence, _ = course.run_task('hello', self.reporter())
        self.assertTrue(evidence['group_output'])
        script.write_text('print("第 04 組")\n')
        with patch('sys.stdout', new=io.StringIO()), self.assertRaisesRegex(course.CourseError, '本組名稱'):
            course.run_task('hello', self.reporter())
        script.write_text('raise RuntimeError("broken")\n')
        with patch('sys.stdout', new=io.StringIO()), self.assertRaisesRegex(course.CourseError, '執行失敗'):
            course.run_task('hello', self.reporter())

    def test_old_text_file_is_not_a_new_success(self):
        self.project.mkdir()
        (self.project / 'message.txt').write_text('第 03 組')
        script = self.project / 'write_note.py'
        script.write_text('print("not writing")\n')
        with patch('sys.stdout', new=io.StringIO()), self.assertRaisesRegex(course.CourseError, '舊的檔案|舊檔案|之前留下'):
            course.run_task('write', self.reporter())
        script.write_text('from pathlib import Path\nPath("message.txt").write_text("第 03 組")\n')
        with patch('sys.stdout', new=io.StringIO()):
            evidence, _ = course.run_task('write', self.reporter())
        self.assertTrue(evidence['new_file'])

    def test_symlink_script_outside_course_is_rejected(self):
        self.project.mkdir()
        outside = self.home / 'private.py'
        outside.write_text('print("第 03 組")')
        (self.project / 'hello.py').symlink_to(outside)
        with self.assertRaises(course.CourseError):
            course.run_task('hello', self.reporter())

    def setup_config(self):
        config = dict(url='https://example.supabase.co', key='sb_publishable_test', course_token='a' * 64, expected_hostname='pi5-03')
        code = base64.b64encode(json.dumps(config).encode()).decode()
        with patch.object(course.getpass, 'getpass', return_value=code), patch('sys.stdout', new=io.StringIO()):
            course.setup(self.home)
        return config, code

    def test_offline_queue_is_ordered_and_same_pair_setup_preserves_sequence(self):
        config, code = self.setup_config()
        launcher = self.home / 'pi-course'
        self.assertEqual(launcher.read_text(), course.LAUNCHER)
        self.assertEqual(launcher.stat().st_mode & 0o777, 0o755)
        reporter = self.reporter()
        with patch.object(course.threading.Thread, 'start'):
            reporter.emit('hello', 'running')
            reporter.emit('hello', 'passed', {'group_output': True, 'exit_code': 0})
        pending = reporter.directory / 'pending.json'
        self.assertEqual([e['sequence'] for e in json.loads(pending.read_text())['events']], [1, 2])
        with patch.object(course.getpass, 'getpass', return_value=code), patch('sys.stdout', new=io.StringIO()):
            course.setup(self.home)
        self.assertEqual(json.loads(pending.read_text())['sequence'], 2)
        sent = []
        def send(request, timeout):
            body = json.loads(request.data)
            sent.append(body['p_event']['sequence'])
            self.assertEqual(body['p_course_token'], config['course_token'])
            self.assertNotIn('p_teacher_code', body)
            return io.BytesIO(b'true')
        with patch.object(course.urllib.request, 'urlopen', side_effect=OSError()):
            reporter.flush(blocking=True)
        self.assertEqual(len(json.loads(pending.read_text())['events']), 2)
        with patch.object(course.urllib.request, 'urlopen', side_effect=send):
            reporter.flush(blocking=True)
        self.assertEqual(sent, [1, 2])
        self.assertEqual(json.loads(pending.read_text())['events'], [])
        self.assertEqual((reporter.directory / 'config.json').stat().st_mode & 0o777, 0o600)

    def test_setup_wrong_host_does_not_create_credentials(self):
        code = base64.b64encode(json.dumps(dict(url='https://example.supabase.co', key='sb_publishable_test', course_token='a' * 64, expected_hostname='pi5-10')).encode()).decode()
        with patch.object(course.getpass, 'getpass', return_value=code), self.assertRaises(course.CourseError):
            course.setup(self.home)
        self.assertFalse((self.home / '.config/pi-helper-course/config.json').exists())


class StudentCameraTests(unittest.TestCase):
    setUp = CourseTests.setUp
    tearDown = CourseTests.tearDown
    reporter = CourseTests.reporter
    def photo(self, name='pi5-03_20261031_153000_123456.jpg', width=1920, height=1080):
        import cv2
        import numpy as np
        folder = self.project / 'photos'
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / name
        self.assertTrue(cv2.imwrite(str(path), np.zeros((height, width, 3), dtype=np.uint8)))
        return path

    def fixture(self):
        # The child really executes Python and writes a new JPEG. No GUI/camera is simulated as verified.
        import base64
        image = self.photo()
        encoded = base64.b64encode(image.read_bytes()).decode()
        image.unlink()
        script = self.project / 'pi5-03_camera.py'
        script.write_text("from pathlib import Path\nimport base64\nPath('photos/pi5-03_20261031_153000_123456.jpg').write_bytes(base64.b64decode(" + repr(encoded) + "))\n")
        return script

    def test_student_script_actual_execution_reports_new_photo_then_reusable_camera(self):
        self.fixture()
        events = []
        reporter = self.reporter()
        reporter.emit = lambda *args: events.append(args)
        with patch.object(course, 'PYTHON', sys.executable), patch.object(course, 'probe_camera', return_value='/dev/video2'), patch('sys.stdout', new=io.TextIOWrapper(io.BytesIO(), encoding='utf-8')):
            evidence, _ = course.run_task('camera-student', reporter)
        self.assertEqual(evidence, dict(verifier='student-v1', script_name='pi5-03_camera.py', exit_code=0))
        self.assertEqual([e[0] for e in events], ['photo', 'camera_exit'])
        self.assertTrue(events[0][2]['fresh_photo'])
        self.assertEqual(events[0][2]['photo_count'], 1)
        self.assertTrue(events[1][2]['camera_reopened'])
        self.assertNotIn('released', events[1][2])

    def test_command_reports_running_and_final_pass_with_one_run(self):
        self.fixture()
        events = []
        reporter = self.reporter()
        reporter.emit = lambda *args: events.append(args)
        reporter.flush = lambda **kwargs: None
        with patch.object(course,'Reporter',return_value=reporter), patch.object(course.os,'geteuid',return_value=1000), patch.object(course.sys,'argv',['pi-course','camera-student']), patch.object(course,'PYTHON',sys.executable), patch.object(course,'probe_camera',return_value='/dev/video0'), patch('sys.stdout',new=io.TextIOWrapper(io.BytesIO(),encoding='utf-8')):
            self.assertEqual(course.main(),0)
        self.assertEqual([(e[0],e[1]) for e in events],[('student_camera','running'),('photo','passed'),('camera_exit','passed'),('student_camera','passed')])

    def test_command_cancellation_reports_no_success(self):
        events = []
        reporter = self.reporter()
        reporter.emit = lambda *args: events.append(args)
        reporter.flush = lambda **kwargs: None
        with patch.object(course,'Reporter',return_value=reporter), patch.object(course.os,'geteuid',return_value=1000), patch.object(course.sys,'argv',['pi-course','camera-student']), patch.object(course,'run_task',side_effect=course.CourseError('interrupted','stopped')), patch('sys.stderr',new=io.StringIO()):
            self.assertEqual(course.main(),1)
        self.assertEqual([(e[0],e[1]) for e in events],[('student_camera','running'),('student_camera','cancelled')])

    def test_existing_photo_is_not_new_even_if_correctly_named(self):
        self.photo()
        before = course.photo_snapshot(self.project)
        with self.assertRaises(course.CourseError) as caught:
            course.new_student_photos(self.project, before, 'pi5-03')
        self.assertEqual(caught.exception.code, 'photo_missing')

    def test_overwriting_an_old_photo_is_rejected(self):
        photo = self.photo()
        before = course.photo_snapshot(self.project)
        photo.write_bytes(photo.read_bytes())
        with self.assertRaises(course.CourseError) as caught:
            course.new_student_photos(self.project, before, 'pi5-03')
        self.assertEqual(caught.exception.code, 'photo_overwritten')

    def test_bad_name_wrong_group_invalid_date_and_bad_dimensions(self):
        for name, width, expected in [('pi5-04_20261031_153000_123456.jpg',1920,'photo_name'),('pi5-03_20261331_153000_123456.jpg',1920,'photo_name'),('pi5-03_20261031_153000_123456.jpg',640,'camera_size')]:
            photo = self.photo(name,width)
            with self.assertRaises(course.CourseError) as caught:
                course.new_student_photos(self.project, {}, 'pi5-03')
            self.assertEqual(caught.exception.code, expected)
            photo.unlink()

    def test_all_new_photos_are_checked_not_only_one_valid_photo(self):
        good = self.photo()
        bad = self.photo('pi5-03_20261031_153001_123456.jpg',640)
        with self.assertRaises(course.CourseError):
            course.new_student_photos(self.project, {}, 'pi5-03')
        bad.unlink()
        self.assertEqual(course.new_student_photos(self.project, {}, 'pi5-03')['photo_count'], 1)

    def test_corrupt_or_png_renamed_as_jpg_fails(self):
        import cv2
        import numpy as np
        path = self.photo()
        for data in [b'not a photo', b'\xff\xd8broken', cv2.imencode('.png',np.zeros((1080,1920,3),dtype=np.uint8))[1].tobytes()]:
            path.write_bytes(data)
            with self.assertRaises(course.CourseError) as caught:
                course.new_student_photos(self.project, {}, 'pi5-03')
            self.assertEqual(caught.exception.code, 'save_failed')

    def test_legacy_teacher_app_does_not_replace_group_program(self):
        (self.project / 'photos').mkdir(parents=True)
        (self.project / 'camera_app.py').write_text('print("legacy")')
        with self.assertRaises(course.CourseError) as caught:
            course.run_task('camera-student', self.reporter())
        self.assertEqual(caught.exception.code, 'missing_script')

    def test_program_failure_or_camera_failure_never_emits_passed_events(self):
        script = self.fixture()
        events = []
        reporter = self.reporter()
        reporter.emit = lambda *args: events.append(args)
        for fails in [True, False]:
            if fails:
                script.write_text('raise RuntimeError("test error")')
            else:
                self.fixture()
            with patch.object(course, 'PYTHON', sys.executable), patch.object(course, 'probe_camera', side_effect=course.CourseError('camera_busy','busy')), patch('sys.stdout', new=io.TextIOWrapper(io.BytesIO(), encoding='utf-8')), self.assertRaises(course.CourseError):
                course.run_task('camera-student', reporter)
            self.assertEqual(events, [])

    def test_photo_symlinks_are_not_followed(self):
        path = self.photo()
        outside = self.home / 'outside.jpg'
        path.rename(outside)
        path.symlink_to(outside)
        with self.assertRaises(course.CourseError):
            course.photo_snapshot(self.project)

    def test_unplugged_camera_has_a_distinct_error(self):
        with patch.object(course,'capture_devices',return_value=[]), self.assertRaises(course.CourseError) as caught:
            course.probe_camera()
        self.assertEqual(caught.exception.code,'camera_missing')

    def test_probe_timeout_is_bounded_and_next_camera_can_be_used(self):
        with patch.object(course,'capture_devices',return_value=['/dev/video0','/dev/video2']), patch.object(course.subprocess,'run',side_effect=[subprocess.TimeoutExpired('camera',8),subprocess.CompletedProcess([],0)]) as run:
            self.assertEqual(course.probe_camera(), '/dev/video2')
            self.assertTrue(all(call.kwargs['timeout']==8 for call in run.call_args_list))


class PhotoTests(unittest.TestCase):
    def test_reconnect_finds_camera_after_usb_node_changes(self):
        import cv2
        import numpy as np
        opened, events = [], []

        class Handle:
            def __init__(self, device, *_):
                self.device, self.closed = device, False
                opened.append(self)
            def isOpened(self):
                return True
            def set(self, *_):
                pass
            def read(self):
                if self.device == '/dev/video0':
                    return False, None
                return True, np.zeros((720, 1280, 3), dtype=np.uint8)
            def release(self):
                self.closed = True

        messages, frames = queue.Queue(), queue.Queue(maxsize=1)
        device_scan = SimpleNamespace(hostname=lambda: 'pi5-03', capture_devices=lambda: ['/dev/video2'])
        reporter = SimpleNamespace(emit=lambda *args: events.append(args))
        worker = camera.CameraWorker(cv2, device_scan, reporter, messages, frames, '/dev/video0', SimpleNamespace(count=0))
        with patch.object(cv2, 'VideoCapture', Handle):
            worker.start()
            try:
                self.assertEqual(messages.get(timeout=5)[0], 'error')
                worker.actions.put('retry')
                kind, text = messages.get(timeout=5)
                self.assertEqual(kind, 'preview')
                self.assertIn('/dev/video2', text)
            finally:
                worker.stop_requested.set()
                worker.join(timeout=5)
        self.assertFalse(worker.is_alive())
        self.assertEqual([handle.device for handle in opened], ['/dev/video0', '/dev/video2'])
        self.assertTrue(all(handle.closed for handle in opened))
        self.assertTrue(any(task == 'camera' and status == 'failed' for task, status, _ in events))
        self.assertTrue(any(task == 'camera' and status == 'passed' for task, status, _ in events))

    def test_camera_worker_reopens_for_photo_and_releases_every_handle(self):
        import cv2
        import numpy as np
        handles, events = [], []
        class Handle:
            def __init__(self, *_):
                self.width, self.height, self.closed = 1280, 720, False
                handles.append(self)
            def isOpened(self):
                return True
            def set(self, key, value):
                if key == cv2.CAP_PROP_FRAME_WIDTH:
                    self.width = value
                if key == cv2.CAP_PROP_FRAME_HEIGHT:
                    self.height = value
            def read(self):
                return True, np.zeros((self.height, self.width, 3), dtype=np.uint8)
            def release(self):
                self.closed = True
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / 'photos').mkdir()
            reporter = SimpleNamespace(project=project, emit=lambda *args: events.append(args))
            messages, frames = queue.Queue(), queue.Queue(maxsize=1)
            worker = camera.CameraWorker(cv2, SimpleNamespace(hostname=lambda:'pi5-03'), reporter, messages, frames, '/dev/video0', SimpleNamespace(count=2))
            ticks = iter(range(1000))
            with patch.object(cv2, 'VideoCapture', Handle), patch.object(camera.time, 'monotonic', side_effect=lambda:next(ticks)):
                worker.actions.put('photo')
                worker.start()
                while True:
                    kind, value = messages.get(timeout=5)
                    if kind == 'saved':
                        self.assertEqual(value[1]['width'], 1920)
                        worker.stop_requested.set()
                        break
                worker.join(timeout=5)
            self.assertFalse(worker.is_alive())
            self.assertTrue(handles and all(handle.closed for handle in handles))
            self.assertTrue(any(task=='photo' and status=='passed' for task,status,_ in events))
            self.assertTrue(any(task=='camera_exit' and status=='passed' and evidence['released'] for task,status,evidence in events))

    def test_real_jpeg_round_trip_unique_name_and_actual_size(self):
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / 'photos').mkdir()
            frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
            frame[:, :, 1] = 180
            first, evidence = camera.save_frame(cv2, frame, project, 'pi5-03')
            second, _ = camera.save_frame(cv2, frame, project, 'pi5-03')
            self.assertNotEqual(first, second)
            self.assertEqual((evidence['width'], evidence['height']), (1920, 1080))
            self.assertTrue(evidence['readable'])
            self.assertEqual(cv2.imread(str(first)).shape[:2], (1080, 1920))
            self.assertGreater(evidence['bytes'], 0)
            with self.assertRaises(RuntimeError):
                camera.save_frame(cv2, frame, project, '../other')

    def test_photo_failure_is_not_counted_as_success(self):
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / 'photos').mkdir()
            with patch.object(cv2, 'imencode', return_value=(False, None)), self.assertRaises(RuntimeError):
                camera.save_frame(cv2, np.zeros((10, 10, 3), dtype=np.uint8), project, 'pi5-03')
            self.assertEqual(list((project / 'photos').iterdir()), [])


if __name__ == '__main__':
    unittest.main()
