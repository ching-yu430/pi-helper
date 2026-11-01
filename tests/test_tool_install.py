import hashlib
from contextlib import contextmanager
import io
import sys
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import urllib.error
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]

def module(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj

installer = module('tooling/install.py', 'tool_installer')
course = module('courseware/pi_course.py', 'tool_course')


class ToolInstallTests(unittest.TestCase):
    def ticket(self):
        return dict(url='https://example.supabase.co', key='sb_publishable_test', job_id='11111111-1111-4111-8111-111111111111', request_secret='a'*64, expected_hostname='pi5-03')

    def test_ticket_is_group_bound_and_accepts_only_public_server_key(self):
        self.assertEqual(installer.validate_ticket(self.ticket()), self.ticket())
        for changes in [dict(url='http://example.supabase.co'),dict(key='service_role_secret'),dict(expected_hostname='pi5-00'),dict(request_secret='short'),dict(password='teacher')]:
            with self.assertRaises((ValueError, TypeError)):
                installer.validate_ticket({**self.ticket(), **changes})

    def test_wrong_pi_and_root_execution_stop_before_claim_or_sudo(self):
        with mock.patch.object(installer.os,'geteuid',return_value=1000),mock.patch.object(installer.socket,'gethostname',return_value='pi5-04'),mock.patch.object(installer,'rpc') as rpc,mock.patch.object(installer.subprocess,'run') as run:
            with self.assertRaisesRegex(ValueError,'pi5-03'):
                installer.install(self.ticket())
            rpc.assert_not_called();run.assert_not_called()
        with mock.patch.object(installer.os,'geteuid',return_value=0):
            with self.assertRaisesRegex(ValueError,'不要在整行前加 sudo'):
                installer.install(self.ticket())

    def test_hash_mismatch_never_accepts_downloaded_code(self):
        hashes={key:hashlib.sha256(b'expected').hexdigest() for key in installer.SOURCES}
        with self.assertRaisesRegex(ValueError,'尚未更新檔案'):
            installer.fetch_sources(hashes,fetch=lambda path:b'wrong source')
        with self.assertRaisesRegex(ValueError,'不完整'):
            installer.fetch_sources({'unexpected':'a'*64})

    def test_unified_update_preserves_photos_credentials_and_pending_events(self):
        files={key:(ROOT/path).read_bytes() for key,path in installer.SOURCES.items()}
        hashes={key:hashlib.sha256(body).hexdigest() for key,body in files.items()}
        version=json.loads((ROOT/'tooling/release.json').read_text())['version']
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp);directory=home/'.config/pi-helper-course';directory.mkdir(parents=True)
            config=dict(url=self.ticket()['url'],key=self.ticket()['key'],expected_hostname='pi5-03',course_token='c'*64)
            (directory/'config.json').write_text(json.dumps(config))
            queued=dict(tag=hashlib.sha256(config['course_token'].encode()).hexdigest(),sequence=42,events=[dict(sequence=42,task='hello')])
            (directory/'pending.json').write_text(json.dumps(queued));(home/'pi-course').write_text(course.LAUNCHER)
            photos=home/'pi-camera/photos';photos.mkdir(parents=True);(photos/'keep.jpg').write_bytes(b'photo')
            student=home/'pi-camera/pi5-03_camera.py';student.write_text('# student-owned AI application\n')
            device=dict(url=config['url'],key=config['key'],expected_hostname='pi5-03',device_token='d'*64)
            calls=[]
            def run(args,**kwargs):
                calls.append((args,kwargs))
                return subprocess.CompletedProcess(args,0,stdout=json.dumps(device) if args[-1]=='read-device' else '')
            def rpc(ticket,name,args):
                if name=='pi_helper_tool_claim':
                    self.assertEqual(args['p_device_token'],'d'*64);self.assertEqual(args['p_course_token'],'c'*64)
                    return dict(version=version,files=hashes,device_token='d'*64,course_token='c'*64)
                self.assertEqual(name,'pi_helper_tool_finish');self.assertEqual(args['p_status'],'completed');return True
            with mock.patch.object(installer.os,'geteuid',return_value=1000),mock.patch.object(installer.socket,'gethostname',return_value='pi5-03'),mock.patch.object(installer.subprocess,'run',side_effect=run),mock.patch.object(installer,'rpc',side_effect=rpc),mock.patch.object(installer,'fetch_sources',return_value=files):
                installer.install(self.ticket(),home=home)
            self.assertEqual(json.loads((directory/'pending.json').read_text()),queued)
            self.assertEqual(json.loads((directory/'config.json').read_text()),config)
            self.assertEqual((photos/'keep.jpg').read_bytes(),b'photo')
            self.assertEqual(student.read_text(),'# student-owned AI application\n')
            self.assertEqual((home/'.local/share/pi-helper-course/pi_course.py').read_bytes(),files['course'])
            privileged=[item for item in calls if item[0][-1]=='install-device'][0]
            payload=json.loads(privileged[1]['input']);self.assertEqual(payload['config'],device)
            self.assertFalse(any('teacher' in json.dumps(item) for item in calls))
            self.assertEqual(json.loads((home/'.config/pi-helper-install/version.json').read_text())['version'],version)

    def test_loading_privileged_source_does_not_create_bytecode_and_restores_flag(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'device.py'
            previous=sys.dont_write_bytecode
            try:
                for initial in [False,True]:
                    sys.dont_write_bytecode=initial
                    source.write_text('VALUE = 42\n')
                    self.assertEqual(installer.load_module(source,'device_fixture').VALUE,42)
                    self.assertEqual(sys.dont_write_bytecode,initial)
                    self.assertFalse((source.parent/'__pycache__').exists())
                    source.write_text('raise ValueError("fixture failure")\n')
                    with self.assertRaises(ValueError):installer.load_module(source,'device_failure')
                    self.assertEqual(sys.dont_write_bytecode,initial)
                    self.assertFalse((source.parent/'__pycache__').exists())
            finally:sys.dont_write_bytecode=previous

    def test_privileged_helper_validates_and_imports_without_a_root_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'device.py'
            source.write_text('from pathlib import Path\ndef install(config, report_first):\n    assert report_first is False\n    Path(__file__).with_suffix(".marker").write_text("installed")\n')
            payload=dict(source=str(source),sha256=hashlib.sha256(source.read_bytes()).hexdigest(),config={})
            with mock.patch.object(installer.os,'geteuid',return_value=0),mock.patch('sys.stdin',new=io.StringIO(json.dumps(payload))):
                installer.privileged('install-device')
            self.assertEqual(source.with_suffix('.marker').read_text(),'installed')
            self.assertFalse((source.parent/'__pycache__').exists())

    def test_system_launcher_helper_requires_root_and_verified_source(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'updater.py'
            source.write_text('from pathlib import Path\ndef install_system_launcher():\n    Path(__file__).with_suffix(".marker").write_text("registered")\n')
            payload=dict(source=str(source),sha256=hashlib.sha256(source.read_bytes()).hexdigest())
            with mock.patch.object(installer.os,'geteuid',return_value=0),mock.patch('sys.stdin',new=io.StringIO(json.dumps(payload))):installer.privileged('install-launcher')
            self.assertEqual(source.with_suffix('.marker').read_text(),'registered');self.assertFalse((source.parent/'__pycache__').exists())
            source.with_suffix('.marker').unlink();source.write_text(source.read_text()+'# changed\n')
            with mock.patch.object(installer.os,'geteuid',return_value=0),mock.patch('sys.stdin',new=io.StringIO(json.dumps(payload))),self.assertRaises(ValueError):installer.privileged('install-launcher')
            self.assertFalse(source.with_suffix('.marker').exists())
            with mock.patch.object(installer.os,'geteuid',return_value=1000),self.assertRaises(ValueError):installer.privileged('install-launcher')

    @contextmanager
    def simulated_install(self,home,*,cleanup_failure=False,delayed_verification=False):
        files={key:(ROOT/path).read_bytes() for key,path in installer.SOURCES.items()}
        hashes={key:hashlib.sha256(body).hexdigest() for key,body in files.items()}
        version=json.loads((ROOT/'tooling/release.json').read_text())['version'];calls=[];requests=[];remaining=[1 if delayed_verification else 0]
        def run(args,**kwargs):
            calls.append((args,kwargs))
            return subprocess.CompletedProcess(args,0,stdout='{}' if args[-1]=='read-device' else '')
        def rpc(ticket,name,args):
            requests.append((name,args))
            if name=='pi_helper_tool_claim':return dict(version=version,files=hashes,device_token='d'*64,course_token='c'*64)
            if args['p_status']=='completed' and remaining[0]:
                remaining[0]-=1
                error=RuntimeError(installer.ERRORS['TOOL_NOT_VERIFIED']);error.code='TOOL_NOT_VERIFIED';raise error
            return True
        original=installer.tempfile.TemporaryDirectory
        class CleanupFailure:
            def __init__(self,*args,**kwargs):pass
            def __enter__(self):self.context=original(prefix='pi-installer-test-');return self.context.__enter__()
            def __exit__(self,*args):self.context.__exit__(*args);raise PermissionError(13,'credential must not leak','secret-path')
        with mock.patch.object(installer.os,'geteuid',return_value=1000),mock.patch.object(installer.socket,'gethostname',return_value='pi5-03'),mock.patch.object(installer.subprocess,'run',side_effect=run),mock.patch.object(installer,'rpc',side_effect=rpc),mock.patch.object(installer,'fetch_sources',return_value=files),mock.patch.object(installer.time,'sleep'):
            if cleanup_failure:
                with mock.patch.object(installer.tempfile,'TemporaryDirectory',side_effect=CleanupFailure):yield calls,requests
            else:yield calls,requests

    def test_cleanup_failure_is_reported_without_claiming_completion_or_leaking(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory)
            with self.simulated_install(home,cleanup_failure=True) as (calls,requests),self.assertRaises(PermissionError) as caught:
                installer.install(self.ticket(),home=home)
            self.assertFalse(any(args[-1]=='location' for args,_ in calls))
            finish=[args for name,args in requests if name=='pi_helper_tool_finish']
            self.assertEqual(finish[-1]['p_status'],'failed');self.assertEqual(finish[-1]['p_error_code'],'install_cleanup')
            self.assertFalse((home/'.config/pi-helper-install/version.json').exists())
            path=home/'.config/pi-helper-install/last-error.json';record=json.loads(path.read_text())
            self.assertEqual(record['stage'],'cleanup');self.assertEqual(record['errno'],13);self.assertEqual(path.stat().st_mode&0o777,0o600)
            message=installer.failure_message(caught.exception)
            self.assertIn('清理安裝暫存檔',message);self.assertIn('PermissionError',message)
            for secret in ['credential must not leak','secret-path',self.ticket()['request_secret']]:
                self.assertNotIn(secret,message);self.assertNotIn(secret,path.read_text())

    def test_verification_retry_flushes_pending_reports_before_confirming(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory)
            with self.simulated_install(home,delayed_verification=True) as (calls,requests):installer.install(self.ticket(),home=home)
            self.assertEqual(sum(name=='pi_helper_tool_finish' and args['p_status']=='completed' for name,args in requests),2)
            self.assertTrue(any(args[-1]=='flush' for args,_ in calls))
            self.assertTrue((home/'.config/pi-helper-install/version.json').exists())
            self.assertFalse((home/'.config/pi-helper-install/last-error.json').exists())
            for args,_ in calls:
                if args[:2]==['sudo','/usr/bin/python3']:self.assertIn('-B',args)

    def test_error_formatter_never_prints_command_payloads_or_unknown_remote_data(self):
        secret='not-for-students-secret'
        error=subprocess.CalledProcessError(2,['installer',secret],output=secret,stderr=secret);error.install_stage='device_setup'
        self.assertNotIn(secret,installer.failure_message(error));self.assertNotIn(secret,json.dumps(installer.diagnostic(error)))
        error=RuntimeError(secret);error.code=secret;error.install_stage=secret
        self.assertNotIn(secret,installer.failure_message(error));self.assertNotIn(secret,json.dumps(installer.diagnostic(error)))

    def test_rpc_errors_keep_only_known_codes_not_remote_bodies(self):
        secret='private-remote-body'
        for message,expected in [('TOOL_EXPIRED','TOOL_EXPIRED'),(secret,'REMOTE_ERROR'),({'secret':secret},'REMOTE_ERROR')]:
            body=io.BytesIO(json.dumps({'message':message,'details':secret}).encode())
            error=urllib.error.HTTPError('https://example.supabase.co',400,'',{},body)
            with mock.patch.object(installer.urllib.request,'urlopen',side_effect=error),self.assertRaises(RuntimeError) as caught:
                installer.rpc(self.ticket(),'pi_helper_tool_claim',{})
            self.assertEqual(caught.exception.code,expected)
            self.assertNotIn(secret,installer.failure_message(caught.exception))
            self.assertNotIn(secret,json.dumps(installer.diagnostic(caught.exception)))

    def test_release_manifest_matches_every_installed_component(self):
        release=json.loads((ROOT/'tooling/release.json').read_text())
        for name,path in installer.SOURCES.items():
            self.assertEqual(release['files'][name],hashlib.sha256((ROOT/path).read_bytes()).hexdigest())
        self.assertEqual(release['bootstrap_sha256'],hashlib.sha256((ROOT/'tooling/install.py').read_bytes()).hexdigest())


if __name__=='__main__':
    unittest.main()
