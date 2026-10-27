'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),errors=[],reports=[];
  await context.addInitScript(()=>{window.__testIntervals=[];window.setInterval=(fn,ms)=>{window.__testIntervals.push({fn,ms});return window.__testIntervals.length};window.clearInterval=()=>{}});
  let policy={open_lessons:{flash:true,ssh:true,desktop:true,shutdown:true,camera:true},current_lesson:'flash',current_step:0,revision:1,camera_supported:true};
  await context.route('https://*.supabase.co/**',async route=>{
   const name=route.request().url().split('/').pop();
   let json;
   if(name==='pi_helper_group_settings')json={group_count:9};
   else if(name==='pi_helper_course_settings')json=policy;
   else if(name==='pi_helper_student_join')json='隔離畫面測試';
   else if(name==='pi_helper_student_camera')json={group_no:4,enabled:false,tasks:[]};
   else if(name==='pi_helper_student_report'){reports.push(route.request().postDataJSON());json=new Date().toISOString()}
   else if(name==='pi_helper_student_help')json=[];
   else return route.fulfill({status:404,json:{code:'PGRST202',message:'test endpoint unavailable'}});
   await route.fulfill({json});
  });
  const page=await context.newPage(),base=process.env.PI_HELPER_TEST_URL||'http://127.0.0.1:8001/';page.on('pageerror',error=>errors.push(error.message));
  const home=async()=>{await page.goto(base);await page.locator('#courseGroup:not([disabled])').waitFor()};
  const tick=()=>page.evaluate(()=>window.__testIntervals.find(t=>t.ms===5000).fn());
  await home();
  assert.equal(await page.locator('#courseGroup option').count(),10);assert((await page.locator('[data-lesson=shutdown]').getAttribute('href')).endsWith('shutdown.html'));assert.equal(await page.locator('[data-lesson=shutdown]').getAttribute('aria-disabled'),'false');
  await page.locator('#courseGroup').selectOption('pi5-03');
  assert.equal(await page.locator('#initialSetup').getAttribute('open'),null);
  assert.equal(await page.locator('#connectionHelp').getAttribute('open'),null);
  for(const lesson of ['flash','ssh','desktop'])assert(!await page.locator('[data-lesson='+lesson+']').isVisible());
  assert(await page.locator('[data-lesson=camera]').isVisible());assert(await page.locator('[data-lesson=shutdown]').isVisible());
  assert(await page.locator('#followTeacherLink').isVisible(),'the latest teacher stage stays visible even when setup is folded');assert.equal(await page.locator('#followTeacherLink').evaluate(e=>e.closest('details')),null);
  assert.equal(await page.locator('.upcoming,.lesson-goal,.lesson-term').count(),0);
  assert.equal(await page.locator('.course-catalog [data-lesson]').count(),1);
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const node of await page.locator('a:visible,button:visible,summary:visible').all())assert(await node.evaluate(e=>e.getBoundingClientRect().height>=44));
   if(width===390)await page.screenshot({path:'/tmp/pi-home-clean-390.png',fullPage:true});
   if(width===1280)await page.screenshot({path:path.join(__dirname,'../assets/screenshots/course-home.png'),fullPage:true});
  }
  console.log('PASS compact home keeps group selection, current course and shutdown visible while setup and troubleshooting stay folded at 320–1280px');
  await page.locator('#initialSetup > summary').click();
  assert(await page.locator('#followTeacherLink').isVisible());
  for(const lesson of ['flash','ssh','desktop']){assert(await page.locator('[data-lesson='+lesson+']').isVisible());assert((await page.locator('[data-lesson='+lesson+']').getAttribute('href')).includes('group=pi5-03'))}
  await page.locator('#courseGroup').selectOption('pi5-04');await tick();
  assert.equal(await page.locator('.setup-number').count(),3);
  assert.equal(await page.locator('.archive-lesson strong').count(),3);
  assert((await page.locator('[data-lesson=desktop]').getAttribute('href')).includes('group=pi5-04'));
  await page.locator('#initialSetup > summary').click();
  policy={...policy,current_lesson:'camera',current_step:0,revision:2};await tick();assert(await page.locator('#followTeacherLink').isVisible());
  policy={...policy,current_lesson:'camera',current_step:2,revision:3};await tick();
  assert(await page.locator('#followTeacherLink').isVisible());assert(await page.locator('#teacherSlot #teacherEntry').isVisible());
  assert((await page.locator('#followTeacherLink').getAttribute('href')).includes('group=pi5-04'));
  console.log('PASS setup links retain their group and labels; teacher links stay visible for old setup, optional checks and current course without opening the archive');
  await page.locator('[data-lesson=camera]').click();await page.locator('#cameraWorkspace').waitFor({state:'visible'});
  assert.equal(await page.locator('#cameraStage').inputValue(),'1');assert.equal(await page.locator('#cameraStageCount').innerText(),'1 / 7');
  assert(await page.locator('#cameraBack').isDisabled());assert(await page.locator('#cameraNext').isDisabled());
  assert(!(await page.locator('#cameraCommands').textContent()).includes('hostname'));assert(!(await page.locator('#cameraCommands').textContent()).includes('pwd'));
  await page.locator('#cameraStage').selectOption('0');assert.equal(await page.locator('#cameraStageCount').innerText(),'選用');assert(await page.locator('#cameraNext').isDisabled());
  await home();await page.locator('[data-lesson=camera]').click();await page.locator('#cameraWorkspace').waitFor({state:'visible'});assert.equal(await page.locator('#cameraStage').inputValue(),'1');
  await page.evaluate(()=>PiLearning.save('pi5-04',{lesson:'camera',cameraIndex:3,step:PiCameraCourse.stages[3].title,completed:{camera:false}}));
  await home();assert.equal(await page.locator('[data-lesson=camera]').innerText(),'繼續上課 →');assert(!await page.locator('#continueLink').isVisible());
  await page.locator('[data-lesson=camera]').click();await page.locator('#cameraWorkspace').waitFor({state:'visible'});assert.equal(await page.locator('#cameraStage').inputValue(),'3');
  assert(!reports.some(report=>report.p_status==='done'));
  await page.evaluate(()=>PiLearning.save('pi5-04',{completed:{camera:true}}));await home();assert(await page.locator('#currentCourseStatus').isVisible());assert.equal(await page.locator('[data-lesson=camera]').innerText(),'重新查看課程 →');assert(!(await page.locator('[data-lesson=camera]').getAttribute('href')).includes('resume=1'));await page.locator('[data-lesson=camera]').click();await page.locator('#cameraWorkspace').waitFor({state:'visible'});assert.equal(await page.locator('#cameraStage').inputValue(),'1');
  await page.goto(base+'camera.html?group=pi5-04&resume=1');await page.locator('#cameraWorkspace').waitFor({state:'visible'});assert.equal(await page.locator('#cameraStage').inputValue(),'1');assert(!reports.some(report=>report.p_status==='done'));
  console.log('PASS completed courses show review instead of resume and old resume links cannot trap students on the last stage');
  console.log('PASS course starts with folders, hostname checks remain optional, resume preserves the actual stage and skipped checks never report success');
  await home();policy={...policy,open_lessons:{...policy.open_lessons,camera:false},revision:3};await tick();
  assert.equal(await page.locator('[data-lesson=camera]').getAttribute('aria-disabled'),'true');assert.equal(await page.locator('[data-lesson=camera]').innerText(),'等老師開放');
  await page.locator('[data-lesson=camera]').dispatchEvent('click');assert(page.url().endsWith('/'));assert((await page.locator('#courseGroupStatus').innerText()).includes('尚未開放'));
  await page.goto(base+'#connectionHelp');assert(await page.locator('#connectionHelp').evaluate(e=>e.open));assert.deepEqual(errors,[]);console.log('PASS course release and direct troubleshooting links remain usable without browser errors');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
