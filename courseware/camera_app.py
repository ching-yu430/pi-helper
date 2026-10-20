#!/usr/bin/env python3
"""Classroom camera: 720p preview, reopen at 1080p for a still, explicit user actions."""
import argparse
import datetime
import importlib.util
import os
from pathlib import Path
import queue
import re
import sys
import threading
import time
import uuid

VERSION = '1.0.0'


def load_course():
    candidates = [Path(__file__).with_name('pi_course.py'), Path.home() / '.local/share/pi-helper-course/pi_course.py']
    for path in candidates:
        if path.is_file():
            spec = importlib.util.spec_from_file_location('pi_course_runtime', path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    raise RuntimeError('找不到課程工具，請助教重新下載 pi_course.py。')


class JpegWarnings:
    """Count a known native decoder warning; retain its original terminal output."""
    def __init__(self):
        self.count = 0
        self.original = None

    def start(self):
        self.original = os.dup(2)
        reader, writer = os.pipe()
        os.dup2(writer, 2)
        os.close(writer)

        def read():
            pending = b''
            try:
                while True:
                    chunk = os.read(reader, 4096)
                    if not chunk:
                        break
                    os.write(self.original, chunk)
                    pending += chunk
                    while b'\n' in pending:
                        line, pending = pending.split(b'\n', 1)
                        if b'Corrupt JPEG data:' in line:
                            self.count += 1
                    pending = pending[-4096:]
            except OSError:
                pass
            finally:
                os.close(reader)
        self.thread = threading.Thread(target=read, daemon=True)
        self.thread.start()

    def close(self):
        if self.original is not None:
            os.dup2(self.original, 2)
            self.thread.join(timeout=2)
            os.close(self.original)
            self.original = None


def open_camera(cv, device, width, height):
    if not re.fullmatch(r'/dev/video[0-9]{1,3}', device):
        raise RuntimeError('相機裝置名稱不正確。')
    cap = cv.VideoCapture(device, cv.CAP_V4L2)
    if not cap.isOpened():
        cap.release()
        raise RuntimeError('無法開啟相機。請確認連接到 Pi，並關閉其他使用相機的程式。')
    cap.set(cv.CAP_PROP_FOURCC, cv.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv.CAP_PROP_FRAME_HEIGHT, height)
    return cap


def save_frame(cv, frame, project, host):
    """Create a unique file; verify by decoding it again, never overwrite a photo."""
    folder = project / 'photos'
    if project.is_symlink() or not folder.is_dir() or folder.is_symlink() or not folder.resolve().is_relative_to(project.resolve()):
        raise RuntimeError('找不到正確的 photos 資料夾，請回資料夾練習確認。')
    if not re.fullmatch(r'pi5-(?:0[1-9]|[1-9][0-9])', host):
        raise RuntimeError('主機名稱不符合課程組別格式，請助教確認。')
    name = host + '_practice_' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f') + '_' + uuid.uuid4().hex[:8] + '.jpg'
    path = folder / name
    ok, encoded = cv.imencode('.jpg', frame)
    if not ok:
        raise RuntimeError('照片編碼失敗，請重拍。')
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o644)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(encoded.tobytes())
            output.flush()
            os.fsync(output.fileno())
        decoded = cv.imread(str(path))
        if decoded is None or decoded.size == 0:
            raise RuntimeError('照片不能正常讀取，請重拍並保留錯誤畫面。')
        height, width = decoded.shape[:2]
        if (height, width) != frame.shape[:2]:
            raise RuntimeError('存檔後的照片尺寸不一致，請助教確認。')
        return path, {'file_name': name, 'width': int(width), 'height': int(height), 'bytes': path.stat().st_size, 'readable': True}
    except Exception:
        # The failed artifact remains available for local diagnosis, never counted as passed.
        raise


class CameraWorker(threading.Thread):
    def __init__(self, cv, course, reporter, messages, frames, device, warnings):
        super().__init__(daemon=True)
        self.cv, self.course, self.reporter = cv, course, reporter
        self.messages, self.frames, self.device, self.warnings = messages, frames, device, warnings
        self.actions = queue.Queue()
        self.stop_requested = threading.Event()
        self.released = threading.Event()

    def emit(self, task, status, evidence=None):
        self.reporter.emit(task, status, {'warning_count': min(self.warnings.count, 999999), **(evidence or {})})

    def run(self):
        cap, preview_reported, count = None, False, 0
        recheck_device = False
        self.emit('camera', 'running')
        try:
            while not self.stop_requested.is_set():
                try:
                    if recheck_device:
                        available = self.course.capture_devices()
                        if not available:
                            raise RuntimeError('尚未找到可取像 USB 相機，請確認接線後再按重新連接。')
                        if self.device not in available:
                            self.device = available[0]
                        recheck_device = False
                    if cap is None:
                        cap = open_camera(self.cv, self.device, 1280, 720)
                    try:
                        action = self.actions.get_nowait()
                    except queue.Empty:
                        action = None
                    if action == 'retry':
                        cap.release()
                        cap = None
                        preview_reported = False
                        recheck_device = True
                        continue
                    if action == 'photo':
                        self.emit('photo', 'running')
                        self.messages.put(('status', '拍照中，請保持物品不動…'))
                        cap.release()
                        cap = None
                        preview_reported = False
                        still = None
                        try:
                            cap = open_camera(self.cv, self.device, 1920, 1080)
                            deadline = time.monotonic() + 2
                            while time.monotonic() < deadline and not self.stop_requested.is_set():
                                ok, frame = cap.read()
                                if ok and frame is not None and frame.size:
                                    still = frame
                            if still is None or self.stop_requested.is_set():
                                raise RuntimeError('沒有取得照片，請重試；若要離開請按結束。')
                            path, evidence = save_frame(self.cv, still, self.reporter.project, self.course.hostname())
                            count += 1
                            evidence['photo_count'] = count
                            exact = (evidence['width'], evidence['height']) == (1920, 1080)
                            self.emit('photo', 'passed' if exact else 'failed', {**evidence, **({} if exact else {'error_code': 'camera_size'})})
                            self.messages.put(('saved', (path, evidence, still.copy())))
                        except Exception as error:
                            self.emit('photo', 'failed', {'error_code': 'save_failed'})
                            self.messages.put(('error', str(error)))
                        finally:
                            if cap is not None:
                                cap.release()
                            cap = None
                            self.messages.put(('ready', None))
                        continue
                    ok, frame = cap.read()
                    if not ok or frame is None or not frame.size:
                        raise RuntimeError('相機沒有傳回影像。請檢查接線，關閉其他相機程式後按重新連接。')
                    if not preview_reported:
                        height, width = frame.shape[:2]
                        self.emit('camera', 'passed', {'readable': True, 'width': int(width), 'height': int(height), 'device': self.device})
                        preview_reported = True
                        self.messages.put(('preview', '預覽已開始（%s，實際 %d×%d），請確認是本組相機。按「拍照」或 S；按「結束」或 Q 離開。' % (self.device, width, height)))
                    if self.frames.full():
                        try:
                            self.frames.get_nowait()
                        except queue.Empty:
                            pass
                    self.frames.put_nowait(frame)
                except Exception as error:
                    if cap is not None:
                        cap.release()
                    cap = None
                    self.emit('camera', 'failed', {'error_code': 'camera_read'})
                    self.messages.put(('error', str(error)))
                    # Recover on request without repeatedly opening an unavailable camera.
                    while not self.stop_requested.wait(.1):
                        try:
                            if self.actions.get_nowait() == 'retry':
                                preview_reported = False
                                recheck_device = True
                                break
                        except queue.Empty:
                            pass
        finally:
            if cap is not None:
                cap.release()
            self.released.set()
            self.emit('camera_exit', 'passed', {'released': True})
            self.messages.put(('closed', None))


def main():
    parser = argparse.ArgumentParser(description='Pi 課堂拍照：預覽、拍照、正常結束。')
    parser.add_argument('--device', default=None)
    parser.add_argument('--run-id', default=None)
    args = parser.parse_args()
    if os.geteuid() == 0:
        raise RuntimeError('請用 user 執行，不要加 sudo。')
    import cv2
    import tkinter as tk
    from tkinter import ttk
    course = load_course()
    reporter = course.Reporter()
    if args.run_id:
        reporter.run_id = str(uuid.UUID(args.run_id))
    if not (reporter.project / 'photos').is_dir():
        raise RuntimeError('請先完成建立 pi-camera/photos 資料夾的練習。')
    devices = course.capture_devices()
    if not devices:
        raise RuntimeError('找不到 USB 相機。請接到 Pi，並執行課程環境檢查。')
    device = args.device or devices[0]
    if device not in devices:
        raise RuntimeError('指定裝置不在可取像的 USB 相機清單中。')
    root = tk.Tk()
    root.title('本組 USB 拍照｜' + course.hostname())
    root.geometry('920x720')
    root.minsize(600, 520)
    root.configure(background='#f1f5f0')
    style = ttk.Style(root)
    style.configure('TButton', padding=12)
    outer = ttk.Frame(root, padding=16)
    outer.pack(fill='both', expand=True)
    ttk.Label(outer, text=course.hostname() + '｜練習拍照', font=('', 19, 'bold')).pack(anchor='w')
    ttk.Label(outer, text='720P 預覽｜拍照切換 1080P｜照片存到 Pi 的 pi-camera/photos').pack(anchor='w', pady=(4, 10))
    image_label = ttk.Label(outer, text='正在開啟相機…', anchor='center')
    image_label.pack(fill='both', expand=True)
    status = tk.StringVar(value='請保持相機接在 Pi，並關閉其他相機程式。')
    detail = tk.StringVar(value='尚未拍照。檔名會自動包含組別、practice 與時間，不覆蓋舊照片。')
    ttk.Label(outer, textvariable=status, wraplength=820).pack(anchor='w', pady=(10, 3))
    ttk.Label(outer, textvariable=detail, wraplength=820).pack(anchor='w')
    ttk.Label(outer, text='若終端機有 Corrupt JPEG data 警告，保留訊息，並親自打開照片確認品質。', wraplength=820).pack(anchor='w', pady=6)
    actions = ttk.Frame(outer)
    actions.pack(fill='x', pady=(10, 0))
    messages, frames = queue.Queue(), queue.Queue(maxsize=1)
    warnings = JpegWarnings()
    warnings.start()
    worker = CameraWorker(cv2, course, reporter, messages, frames, device, warnings)
    closing, shooting, preview_seen = False, False, False
    thumbnail = None
    photo_button = ttk.Button(actions, text='拍照（S）')
    photo_button.state(['disabled'])
    retry_button = ttk.Button(actions, text='重新連接相機')
    close_button = ttk.Button(actions, text='結束（Q）')
    for button in (photo_button, retry_button, close_button):
        button.pack(side='left', padx=(0, 8))

    def photo(event=None):
        nonlocal shooting
        if closing or shooting or 'disabled' in photo_button.state():
            return
        shooting = True
        photo_button.state(['disabled'])
        retry_button.state(['disabled'])
        worker.actions.put('photo')

    def close(event=None):
        nonlocal closing
        if closing:
            return
        closing = True
        worker.stop_requested.set()
        status.set('正在釋放相機，請稍候…')
        for button in (photo_button, retry_button, close_button):
            button.state(['disabled'])
        def finish():
            if not worker.released.is_set():
                reporter.emit('camera_exit', 'cancelled', {'error_code': 'interrupted'})
            root.destroy()
        root.after(5000, finish)

    def retry():
        nonlocal shooting, preview_seen
        if not closing:
            shooting = False
            preview_seen = False
            worker.actions.put('retry')
            photo_button.state(['disabled'])
            status.set('正在重新連接相機…')

    def image(frame, maximum):
        height, width = frame.shape[:2]
        scale = min(maximum[0] / width, maximum[1] / height, 1)
        small = cv2.resize(frame, (max(1, int(width * scale)), max(1, int(height * scale))))
        rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        return tk.PhotoImage(data=('P6\n%d %d\n255\n' % (rgb.shape[1], rgb.shape[0])).encode() + rgb.tobytes(), format='PPM')

    def tick():
        nonlocal shooting, thumbnail, preview_seen
        try:
            while True:
                kind, value = messages.get_nowait()
                if kind == 'status':
                    if not closing:
                        status.set(value)
                elif kind == 'preview':
                    if not closing:
                        photo_button.state(['!disabled'])
                        if not preview_seen:
                            status.set(value)
                        preview_seen = True
                elif kind == 'error':
                    status.set(value + ' 可按重新連接或結束。')
                    shooting = False
                    photo_button.state(['disabled'])
                    if not closing:
                        retry_button.state(['!disabled'])
                elif kind == 'ready':
                    shooting = False
                    if not closing:
                        retry_button.state(['!disabled'])
                elif kind == 'saved':
                    path, evidence, frame = value
                    exact = (evidence['width'], evidence['height']) == (1920, 1080)
                    status.set('照片已儲存。請打開原始照片確認品質。' if exact else '照片已存檔，但不是指定 1920×1080，請助教確認。')
                    detail.set('本次第 %d 張｜%d×%d｜%s' % (evidence['photo_count'], evidence['width'], evidence['height'], path))
                    thumbnail = image(frame, (240, 135))
                    thumb.configure(image=thumbnail)
                elif kind == 'closed' and closing:
                    root.destroy()
                    return
        except queue.Empty:
            pass
        try:
            frame = frames.get_nowait()
            preview = image(frame, (max(320, image_label.winfo_width()), max(180, image_label.winfo_height())))
            image_label.configure(image=preview, text='')
            image_label.image = preview
        except queue.Empty:
            pass
        root.after(60, tick)
    thumb = ttk.Label(outer)
    thumb.pack(anchor='e')
    photo_button.configure(command=photo)
    retry_button.configure(command=retry)
    close_button.configure(command=close)
    root.bind('<KeyPress-s>', photo)
    root.bind('<KeyPress-S>', photo)
    root.bind('<KeyPress-q>', close)
    root.bind('<KeyPress-Q>', close)
    root.protocol('WM_DELETE_WINDOW', close)
    worker.start()
    root.after(60, tick)
    try:
        root.mainloop()
    finally:
        worker.stop_requested.set()
        worker.join(timeout=1)
        warnings.close()
        reporter.flush(blocking=True)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print('拍照程式未能啟動：' + str(error) + '\n請檢查是否在 Pi 遠端桌面執行，以及套件、相機是否準備好。', file=sys.stderr)
        sys.exit(1)
