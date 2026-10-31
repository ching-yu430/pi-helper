import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
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

    def test_release_manifest_matches_every_installed_component(self):
        release=json.loads((ROOT/'tooling/release.json').read_text())
        for name,path in installer.SOURCES.items():
            self.assertEqual(release['files'][name],hashlib.sha256((ROOT/path).read_bytes()).hexdigest())
        self.assertEqual(release['bootstrap_sha256'],hashlib.sha256((ROOT/'tooling/install.py').read_bytes()).hexdigest())


if __name__=='__main__':
    unittest.main()
