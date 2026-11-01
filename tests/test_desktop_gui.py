"""Real Tk widgets on Xvfb, with a fake classroom only (no network or sudo)."""
import importlib.util
import os
from pathlib import Path
import threading
import time
import unittest

spec=importlib.util.spec_from_file_location('gui_under_test',Path(__file__).resolve().parents[1]/'tooling/updater.py')
updater=importlib.util.module_from_spec(spec);spec.loader.exec_module(updater)


class FakeClient:
    hostname='pi5-01'
    def __init__(self):
        self.value=dict(id='11111111-1111-4111-8111-111111111111',version='1.5.0',status='pending',desktop_supported=True,request_origin='desktop',request_code='',request_active=False,approval_expired=True,update_mode='user')
        self.started=threading.Event();self.finish=threading.Event()
    def status(self):return dict(installed_version='1.5.0',job=self.value.copy())
    def secret(self,job):return 'a'*64
    def request(self,job):
        self.value.update(request_active=True,request_code=updater.hashlib.sha256(b'a'*64).hexdigest()[:8].upper());return self.value.copy()
    def update(self,job):
        self.started.set();self.finish.wait(10);self.value['status']='completed'


@unittest.skipUnless(os.environ.get('DISPLAY'),'Needs an X display (run with xvfb-run)')
class DesktopGuiTests(unittest.TestCase):
    def wait(self,predicate):
        deadline=time.monotonic()+8
        while time.monotonic()<deadline:
            self.window.root.update()
            if predicate():return
            time.sleep(.01)
        self.fail('Desktop did not reach expected state')

    def capture(self,name):
        directory=os.environ.get('PI_HELPER_GUI_SCREENSHOTS')
        if directory:
            from PIL import ImageGrab
            self.window.root.update()
            root=self.window.root
            ImageGrab.grab(bbox=(root.winfo_rootx(),root.winfo_rooty(),root.winfo_rootx()+root.winfo_width(),root.winfo_rooty()+root.winfo_height())).save(str(Path(directory)/name))

    def test_request_staff_approval_update_and_completion_use_real_widgets(self):
        client=FakeClient();self.window=updater.Window(client)
        try:
            self.wait(lambda:self.window.action=='request');self.assertEqual(self.window.button.cget('text'),'申請更新');self.capture('desktop-update-request.png')
            self.window.button.invoke();self.wait(lambda:self.window.state.cget('text')=='等待助教核准')
            self.assertIn('核對碼',self.window.code.cget('text'));self.capture('desktop-update-waiting.png')
            client.value.update(status='approved',approval_expired=False);self.window.work('status',client.status)
            self.wait(lambda:self.window.action=='update');self.assertEqual(self.window.button.cget('text'),'立即更新');self.capture('desktop-update-approved.png')
            self.window.button.invoke();self.wait(client.started.is_set);self.assertTrue(self.window.updating);self.capture('desktop-update-running.png')
            self.window.close();self.assertTrue(self.window.root.winfo_exists());self.assertIn('等完成',self.window.message.cget('text'))
            client.finish.set();self.wait(lambda:self.window.state.cget('text')=='更新完成');self.capture('desktop-update-completed.png')
            self.assertFalse(self.window.updating)
        finally:
            client.finish.set();self.window.root.destroy()


if __name__=='__main__':unittest.main()
