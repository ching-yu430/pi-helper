"""Actual Bash commands, local filesystem evidence, and offline delivery recovery."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('reporting_course',ROOT/'courseware/pi_course.py')
course=importlib.util.module_from_spec(spec);spec.loader.exec_module(course)


class ReportingAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.home=Path(self.temp.name)
        self.hostname=mock.patch.object(course,'hostname',return_value='pi5-03');self.hostname.start()
        self.config=dict(url='https://example.supabase.co',key='sb_publishable_test',expected_hostname='pi5-03',course_token='a'*64)
        with mock.patch('sys.stdout',new=io.StringIO()):course.setup(self.home,self.config)

    def tearDown(self):self.hostname.stop();self.temp.cleanup()
    def reporter(self):return course.Reporter(self.home)
    def events(self):return json.loads((self.home/'.config/pi-helper-course/pending.json').read_text())['events']

    def test_real_bash_preserves_cd_and_failure_codes_and_reports_each_course_command(self):
        shim=self.home/'.local/share/pi-helper-course/pi_course.py';shim.parent.mkdir(parents=True)
        shim.write_text('import importlib.util,sys\nfrom pathlib import Path\n'
          'spec=importlib.util.spec_from_file_location("course",'+repr(str(ROOT/'courseware/pi_course.py'))+')\n'
          'c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);c.hostname=lambda:"pi5-03"\n'
          'assert sys.argv[1]=="observe"\n'
          'sys.exit(c.observed_task(c.Reporter(Path('+repr(str(self.home))+')),sys.argv[2],int(sys.argv[3]),sys.argv[4],int(sys.argv[5])))\n')
        hook=self.home/'hook.bash'
        # Bind the script to this fixture's home; keep the actual Bash functions.
        hook.write_text((ROOT/'courseware/course_shell.bash').read_text().replace('__pi_helper_root=$HOME','__pi_helper_root='+shlex.quote(str(self.home))))
        script=self.home/'exercise.bash'
        script.write_text('alias ls="ls --color=auto"\nsource '+shlex.quote(str(hook))+'\n'
          'cd '+shlex.quote(str(self.home/'pi-camera'))+'\nprintf "FAILED_CD_STATUS=%s\\n" "$?"\n'
          'mkdir -p '+shlex.quote(str(self.home/'pi-camera/photos'))+'\n'
          'cd '+shlex.quote(str(self.home/'pi-camera'))+'\npwd\nls\n'
          'mkdir -p '+shlex.quote(str(self.home/'pi-camera/photos'))+'\n'
          'ls -aIphotos\nprintf "not-a-classroom-secret\\n"\n')
        result=subprocess.run(['bash','--noprofile','--norc','-i',str(script)],cwd=self.home,capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr);self.assertIn('FAILED_CD_STATUS=1',result.stdout);self.assertIn(str(self.home/'pi-camera'),result.stdout);self.assertIn('photos',result.stdout)
        events=self.events();self.assertEqual([e['task'] for e in events],['terminal_ready','enter_project','mkdir_photos','enter_project','working_dir','list_project','mkdir_photos'])
        self.assertEqual(events[1]['status'],'failed');self.assertEqual(events[3]['evidence']['cwd'],'project')
        self.assertTrue(events[-1]['evidence']['already_existed']);self.assertNotIn('not-a-classroom-secret',json.dumps(events))
        self.assertTrue(all(e['evidence']['observed'] for e in events))

    def test_setup_preserves_bashrc_content_and_is_idempotent(self):
        path=self.home/'.bashrc';path.write_text('alias mine="echo keep"\n')
        course.install_shell_hook(self.home);course.install_shell_hook(self.home)
        self.assertTrue(path.read_text().startswith('alias mine="echo keep"'));self.assertEqual(path.read_text().count('# >>> pi-helper course shell >>>'),1)

    def test_noninteractive_shells_are_untouched(self):
        script='source '+shlex.quote(str(ROOT/'courseware/course_shell.bash'))+'\ndeclare -F mkdir || true\n'
        result=subprocess.run(['bash','--noprofile','--norc','-c',script],capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,0);self.assertEqual(result.stdout,'');self.assertEqual(self.events(),[])

    def test_custom_shell_function_is_not_overwritten(self):
        root=self.home/'.local/share/pi-helper-course';root.mkdir(parents=True)
        trace=self.home/'ready.json'
        (root/'pi_course.py').write_text('import json,sys\nfrom pathlib import Path\nPath('+repr(str(trace))+').write_text(json.dumps(sys.argv[2:]))\n')
        hook=self.home/'hook.bash';hook.write_text((ROOT/'courseware/course_shell.bash').read_text().replace('__pi_helper_root=$HOME','__pi_helper_root='+shlex.quote(str(self.home))))
        script='function cd { printf "custom-cd\\n"; return 17; }\nsource '+shlex.quote(str(hook))+'\ncd somewhere\nprintf "status=%s\\n" "$?"\n'
        result=subprocess.run(['bash','--noprofile','--norc','-i','-c',script],cwd=self.home,capture_output=True,text=True,timeout=5)
        self.assertIn('custom-cd',result.stdout);self.assertIn('status=17',result.stdout);self.assertEqual(json.loads(trace.read_text()),['terminal_ready','0',str(self.home),'0'])

    def test_old_folder_check_does_not_invent_native_command_execution(self):
        (self.home/'pi-camera/photos').mkdir(parents=True)
        evidence,_=course.run_task('folders',self.reporter());self.assertNotIn('observed',evidence);self.assertEqual(self.events(),[])

    def test_observer_rejects_mismatched_cwd_and_records_real_failed_commands(self):
        reporter=self.reporter()
        with mock.patch.object(course.Path,'cwd',return_value=self.home):
            course.observed_task(reporter,'enter_project',1,str(self.home),0)
            with self.assertRaises(ValueError):course.observed_task(reporter,'list_project',0,str(self.home/'pi-camera'),0)
        self.assertEqual(self.events()[0]['status'],'failed');self.assertEqual(self.events()[0]['evidence']['exit_code'],1)

    def test_offline_results_are_not_silently_truncated(self):
        reporter=self.reporter()
        for _ in range(150):reporter.emit('hello','passed',dict(group_output=True,exit_code=0),asynchronous=False)
        self.assertEqual(len(self.events()),150);self.assertEqual(self.events()[0]['sequence'],1)

    def test_offline_heartbeat_keeps_first_and_latest_and_terminal_result(self):
        reporter=self.reporter()
        for _ in range(100):reporter.emit('install','running',asynchronous=False)
        reporter.emit('install','passed',dict(exit_code=0),asynchronous=False)
        events=self.events();self.assertEqual(len(events),3);self.assertEqual([e['sequence'] for e in events],[1,100,101])

    def test_sender_recovers_without_another_student_command(self):
        reporter=self.reporter();reporter.emit('hello','passed',dict(group_output=True,exit_code=0),asynchronous=False)
        stable=self.home/'.local/share/pi-helper-course/pi_course.py';stable.parent.mkdir(parents=True);stable.write_text('# fixture')
        results=[OSError('offline'),io.BytesIO(b'true')]
        original=course.paths
        with mock.patch.object(course,'paths',side_effect=lambda home=None:original(self.home)),mock.patch.object(course.urllib.request,'urlopen',side_effect=results),mock.patch.object(course.time,'sleep',side_effect=[None,None,StopIteration]):
            with self.assertRaises(StopIteration):course.send_forever()
        self.assertEqual(self.events(),[])

    def test_delivery_failure_is_explicit_and_keeps_safe_diagnostic(self):
        reporter=self.reporter();reporter.emit('hello','passed',dict(group_output=True,exit_code=0),asynchronous=False)
        error=urllib.error.HTTPError('https://example.supabase.co',400,'',{},io.BytesIO(b'{"message":"INVALID_COURSE_EVENT","detail":"secret-private-body"}'))
        with mock.patch.object(course.urllib.request,'urlopen',side_effect=error):self.assertFalse(reporter.flush(blocking=True))
        self.assertIn('更新 Supabase SQL',course.delivery_message(reporter,False));self.assertEqual(len(self.events()),1)
        self.assertNotIn('secret-private-body',(reporter.directory/'delivery-error.json').read_text())
        self.assertNotIn('已回報網頁',course.delivery_message(reporter,False))

    def test_apt_errors_survive_output_tail_truncation(self):
        with mock.patch('sys.stdout',new=io.TextIOWrapper(io.BytesIO(),encoding='utf-8')):
            code,output=course.execute([sys.executable,'-c',"print('Err: failed source');print('x'*100000)"],self.home,interactive=True,capture_apt_errors=True)
        self.assertEqual(code,0);self.assertIn('Err:',output)

    def test_interrupted_photo_validation_finishes_its_running_result(self):
        reporter=self.reporter();emit=reporter.emit
        def interrupted(task,reporter):
            reporter.emit('photo','running',{'verifier':'student-v1'});raise KeyboardInterrupt()
        with mock.patch.object(course,'Reporter',return_value=reporter),mock.patch.object(course,'run_task',side_effect=interrupted),mock.patch.object(course.os,'geteuid',return_value=1000),mock.patch.object(course.sys,'argv',['pi-course','camera-student']),mock.patch.object(reporter,'emit',side_effect=lambda *args,**kwargs:emit(*args,asynchronous=False,**kwargs)),mock.patch.object(reporter,'flush',return_value=False),mock.patch.object(course,'ensure_sender'),mock.patch('sys.stderr',new=io.StringIO()):
            self.assertEqual(course.main(),1)
        self.assertEqual([(e['task'],e['status']) for e in self.events()],[('student_camera','running'),('photo','running'),('photo','cancelled'),('student_camera','cancelled')])

    def test_changed_local_pairing_is_not_mislabelled_as_network_outage(self):
        reporter=self.reporter();path=reporter.directory/'pending.json';state=json.loads(path.read_text());state['tag']='outdated';path.write_text(json.dumps(state))
        self.assertFalse(reporter.flush(blocking=True));self.assertIn('配對',course.delivery_message(reporter,False));self.assertEqual(json.loads(path.read_text())['tag'],'outdated')


if __name__=='__main__':unittest.main()
