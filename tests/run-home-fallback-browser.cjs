'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();let mode='hang';const held=[];
 const policy={open_lessons:{flash:true,ssh:true,desktop:true,shutdown:true},current_lesson:'ssh',current_step:0,revision:1};
 await page.route('https://*.supabase.co/**',async route=>{
  if(mode==='hang'){held.push(route);return}
  if(mode==='fail')return route.abort();
  await route.fulfill({json:route.request().url().endsWith('pi_helper_group_settings')?{group_count:9}:policy});
 });
 await page.goto((process.env.PI_HELPER_TEST_URL||'http://127.0.0.1:8002/')+'index.html');
 await page.waitForFunction(()=>document.querySelector('#courseGroup').disabled);
 await page.clock.fastForward(10001);await page.locator('#retryCourseGroups').waitFor({state:'visible'});
 assert((await page.locator('#courseGroupStatus').innerText()).includes('請找助教'));
 assert(!(await page.locator('#courseGroup').innerText()).includes('正在讀取'));
 await page.locator('footer a').first().click();assert(await page.locator('#connectionHelpTitle').isVisible());
 assert((await page.locator('#connectionHelp').innerText()).includes('只有 .local 仍無法使用時才改用 IP'));
 console.log('PASS hung requests time out, replace the loading placeholder and expose retry, assistance and independent connection instructions');
 mode='fail';await page.locator('#retryCourseGroups').click();await page.locator('#retryCourseGroups').waitFor({state:'visible'});
 assert(await page.locator('#courseGroup').isDisabled());
 mode='good';await page.locator('#retryCourseGroups').click();await page.waitForFunction(()=>!document.querySelector('#courseGroup').disabled);
 await page.locator('#courseGroup').selectOption('pi5-05');
 assert((await page.locator('[data-lesson="ssh"]').getAttribute('href')).includes('group=pi5-05'));
 for(const route of held)await route.fulfill({json:route.request().url().endsWith('pi_helper_group_settings')?{group_count:2}:policy}).catch(()=>{});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('#courseGroup').inputValue(),'pi5-05');
 assert.equal(await page.locator('#courseGroup option').count(),10);
 console.log('PASS retry recovers after a network error and late expired responses cannot replace the successful group selection');
 assert.equal(await page.locator('.course-catalog [data-lesson]').count(),3);
 assert.equal(await page.locator('.shutdown-routine [data-lesson="shutdown"]').count(),1);
 assert((await page.locator('.platform-note').innerText()).includes('Mac 或 Linux'));
 assert.equal(await page.locator('#openStudentGuide').innerText(),'使用說明');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 await page.setViewportSize({width:1280,height:960});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/pi-course-home-current.png'});
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS Windows guidance, plain-language terms, separate shutdown routine and mobile course layout');
})().catch(e=>{console.error(e);process.exit(1)});
