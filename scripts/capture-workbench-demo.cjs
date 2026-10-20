'use strict';
// Render the real workbench against a temporary database. No production writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const pkg = process.env.PGLITE_ROOT || '@electric-sql/pglite';
const { PGlite } = require(pkg);
const { pgcrypto } = require(pkg.startsWith('/') ? pkg + '/dist/contrib/pgcrypto.cjs' : pkg + '/contrib/pgcrypto');
const root = path.join(__dirname, '..');
const destination = path.join(root, 'assets/screenshots');
const room = fs.readFileSync(path.join(root, 'config.js'), 'utf8').match(/defaultRoomCode: '([^']+)'/)[1];
const password = 'isolated-demo-only';
const casts = { p_group_no: 'smallint', p_revision: 'bigint', p_session_id: 'uuid', p_request_id: 'uuid', p_id: 'uuid', p_current_step: 'integer', p_open_lessons: 'jsonb', p_snapshot: 'jsonb', p_event: 'jsonb' };

(async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  let browser;
  try {
    await db.exec('create role anon; create role authenticated; create role service_role');
    await db.exec(fs.readFileSync(path.join(root, 'supabase/install.sql'), 'utf8'));
    await db.query("insert into pi_helper.rooms(title,join_hash,teacher_hash,ends_at) values('隔離示範課堂',encode(extensions.digest($1,'sha256'),'hex'),extensions.crypt($2,extensions.gen_salt('bf')),now()+interval '1 day')", [room, password]);
    async function rpc(name, args) {
      assert.match(name, /^pi_helper_[a-z_]+$/);
      const keys = Object.keys(args);
      keys.forEach(key => assert.match(key, /^p_[a-z_]+$/));
      const values = keys.map(key => casts[key] === 'jsonb' ? JSON.stringify(args[key]) : args[key]);
      const parameters = keys.map((key, i) => key + '=>$' + (i + 1) + (casts[key] ? '::' + casts[key] : ''));
      if (['pi_helper_teacher_reports', 'pi_helper_teacher_room_info'].includes(name)) {
        return (await db.query('select * from public.' + name + '(' + parameters.join(',') + ')', values)).rows;
      }
      return (await db.query('select public.' + name + '(' + parameters.join(',') + ') as value', values)).rows[0].value;
    }
    const teacher = { p_room_code: room, p_teacher_code: password };
    const scenarios = [
      { group: 1, step: '把照片下載到 Windows', state: 'done', result: '已在 Windows 開啟照片，學生自行確認完成', camera: 1 },
      { group: 2, step: '安裝 OpenCV 並確認 USB 相機', state: 'need_help', result: '相機接在 Pi，但環境檢查找不到相機', camera: 0 },
      { group: 3, step: '安裝 OpenCV 並確認 USB 相機', state: 'working', result: '套件安裝中，等候執行完成', camera: 1 }
    ];
    for (const sample of scenarios) {
      const group = sample.group, host = 'pi5-' + String(group).padStart(2, '0');
      const session = crypto.randomUUID(), secret = crypto.randomBytes(32).toString('hex');
      await rpc('pi_helper_student_report', { p_room_code: room, p_session_id: session, p_session_secret: secret, p_group_no: group, p_stage: 'Python與USB拍照', p_step: sample.step, p_result: sample.result, p_status: sample.state, p_revision: 1 });
      if (group === 2) await rpc('pi_helper_request_help', { p_room_code: room, p_session_id: session, p_session_secret: secret, p_group_no: group, p_request_id: crypto.randomUUID(), p_stage: 'Python與USB拍照', p_step: sample.step, p_message: sample.result });
      const device = await rpc('pi_helper_teacher_pair_device', { ...teacher, p_group_no: group });
      await rpc('pi_helper_device_report', { p_device_token: device.device_token, p_snapshot: { hostname: host, ssh: 'active', xrdp: 'active', display: 'x11', xrdp_installed: true, xorgxrdp_installed: true, python_version: 'Python 3.11.2', usb_cameras: sample.camera, free_mb: 8192, uptime_seconds: 600 } });
      const course = await rpc('pi_helper_teacher_pair_course', { ...teacher, p_group_no: group });
      const run = crypto.randomUUID();
      let sequence = 0;
      async function event(task, status, evidence = {}, network) {
        const data = { hostname: host, sequence: ++sequence, run_id: run, task, status, evidence };
        if (network) data.network = network;
        await rpc('pi_helper_course_event', { p_course_token: course.course_token, p_event: data });
      }
      await event('location', 'passed', { cwd: 'project' }, [{ interface: 'wlan0', ip: '192.168.43.' + (20 + group) }]);
      await event('folders', 'passed', { folders_ok: true });
      await event('hello', 'passed', { exit_code: 0, group_output: true, python_version: '3.11.2' });
      await event('write', 'passed', { exit_code: 0, group_output: true, new_file: true });
      if (group === 1) {
        await event('environment', 'passed', { cv2_ok: true, tk_ok: true, v4l_ok: true, device: '/dev/video0', python_version: '3.11.2', opencv_version: '4.6.0', os: 'Raspberry Pi OS（示範）', arch: 'aarch64' });
        await event('camera', 'passed', { readable: true, width: 1280, height: 720, device: '/dev/video0' });
        await event('photo', 'passed', { readable: true, width: 1920, height: 1080, bytes: 245760, file_name: host + '_practice_20261020_140000_000001_deadbeef.jpg', warning_count: 2 });
        await event('camera_exit', 'passed', { released: true });
      } else if (group === 2) await event('environment', 'failed', { error_code: 'camera_missing' });
      else await event('install', 'running');
    }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
    await context.addInitScript(() => { window.setInterval = () => 0; window.clearInterval = () => {}; });
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('https://*.supabase.co/**', async route => {
      try { await route.fulfill({ json: await rpc(route.request().url().split('/').pop(), route.request().postDataJSON() || {}) }); }
      catch (error) { await route.fulfill({ status: 400, json: { code: error.code || 'ERROR', message: error.message } }); }
    });
    await page.goto((process.env.PI_HELPER_TEST_URL || 'http://127.0.0.1:8001/') + 'assistant.html');
    await page.locator('#teacherPassword').fill(password);
    await page.locator('.dashboard-login').evaluate(form => form.onsubmit({ preventDefault() {} }));
    await page.locator('.group-card[data-group="1"] .course-device-status').getByText('釋放相機並結束：已驗證通過', { exact: true }).waitFor();
    const notice = page.locator('#helpRequestDialog');
    await notice.waitFor({ state: 'visible' });
    await notice.getByRole('button', { name: '稍後處理', exact: true }).click();
    async function label(selector, text) {
      await page.locator(selector).evaluate((node, text) => {
        const note = document.createElement('p');
        note.textContent = text;
        note.style.cssText = 'padding:14px;background:#fff3ce;border:2px solid #b47b13;border-radius:10px;color:#654600;font-weight:700;margin:0 0 18px';
        node.prepend(note);
      }, text);
    }
    fs.mkdirSync(destination, { recursive: true });
    await label('.dashboard-board', '模擬示範｜擷取前 3 組；不是正式課堂資料，版本、IP 與照片資訊皆為範例。');
    const board = await page.locator('.dashboard-board').boundingBox();
    const third = await page.locator('.group-card[data-group="3"]').boundingBox();
    await page.screenshot({ path: path.join(destination, 'workbench-camera-overview.png'), fullPage: true, clip: { x: board.x, y: board.y, width: board.width, height: third.y + third.height - board.y } });
    await page.locator('.group-card[data-group="1"] .group-help-button').click();
    const success = '#groupHelp .course-device-status';
    await label(success, '模擬示範｜第 01 組課程驗證；不是實機測試結果。');
    assert((await page.locator(success).innerText()).includes('1920×1080'));
    assert((await page.locator(success).innerText()).includes('192.168.43.21'));
    await page.locator(success).screenshot({ path: path.join(destination, 'workbench-camera-success.png') });
    await page.locator('#backToBoard').click();
    if (await notice.isVisible()) await notice.getByRole('button', { name: '稍後處理', exact: true }).click();
    await page.locator('.group-card[data-group="2"] .group-help-button').click();
    await label('#groupHelp', '模擬示範｜第 02 組找不到相機；不是正式課堂求助。');
    assert((await page.locator('#groupHelp').innerText()).includes('找不到可取像 USB 相機'));
    await page.locator('#groupHelp').screenshot({ path: path.join(destination, 'workbench-camera-help.png') });
    assert.deepEqual(errors, []);
    console.log('Captured 3 labeled workbench examples using only an isolated database.');
  } finally {
    if (browser) await browser.close();
    await db.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
