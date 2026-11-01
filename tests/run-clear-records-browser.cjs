'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const pkg=process.env.PGLITE_ROOT||'@electric-sql/pglite',{PGlite}=require(pkg),{pgcrypto}=require(pkg+'/dist/contrib/pgcrypto.cjs');
(async()=>{
 const db=new PGlite({extensions:{pgcrypto}});await db.exec('create role anon;create role authenticated;create role service_role');await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/install.sql'),'utf8'));
 const room=fs.readFileSync(path.join(__dirname,'../config.js'),'utf8').match(/defaultRoomCode: '([^']+)'/)[1],password='clear-browser-staff';
 await db.query("insert into pi_helper.rooms(title,join_hash,teacher_hash,ends_at) values('Clear browser',encode(extensions.digest($1,'sha256'),'hex'),extensions.crypt($2,extensions.gen_salt('bf')),now()+interval '1 day')",[room,password]);
 const tokens={};for(const n of [1,2])tokens[n]=(await db.query('select public.pi_helper_teacher_pair_course($1,$2,$3::smallint) v',[room,password,n])).rows[0].v.course_token;
 const sequences={1:0,2:0};let run=0;
 async function send(group){await db.query('select public.pi_helper_course_event($1,$2::jsonb)',[tokens[group],JSON.stringify({hostname:'pi5-0'+group,sequence:++sequences[group],run_id:'11111111-1111-4111-8111-'+String(++run).padStart(12,'0'),task:'hello',status:'passed',evidence:{exit_code:0,group_output:true}})])}
 await send(1);await send(1);await send(2);
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),context=await browser.newContext(),errors=[],calls=[];
 let accept=true,failClear=false,missingClear=false,holdHistory=false,historyReady,releaseHistory,holdPair=false,pairReady,releasePair;
 await context.addInitScript(()=>{window.__testIntervals=[];window.setInterval=(fn,ms)=>{window.__testIntervals.push({fn,ms});return window.__testIntervals.length};window.clearInterval=()=>{}});
 context.on('page',p=>{p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>accept?d.accept():d.dismiss())});
 await context.route('https://*.supabase.co/**',async route=>{
  const name=route.request().url().split('/').pop(),args=route.request().postDataJSON()||{};calls.push({name,args});
  if(name==='pi_helper_teacher_clear_course_records'){
   if(failClear)return route.abort('internetdisconnected');
   if(missingClear)return route.fulfill({status:404,json:{code:'PGRST202',message:'function not found'}});
  }
  try{
   if(!/^pi_helper_[a-z_]+$/.test(name))throw Error('invalid RPC');
   const casts={p_groups:'smallint[]',p_group_no:'smallint',p_group_count:'smallint',p_revision:'bigint',p_rebind:'boolean',p_include_board:'boolean',p_visible:'boolean',p_enabled:'boolean',p_session_id:'uuid',p_id:'uuid',p_job_id:'uuid',p_current_step:'integer',p_open_lessons:'jsonb'},keys=Object.keys(args),values=keys.map(k=>k==='p_open_lessons'?JSON.stringify(args[k]):args[k]),expr=keys.map((k,i)=>k+'=> $'+(i+1)+(casts[k]?'::'+casts[k]:''));
   const result=['pi_helper_teacher_reports','pi_helper_teacher_room_info'].includes(name)?(await db.query('select * from public.'+name+'('+expr.join(',')+')',values)).rows:(await db.query('select public.'+name+'('+expr.join(',')+') v',values)).rows[0].v;
   if(holdHistory&&name==='pi_helper_teacher_course_runs'){holdHistory=false;historyReady();await new Promise(resolve=>releaseHistory=resolve)}
   if(holdPair&&name==='pi_helper_teacher_pair_course'){holdPair=false;pairReady();await new Promise(resolve=>releasePair=resolve)}
   await route.fulfill({json:result??null});
  }catch(e){await route.fulfill({status:400,json:{code:e.code||'ERROR',message:e.message}})}
 });
 const base=process.env.PI_HELPER_TEST_URL||'http://127.0.0.1:8040/',page=await context.newPage();
 await page.goto(base+'assistant.html?view=details&group=1');await page.locator('#teacherPassword').fill(password);await page.locator('.dashboard-login').evaluate(e=>e.onsubmit({preventDefault(){}}));await page.locator('#groupHelp [data-operation="hello-0"][data-state="passed"]').waitFor();
 const clearCalls=()=>calls.filter(c=>c.name==='pi_helper_teacher_clear_course_records');accept=false;await page.locator('#clearCourseRecords').click();assert.equal(clearCalls().length,0);accept=true;
 failClear=true;await page.locator('#clearCourseRecords').click();await page.waitForFunction(()=>document.querySelector('#clearCourseRecordsStatus').textContent.includes('未完成'));assert.equal(await page.locator('[data-operation="hello-0"]').getAttribute('data-state'),'passed');failClear=false;
 const ready=new Promise(resolve=>historyReady=resolve);holdHistory=true;await page.evaluate(()=>{document.querySelector('.dashboard-actions button').onclick()});await ready;
 await page.locator('#clearCourseRecords').click();await page.waitForFunction(()=>document.querySelector('#clearCourseRecordsStatus').textContent.includes('已清除第 1 組'));releaseHistory();await page.waitForTimeout(100);
 assert.equal(await page.locator('[data-operation="hello-0"]').getAttribute('data-state'),'pending');assert.equal(await page.locator('.operation-run').count(),0);
 assert.equal((await db.query('select count(*)::integer n from pi_helper.course_tasks where group_no=2')).rows[0].n,1);assert.equal(clearCalls().at(-1).args.p_group_no,1);assert.equal(clearCalls().at(-1).args.p_include_board,false);
 await send(1);await page.locator('.dashboard-actions button').first().evaluate(e=>e.onclick());await page.locator('[data-operation="hello-0"][data-state="passed"]').waitFor();
 console.log('PASS cancel sends no clear, failure preserves visible evidence, group-only clearing rejects stale history and the same paired Pi can report again');
 await page.getByRole('button',{name:'課堂設定',exact:true}).click();await page.locator('.clear-records > summary').click();assert(!await page.locator('#clearCourseDetails').isChecked());await page.locator('#clearCourseDetails').check();await page.locator('#clearGroup').selectOption('all');await page.locator('#clearReports').click();await page.waitForFunction(()=>document.querySelector('.clear-records [role=status]').textContent.includes('另清除'));assert.equal(clearCalls().at(-1).args.p_group_no,null);assert.equal(clearCalls().at(-1).args.p_include_board,true);assert.equal((await db.query('select count(*)::integer n from pi_helper.course_tasks')).rows[0].n,0);
 await page.getByRole('button',{name:'課堂工具',exact:true}).click();await page.locator('.legacy-tool-settings > summary').click();await page.locator('.course-setup > summary').click();await page.locator('#courseDeviceGroup').selectOption('2');const paired=new Promise(resolve=>pairReady=resolve);holdPair=true;await page.getByRole('button',{name:'產生課程回報設定碼',exact:true}).click();await paired;
 await page.getByRole('button',{name:'詳細內容',exact:true}).click();await page.locator('#clearCourseRecords').click();await page.waitForFunction(()=>document.querySelector('#clearCourseRecordsStatus').textContent.includes('已清除第 1 組'));releasePair();await page.getByRole('button',{name:'課堂工具',exact:true}).click();await page.locator('#courseSetupCode').waitFor();await page.waitForFunction(()=>!document.querySelector('.course-setup button').disabled);console.log('PASS clearing results does not interrupt a pending pairing action for another group');
 await page.getByRole('button',{name:'詳細內容',exact:true}).click();await send(1);await page.locator('.dashboard-actions button').first().evaluate(e=>e.onclick());missingClear=true;await page.locator('#clearCourseRecords').click();await page.waitForFunction(()=>document.querySelector('#clearCourseRecordsStatus').textContent.includes('最新 SQL'));assert(await page.locator('#clearCourseRecordsStatus a').isVisible());assert.equal((await db.query('select count(*)::integer n from pi_helper.course_tasks')).rows[0].n,1);missingClear=false;
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));for(const button of await page.locator('button:visible').all()){if(await button.evaluate(e=>e.classList.contains('stat-item')))continue;assert(await button.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.fontSize==='16px'&&s.lineHeight==='24px'&&s.borderRadius==='10px'&&s.fontWeight==='700'&&r.height>=48}));}await page.screenshot({path:'/tmp/pi-clear-details-'+width+'.png',fullPage:true})}
 assert.deepEqual(errors,[]);await browser.close();await db.close();console.log('PASS optional classroom-wide clearing, older SQL upgrade messaging and consistent accessible button metrics at 320–1280px');
})().catch(e=>{console.error(e);process.exit(1)});
