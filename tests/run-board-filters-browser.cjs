'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');const pkg=process.env.PGLITE_ROOT||'@electric-sql/pglite';const {PGlite}=require(pkg),{pgcrypto}=require(pkg.startsWith('/')?pkg+'/dist/contrib/pgcrypto.cjs':pkg+'/contrib/pgcrypto');
(async()=>{const db=new PGlite({extensions:{pgcrypto}});await db.exec('create role anon;create role authenticated');await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/setup.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/update-learning-tools.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/update-workbench-accounts.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/update-board-clear.sql'),'utf8'));const config=fs.readFileSync(path.join(__dirname,'../config.js'),'utf8'),room=config.match(/defaultRoomCode: '([^']+)'/)[1],teacher='test-teacher';await db.query("insert into pi_helper.rooms(title,join_hash,teacher_hash,ends_at) values('Browser test',encode(extensions.digest($1,'sha256'),'hex'),extensions.crypt($2,extensions.gen_salt('bf')),now()+interval '1 day')",[room,teacher]);
const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),ctx=await b.newContext();let missing=false,failClaim=false,failPolicy=false;const errors=[];ctx.on('page',p=>{p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept())});await ctx.addInitScript(()=>{window.__testIntervals=[];window.setInterval=(fn,ms)=>{window.__testIntervals.push({fn,ms});return window.__testIntervals.length};window.clearInterval=()=>{}});
const newMethods=new Set(['pi_helper_workbench_identity','pi_helper_workbench_accounts','pi_helper_workbench_save_account','pi_helper_workbench_admin_name','pi_helper_course_settings','pi_helper_teacher_course_settings','pi_helper_teacher_set_course','pi_helper_request_help','pi_helper_teacher_help','pi_helper_teacher_update_help','pi_helper_student_help','pi_helper_student_confirm_help']);await ctx.route('https://*.supabase.co/**',async route=>{const name=route.request().url().split('/').pop();if(!/^pi_helper_[a-z_]+$/.test(name))return route.abort();if(failPolicy&&name==='pi_helper_course_settings')return route.fulfill({status:503,json:{message:'test outage'}});if(failClaim&&name==='pi_helper_teacher_update_help')return route.fulfill({status:503,json:{message:'test outage'}});if(missing&&newMethods.has(name))return route.fulfill({status:404,json:{code:'PGRST202',message:'function not found'}});try{const args=route.request().postDataJSON()||{},keys=Object.keys(args);if(keys.some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('bad argument');const casts={p_session_id:'uuid',p_request_id:'uuid',p_id:'uuid',p_group_no:'smallint',p_group_count:'smallint',p_revision:'bigint',p_current_step:'integer',p_resolved:'boolean',p_active:'boolean',p_open_lessons:'jsonb'};const values=keys.map(k=>k==='p_open_lessons'?JSON.stringify(args[k]):args[k]);const expr=keys.map((k,i)=>k+'=> $'+(i+1)+(casts[k]?'::'+casts[k]:''));let result;if(['pi_helper_teacher_reports','pi_helper_teacher_room_info'].includes(name))result=(await db.query('select * from public.'+name+'('+expr.join(',')+')',values)).rows;else result=(await db.query('select public.'+name+'('+expr.join(',')+') as value',values)).rows[0].value;await route.fulfill({json:result??null})}catch(e){await route.fulfill({status:400,json:{message:e.message,code:e.code||'ERROR'}})}});


const base=process.env.PI_HELPER_TEST_URL||'http://127.0.0.1:8001/';
const secret='a'.repeat(48),sessions=new Map();
async function report(group,state,device=0,seq=1){
 const id='11111111-1111-4111-8111-'+String(group*10+device).padStart(12,'0');sessions.set(group+':'+device,id);
 await db.query("select public.pi_helper_student_report($1,$2::uuid,$3,$4::smallint,'連線排查','測試步驟',$5,$6,$7::bigint)",[room,id,secret,group,'測試學生回報',state,seq]);
}
for(const [group,state] of [[1,'need_help'],[2,'working'],[3,'done'],[4,'ended'],[5,'working'],[7,'need_help'],[8,'need_help'],[9,'done']])await report(group,state);
// A recent stuck report wins over a newer working report from a different device in the same group.
await report(7,'working',1);
await db.query("update pi_helper.reports set updated_at=now()-interval '2 minutes' where group_no in (5,8)");
const p=await ctx.newPage();await p.goto(base+'assistant.html');await p.locator('#teacherPassword').fill(teacher);await p.locator('.dashboard-login').evaluate(e=>e.onsubmit({preventDefault(){}}));await p.locator('.dashboard-actions').waitFor({state:'visible'});
const refresh=()=>p.locator('.dashboard-actions button').first().evaluate(e=>e.onclick());
const groups=()=>p.locator('.group-card:visible').evaluateAll(es=>es.map(e=>Number(e.dataset.group)));
const expected={need_help:[1,7],working:[2],done:[3,9],none:[4,6],stale:[5,8]};
assert.deepEqual(await groups(),[1,2,3,4,5,6,7,8,9]);
assert.equal(await p.locator('.dashboard-stats button').count(),5);
let total=0;
for(const [key,ids] of Object.entries(expected)){
 const button=p.locator('.stat-'+key);const count=Number(await button.locator('strong').innerText());total+=count;assert.equal(count,ids.length);
 await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');assert.deepEqual(await groups(),ids);assert.equal(await p.locator('.board-filter-bar button').getAttribute('aria-pressed'),'false');
 assert((await p.locator('.board-filter-summary').innerText()).includes(ids.length+' 組／共 9 組'));
}
assert.equal(total,9);
console.log('PASS all five statistics filter the exact groups, count groups once, and classify ended, stale and multi-device reports consistently');

await p.locator('.stat-need_help').click();await p.locator('.stat-need_help').evaluate(e=>{window.__stat=e;e.focus()});
await refresh();assert(await p.evaluate(()=>window.__stat.isConnected&&window.__stat===document.activeElement));assert.equal(await p.locator('.stat-need_help').getAttribute('aria-pressed'),'true');assert.deepEqual(await groups(),[1,7]);
await report(1,'working',0,2);await refresh();assert.equal(await p.locator('.stat-need_help strong').innerText(),'1');assert.deepEqual(await groups(),[7]);
await report(7,'working',0,2);await refresh();assert.equal(await p.locator('.stat-need_help strong').innerText(),'0');assert.deepEqual(await groups(),[]);assert(await p.locator('.board-filter-empty').isVisible());
await p.locator('.board-filter-bar button').click();assert.deepEqual(await groups(),[1,2,3,4,5,6,7,8,9]);assert(!await p.locator('.board-filter-empty').isVisible());
await p.locator('.stat-working').click();assert.deepEqual(await groups(),[1,2,7]);await p.locator('.stat-working').click();assert.deepEqual(await groups(),[1,2,3,4,5,6,7,8,9]);
await p.locator('.stat-working').focus();await p.keyboard.press('Enter');assert.deepEqual(await groups(),[1,2,7]);await p.keyboard.press('Space');assert.deepEqual(await groups(),[1,2,3,4,5,6,7,8,9]);
console.log('PASS selection and keyboard focus survive refresh; groups move with new reports, empty results are clear, and mouse/keyboard can restore all groups');

await p.locator('.stat-done').click();await p.locator('.group-card[data-group="3"]').getByRole('button',{name:'協助此組',exact:true}).click();await p.locator('#groupHelp').waitFor({state:'visible'});assert((await p.locator('#groupHelp h2').innerText()).includes('第 03 組'));await p.locator('#backToBoard').click();assert.deepEqual(await groups(),[3,9]);
await p.getByRole('button',{name:'課堂設定',exact:true}).click();await p.getByRole('button',{name:'← 首頁看板',exact:true}).click();assert.deepEqual(await groups(),[3,9]);
await db.query('select public.pi_helper_teacher_set_group_count($1,$2,7::smallint)',[room,teacher]);await refresh();assert.deepEqual(await groups(),[3]);assert((await p.locator('.board-filter-summary').innerText()).includes('共 7 組'));assert.equal(await p.locator('.stat-done strong').innerText(),'1');
await p.getByRole('button',{name:'關閉看板',exact:true}).click();await p.locator('#teacherPassword').fill(teacher);await p.locator('.dashboard-login').evaluate(e=>e.onsubmit({preventDefault(){}}));assert.deepEqual(await groups(),[1,2,3,4,5,6,7]);assert.equal(await p.locator('.board-filter-bar button').getAttribute('aria-pressed'),'true');
console.log('PASS filtered groups still open the correct assistance page, returning and switching tabs preserve filtering, group-count changes exclude removed groups, and logout resets the filter');

const student=await ctx.newPage();await student.goto(base);await student.waitForFunction(()=>!document.getElementById('courseGroup').disabled);await student.locator('#courseGroup').selectOption('pi5-05');
const gear=student.getByRole('link',{name:'工作台管理',exact:true});assert.equal((await gear.innerText()).trim(),'⚙️');assert.equal(await gear.getAttribute('href'),'assistant.html');
await student.evaluate(()=>PiLearning.save('pi5-05',{lesson:'ssh',phase:'flow',step:'輸入刷機時設定的密碼',flowPath:['login','password'],completed:{}}));
let policy=(await db.query('select public.pi_helper_teacher_course_settings($1,$2) value',[room,teacher])).rows[0].value;
await db.query('select public.pi_helper_teacher_set_course($1,$2,$3::jsonb,\'desktop\',3::integer,$4::bigint)',[room,teacher,JSON.stringify(policy.open_lessons),policy.revision]);
await student.evaluate(()=>window.__testIntervals.find(t=>t.ms===5000).fn());
assert(await student.locator('#followTeacherLink').isVisible());assert(await student.locator('#continueLink').isVisible());assert.equal(await student.locator('#continueLesson').getAttribute('data-teacher-ready'),'true');
assert.notEqual(await student.locator('#followTeacherLink').evaluate(e=>getComputedStyle(e).backgroundColor),await student.locator('#continueLink').evaluate(e=>getComputedStyle(e).backgroundColor));
assert(await student.locator('#teacherEntry').evaluate(e=>Boolean(e.compareDocumentPosition(document.querySelector('#continueLink'))&Node.DOCUMENT_POSITION_FOLLOWING)));
for(const width of [320,390,768,1280]){
 await p.setViewportSize({width,height:844});await student.setViewportSize({width,height:844});await p.locator('.stat-working').click();assert.deepEqual(await groups(),[1,2,7]);
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const button of await p.locator('.dashboard-stats button').all())assert(await button.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=48&&r.left>=0&&r.right<=innerWidth}));
 assert(await gear.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44}));
 if(width===390){await p.locator('.dashboard-board').screenshot({path:'/tmp/pi-clickable-stats-mobile.png'});await student.locator('.course-group').screenshot({path:'/tmp/pi-primary-teacher-entry-mobile.png'})}
 await p.locator('.board-filter-bar button').click();
}
await student.locator('#followTeacherLink').click();await student.locator('.x11-guided').waitFor({state:'visible'});assert.equal((await student.getByRole('link',{name:'工作台管理',exact:true}).innerText()).trim(),'⚙️');assert.equal(await student.getByRole('link',{name:'工作台管理',exact:true}).getAttribute('target'),'_blank');
console.log('PASS the backend gear retains an accessible label and touch size; teacher entry is primary, local resume remains usable, and filtered layouts fit 320–1280px');
assert.deepEqual(errors,[]);await b.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
