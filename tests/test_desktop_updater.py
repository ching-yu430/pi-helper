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
spec = importlib.util.spec_from_file_location('desktop_updater', ROOT / 'tooling/updater.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)
spec = importlib.util.spec_from_file_location('desktop_installer_test', ROOT / 'tooling/install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class DesktopUpdaterTests(unittest.TestCase):
    def job(self, **changes):
        return dict(id='11111111-1111-4111-8111-111111111111',status='approved',version='1.5.0',
                    desktop_supported=True,request_origin='desktop',request_code=hashlib.sha256(b'a'*64).hexdigest()[:8].upper(),
                    request_active=True,approval_expired=False,update_mode='user',bootstrap_sha256=hashlib.sha256(b'installer').hexdigest(),**changes)

    def client(self,home):
        config=home/'.config/pi-helper-course/config.json';config.parent.mkdir(parents=True)
        config.write_text(json.dumps(dict(url='https://example.supabase.co',key='sb_publishable_test',expected_hostname='pi5-01',course_token='c'*64)))
        with mock.patch.object(updater,'installer',return_value=installer),mock.patch.object(updater.socket,'gethostname',return_value='pi5-01'):
            return updater.Client(home)

    def test_shortcuts_follow_desktop_locale_and_never_require_a_terminal(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory);desktop=home/'桌面'
            with mock.patch.object(updater,'desktop_directory',return_value=desktop),mock.patch.object(updater.subprocess,'run'):
                updater.install_shortcuts(home)
            for path in [desktop/'pi-helper-tools.desktop',home/'.local/share/applications/pi-helper-tools.desktop',home/'.config/autostart/pi-helper-tools.desktop']:
                data=path.read_text();self.assertIn('Name=課堂工具',data);self.assertNotIn('sudo',data)
                if path==desktop/'pi-helper-tools.desktop':
                    self.assertIn('Type=Link',data);self.assertIn('URL='+str(updater.SYSTEM_LAUNCHER),data);self.assertNotIn('Exec=',data)
                else:self.assertIn('Terminal=false',data)
                self.assertEqual(path.stat().st_mode&0o777,0o644)
            self.assertIn('--notify',(home/'.config/autostart/pi-helper-tools.desktop').read_text())
            helper=home/'.local/share/pi-helper-tools/askpass';self.assertEqual(helper.stat().st_mode&0o777,0o700);self.assertIn('--askpass',helper.read_text())

    def test_system_launcher_uses_current_user_and_preserves_file_manager_preferences(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory);preferences=home/'.config/libfm/libfm.conf';preferences.parent.mkdir(parents=True);preferences.write_text('[config]\nquick_exec=0\n')
            target=home/'system/pi-helper-tools.desktop'
            with mock.patch.object(updater,'SYSTEM_LAUNCHER',target),mock.patch.object(updater.os,'geteuid',return_value=0):updater.install_system_launcher()
            self.assertIn('Path.home()',target.read_text());self.assertIn('Terminal=false',target.read_text());self.assertNotIn('sudo',target.read_text());self.assertEqual(target.stat().st_mode&0o777,0o644)
            with mock.patch.object(updater,'desktop_directory',return_value=home/'桌面'),mock.patch.object(updater.subprocess,'run'):updater.install_shortcuts(home)
            self.assertEqual(preferences.read_text(),'[config]\nquick_exec=0\n')

    def test_states_do_not_allow_update_before_own_approved_request(self):
        job=self.job();self.assertEqual(updater.presentation(job,'a'*64)[2],'update')
        job['status']='pending';self.assertIsNone(updater.presentation(job,'a'*64)[2])
        job['status']='approved';job['approval_expired']=True;self.assertIsNone(updater.presentation(job,'a'*64)[2])
        job['approval_expired']=False;self.assertEqual(updater.presentation(job,'b'*64)[2],'request')
        job['claim_until']='later';self.assertIsNone(updater.presentation(job,'b'*64)[2])
        job['status']='completed';self.assertIsNone(updater.presentation(job,'a'*64)[2])

    def test_credentials_are_reloaded_and_request_secret_stays_private(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory);client=self.client(home);job=self.job()
            with mock.patch.object(installer,'rpc',return_value=job) as rpc:
                client.request(job);first=rpc.call_args.args[2];secret=first['p_request_secret']
                self.assertEqual(len(secret),64);self.assertEqual(client.secret(job),secret)
                path=home/'.config/pi-helper-install'/('desktop-'+job['id']+'.json');self.assertEqual(path.stat().st_mode&0o777,0o600)
                config=home/'.config/pi-helper-course/config.json';value=json.loads(config.read_text());value['course_token']='d'*64;config.write_text(json.dumps(value));client.status()
                self.assertEqual(rpc.call_args.args[2]['p_course_token'],'d'*64)

    def test_invalid_bootstrap_hash_stops_before_spawning_and_secrets_are_not_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory);client=self.client(home);job=self.job()
            installer.atomic_json(home/'.config/pi-helper-install'/('desktop-'+job['id']+'.json'),dict(request_secret='a'*64))
            response=mock.MagicMock();response.__enter__.return_value.read.return_value=b'wrong'
            with mock.patch.object(updater.urllib.request,'urlopen',return_value=response),mock.patch.object(updater.subprocess,'run') as run:
                with self.assertRaisesRegex(ValueError,'校驗失敗'):client.update(job)
                run.assert_not_called()
            response.__enter__.return_value.read.return_value=b'installer'
            def run(args,**kwargs):
                self.assertIn('--desktop',args);self.assertIn('--gui',args)
                for secret in ['a'*64,'c'*64]:self.assertNotIn(secret,json.dumps(args))
                ticket=Path(args[args.index('--ticket-file')+1]);self.assertEqual(ticket.stat().st_mode&0o777,0o600)
                self.assertEqual(json.loads(ticket.read_text())['request_secret'],'a'*64)
                self.assertNotIn('password',kwargs['env']);return subprocess.CompletedProcess(args,0)
            with mock.patch.object(updater.urllib.request,'urlopen',return_value=response),mock.patch.object(updater.subprocess,'run',side_effect=run):client.update(job)

    def test_user_update_never_uses_sudo_and_preserves_pairing_and_photos(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory);client=self.client(home);config=json.loads((home/'.config/pi-helper-course/config.json').read_text())
            photo=home/'pi-camera/photos/keep.jpg';photo.parent.mkdir(parents=True);photo.write_bytes(b'keep')
            files={k:(ROOT/v).read_bytes() for k,v in installer.SOURCES.items()};calls=[]
            ticket=dict(url=config['url'],key=config['key'],expected_hostname='pi5-01',job_id=self.job()['id'],request_secret='a'*64)
            def rpc(ticket,name,args):
                calls.append(name)
                if name=='pi_helper_tool_desktop_claim':return dict(version='1.5.0',files={},course_token='c'*64)
                return True
            def run(args,**kwargs):
                self.assertNotIn('sudo',args);return subprocess.CompletedProcess(args,0,stdout='')
            with mock.patch.object(installer.os,'geteuid',return_value=1000),mock.patch.object(installer.socket,'gethostname',return_value='pi5-01'),mock.patch.object(installer,'rpc',side_effect=rpc),mock.patch.object(installer,'fetch_sources',return_value=files),mock.patch.object(installer.subprocess,'run',side_effect=run):
                installer.install(ticket,home=home,desktop=True,gui=True)
            self.assertIn('pi_helper_tool_desktop_claim',calls);self.assertEqual(photo.read_bytes(),b'keep')
            self.assertEqual(json.loads((home/'.config/pi-helper-course/config.json').read_text()),config)

    def test_managed_bundle_rolls_back_previous_code_without_touching_exercises(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory);target=home/'.local/share/pi-helper-course';target.mkdir(parents=True);(target/'pi_course.py').write_text('previous')
            photo=home/'pi-camera/photos/keep.jpg';photo.parent.mkdir(parents=True);photo.write_bytes(b'keep')
            files={key:b'new' for key in installer.SOURCES};bundle=installer.UserBundle(home,files,'1.5.0');bundle.activate()
            self.assertEqual((target/'pi_course.py').read_bytes(),b'new');bundle.rollback();self.assertEqual((target/'pi_course.py').read_text(),'previous')
            self.assertEqual(photo.read_bytes(),b'keep');self.assertTrue(bundle.release.exists())

    def test_errors_do_not_echo_remote_payload_or_credentials(self):
        error=RuntimeError('secret-course-token');self.assertNotIn('secret-course-token',updater.safe_error(error))

    def test_early_failure_restores_code_but_uncertain_cloud_confirmation_keeps_new_code(self):
        for failed_stage in ('course_report','verify'):
            with self.subTest(stage=failed_stage),tempfile.TemporaryDirectory() as directory:
                home=Path(directory);client=self.client(home)
                target=home/'.local/share/pi-helper-course';target.mkdir(parents=True);(target/'pi_course.py').write_bytes(b'# previous')
                files={k:(ROOT/v).read_bytes() for k,v in installer.SOURCES.items()}
                ticket=dict(url='https://example.supabase.co',key='sb_publishable_test',expected_hostname='pi5-01',job_id=self.job()['id'],request_secret='a'*64)
                def rpc(ticket,name,args):
                    if name=='pi_helper_tool_desktop_claim':return dict(version='1.5.0',files={},course_token='c'*64)
                    if args['p_status']=='completed':raise RuntimeError('confirmation connection lost')
                    return True
                def run(args,**kwargs):
                    if failed_stage=='course_report' and args[-1]=='location':raise subprocess.CalledProcessError(1,args)
                    return subprocess.CompletedProcess(args,0,stdout='')
                with mock.patch.object(installer.os,'geteuid',return_value=1000),mock.patch.object(installer.socket,'gethostname',return_value='pi5-01'),mock.patch.object(installer,'rpc',side_effect=rpc),mock.patch.object(installer,'fetch_sources',return_value=files),mock.patch.object(installer.subprocess,'run',side_effect=run):
                    with self.assertRaises((RuntimeError,subprocess.CalledProcessError)):installer.install(ticket,home=home,desktop=True,gui=True)
                self.assertEqual((target/'pi_course.py').read_bytes(),b'# previous' if failed_stage=='course_report' else files['course'])
                self.assertFalse((home/'.config/pi-helper-install/version.json').exists())
                self.assertEqual(json.loads((home/'.config/pi-helper-install/last-error.json').read_text())['stage'],failed_stage)


if __name__=='__main__':unittest.main()
