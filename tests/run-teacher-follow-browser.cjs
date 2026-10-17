'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');const pkg=process.env.PGLITE_ROOT||'@electric-sql/pglite';const {PGlite}=require(pkg),{pgcrypto}=require(pkg.startsWith('/')?pkg+'/dist/contrib/pgcrypto.cjs':pkg+'/contrib/pgcrypto');
(async()=>{const db=new PGlite({extensions:{pgcrypto}});await db.exec('create role anon;create role authenticated');await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/setup.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/update-learning-tools.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/update-workbench-accounts.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/update-board-clear.sql'),'utf8'));const config=fs.readFileSync(path.join(__dirname,'../config.js'),'utf8'),room=config.match(/defaultRoomCode: '([^']+)'/)[1],teacher='test-teacher';await db.query("insert into pi_helper.rooms(title,join_hash,teacher_hash,ends_at) values('Browser test',encode(extensions.digest($1,'sha256'),'hex'),extensions.crypt($2,extensions.gen_salt('bf')),now()+interval '1 day')",[room,teacher]);
const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),ctx=await b.newContext();let missing=false,failClaim=false,failPolicy=false;const errors=[];ctx.on('page',p=>{p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept())});await ctx.addInitScript(()=>{window.__testIntervals=[];window.setInterval=(fn,ms)=>{window.__testIntervals.push({fn,ms});return window.__testIntervals.length};window.clearInterval=()=>{}});
const newMethods=new Set(['pi_helper_workbench_identity','pi_helper_workbench_accounts','pi_helper_workbench_save_account','pi_helper_workbench_admin_name','pi_helper_course_settings','pi_helper_teacher_course_settings','pi_helper_teacher_set_course','pi_helper_request_help','pi_helper_teacher_help','pi_helper_teacher_update_help','pi_helper_student_help','pi_helper_student_confirm_help']);await ctx.route('https://*.supabase.co/**',async route=>{const name=route.request().url().split('/').pop();if(!/^pi_helper_[a-z_]+$/.test(name))return route.abort();if(failPolicy&&name==='pi_helper_course_settings')return route.fulfill({status:503,json:{message:'test outage'}});if(failClaim&&name==='pi_helper_teacher_update_help')return route.fulfill({status:503,json:{message:'test outage'}});if(missing&&newMethods.has(name))return route.fulfill({status:404,json:{code:'PGRST202',message:'function not found'}});try{const args=route.request().postDataJSON()||{},keys=Object.keys(args);if(keys.some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('bad argument');const casts={p_session_id:'uuid',p_request_id:'uuid',p_id:'uuid',p_group_no:'smallint',p_group_count:'smallint',p_revision:'bigint',p_current_step:'integer',p_resolved:'boolean',p_active:'boolean',p_open_lessons:'jsonb'};const values=keys.map(k=>k==='p_open_lessons'?JSON.stringify(args[k]):args[k]);const expr=keys.map((k,i)=>k+'=> $'+(i+1)+(casts[k]?'::'+casts[k]:''));let result;if(['pi_helper_teacher_reports','pi_helper_teacher_room_info'].includes(name))result=(await db.query('select * from public.'+name+'('+expr.join(',')+')',values)).rows;else result=(await db.query('select public.'+name+'('+expr.join(',')+') as value',values)).rows[0].value;await route.fulfill({json:result??null})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'ERROR'}})}});


const base=process.env.PI_HELPER_TEST_URL||'http://127.0.0.1:8001/';
const home=await ctx.newPage();
await home.goto(base);
await home.waitForFunction(()=>!document.getElementById('courseGroup').disabled);
await home.locator('#courseGroup').selectOption('pi5-05');
assert(!await home.locator('#followTeacherLink').isVisible());
const student=await ctx.newPage();
await student.goto(base+'student.html?group=pi5-05&lesson=flash&teacher=1');
await student.locator('#entryActions').waitFor({state:'visible'});
assert((await student.locator('#entryStatus').innerText()).includes('尚未指定'));
assert(!await student.locator('#studentWorkspace').isVisible());
console.log('PASS no specified teacher stage gives an explicit message and does not enter a default lesson');

const presenter=await ctx.newPage();
await presenter.goto(base+'presenter.html');
await presenter.locator('#presenterPassword').fill(teacher);
await presenter.locator('#presenterLogin').evaluate(e=>e.onsubmit({preventDefault(){}}));
async function specify(lesson,index){
 await presenter.locator('#presenterLesson').selectOption(lesson);
 await presenter.waitForFunction(id=>document.querySelector('#presenterStep').dataset.lesson===id&&!document.querySelector('#presenterStep').disabled,lesson);
 await presenter.locator('#presenterStep').selectOption(String(index));
 await presenter.waitForFunction(i=>document.querySelector('#presenterStep').value===String(i)&&!document.querySelector('#presenterStep').disabled,index);
 if(await presenter.locator('#presenterPublish').innerText()==='開始帶課'){await presenter.locator('#presenterPublish').click();await presenter.waitForFunction(()=>document.querySelector('#presenterMode').textContent.includes('帶課中'))}
 const policy=(await db.query('select public.pi_helper_teacher_course_settings($1,$2) value',[room,teacher])).rows[0].value;
 assert.equal(policy.current_lesson,lesson);assert.equal(policy.current_step,index);
}
await specify('desktop',3);
const tick=()=>home.evaluate(()=>window.__testIntervals.find(t=>t.ms===5000).fn());
await home.evaluate(()=>PiLearning.save('pi5-05',{lesson:'desktop',phase:'flow',step:'遠端桌面連線完成',flowPath:['desktopDone'],completed:{desktop:true}}));
await tick();
assert(await home.locator('#followTeacherLink').isVisible());
assert(!await home.locator('#continueLink').isVisible());
assert((await home.locator('#continueDescription').innerText()).includes('已自行確認完成'));
assert((await home.locator('#followTeacherLink').getAttribute('href')).includes('teacher=1'));
// Change the teacher stage after the home page rendered: entry must fetch the newest stage.
await specify('desktop',7);
await home.locator('#followTeacherLink').click();
await home.locator('#screen').waitFor({state:'visible'});
assert.equal(await home.locator('#screen h2').innerText(),'填寫樹莓派的桌面帳密');
assert((await home.locator('#screen .kicker').innerText()).includes('第 8 步'));
assert(await home.evaluate(()=>PiLearning.read('pi5-05').completed.desktop));
assert(!home.url().includes('teacher=1'));
assert(home.url().includes('group=pi5-05'));
console.log('PASS teacher can directly specify any step, and completed students can enter the latest stage with their own group');

await specify('desktop',3);
await home.locator('#followTeacherNow').click();
await home.locator('.x11-guided').waitFor({state:'visible'});
assert.equal(await home.locator('.x11-guided').getAttribute('data-stage'),'0');
await home.locator('.x11-guided .action-row .primary').click();
await specify('desktop',6);
assert.equal(await home.locator('.x11-guided').getAttribute('data-stage'),'1');
await home.reload();
await home.locator('.x11-guided').waitFor({state:'visible'});
assert.equal(await home.locator('.x11-guided').getAttribute('data-stage'),'1');
assert((await home.locator('#screen .kicker').innerText()).includes('第 4 步'));
failPolicy=true;
await home.locator('#followTeacherNow').click();
await home.locator('#entryActions').waitFor({state:'visible'});
assert((await home.locator('#entryStatus').innerText()).includes('暫時無法確認'));
assert(await home.locator('.x11-guided').isVisible());
assert.equal(await home.locator('.x11-guided').getAttribute('data-stage'),'1');
failPolicy=false;
await home.locator('#retryStudentEntry').click();
await home.waitForFunction(()=>document.querySelector('#screen h2')?.textContent==='開啟 Windows 遠端桌面');
assert((await home.locator('#screen pre').innerText()).includes('pi5-05.local'));
console.log('PASS following is an explicit action; refresh resumes the exact X11 substep, and a failed follow preserves work and retries correctly');

await specify('desktop',8);
await student.goto(base+'student.html?group=pi5-06&lesson=desktop&teacher=1');
await student.locator('#screen').waitFor({state:'visible'});
assert((await student.locator('#screen h2').innerText()).includes('確認本組是否完成'));
assert(!await student.evaluate(()=>Boolean(PiLearning.read('pi5-06').completed.desktop)));
await student.reload();
await student.locator('#screen').waitFor({state:'visible'});
assert(!await student.evaluate(()=>Boolean(PiLearning.read('pi5-06').completed.desktop)));
const reportArgs=await student.evaluate(()=>{let snapshot;const original=ClassSync.publish;ClassSync.publish=value=>{snapshot=value;return original(value)};PiStudentFlow.report();ClassSync.publish=original;return snapshot});
assert.equal(reportArgs.status,'working');assert.equal(reportArgs.completion,null);
await student.locator('#screen').getByRole('button',{name:'已看到本組 Pi 桌面，確認完成',exact:true}).click();
assert(await student.evaluate(()=>PiLearning.read('pi5-06').completed.desktop));
console.log('PASS opening or reloading a teacher completion slide does not mark success; students must confirm their actual result');

// Every teaching slide maps to an operation; entering a slide does not execute its command.
for(const lesson of ['flash','ssh','desktop','shutdown']){
 const count=await student.evaluate(id=>PiLessonCatalog[id].steps.length,lesson);
 for(let index=0;index<count;index++){
  const result=await student.evaluate(({lesson,index})=>{
   const entered=PiStudentFlow.enterStage('pi5-06',lesson,index);
   return {entered,saved:PiLearning.read('pi5-06'),expected:PiLessonCatalog[lesson].steps[index].studentStep};
  },{lesson,index});
  assert(result.entered);
  if(lesson==='flash')assert.equal(result.saved.flashIndex,index);
  else assert.equal(result.saved.flowPath.at(-1),result.expected);
 }
}
assert(!await student.evaluate(()=>PiStudentFlow.enterStage('pi5-06','desktop',99)));
console.log('PASS every flash, SSH, desktop and shutdown slide maps to its matching student operation');

await home.goto(base);
await home.waitForFunction(()=>!document.getElementById('courseGroup').disabled);
for(const page of [home,student]){
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});
  await page.locator('#openStudentGuide').click();
  const dialog=page.locator('.guide-dialog');
  await dialog.waitFor({state:'visible'});
  for(let i=0;i<6;i++){
   assert((await dialog.locator('.guide-top p').innerText()).includes((i+1)+' / 6'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   if(i===1){assert((await dialog.innerText()).includes('已自行確認完成'));if(width===390)await dialog.screenshot({path:page===home?'/tmp/pi-home-guide-mobile.png':'/tmp/pi-student-guide-mobile.png'})}
   if(i===4)assert((await dialog.innerText()).includes('仍有問題，請再幫忙'));
   await dialog.locator('.guide-controls .primary').click();
  }
  assert(!await dialog.isVisible());console.log('PASS six guide pages and dialog layout '+(page===home?'home':'student')+' '+width+'px');
 }
 assert(await page.evaluate(()=>localStorage.getItem('pi-helper-guide-v4-seen')==='1'));
}
// The same guide is also directly available before selecting a group on the course home page.
await home.goto(base);
await home.waitForFunction(()=>!document.getElementById('courseGroup').disabled);
await home.locator('#openStudentGuide').click();
await home.locator('.guide-dialog').waitFor({state:'visible'});
await home.locator('.guide-dialog .guide-skip').click();
assert(await home.locator('#openStudentGuide').evaluate(e=>e===document.activeElement));
console.log('PASS the updated six-part guide works from both pages, closes without restarting lessons, restores focus and fits all tested phone widths');
assert.deepEqual(errors,[]);await b.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
