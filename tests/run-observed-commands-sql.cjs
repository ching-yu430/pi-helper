'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),pkg=process.env.PGLITE_ROOT||'@electric-sql/pglite';
const {PGlite}=require(pkg),{pgcrypto}=require(pkg+'/dist/contrib/pgcrypto.cjs');
(async()=>{
 const db=new PGlite({extensions:{pgcrypto}});await db.exec('create role anon;create role authenticated;create role service_role');await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/install.sql'),'utf8'));
 const roomRow=(await db.query(fs.readFileSync(path.join(__dirname,'../supabase/create-classroom.sql'),'utf8'))).rows[0],room=roomRow['課堂加入碼_給學生'],pw=roomRow['助教管理碼_僅助教保管'];
 const q=async(s,args=[])=>(await db.query(s,args)).rows[0]?.v;
 const token=(await q('select public.pi_helper_teacher_pair_course($1,$2,1::smallint) v',[room,pw])).course_token;
 const read=()=>q('select public.pi_helper_student_camera($1,1::smallint) v',[room]);let sequence=0;
 const event=(task,evidence,status='passed',host='pi5-01')=>q('select public.pi_helper_course_event($1,$2::jsonb) v',[token,JSON.stringify({hostname:host,sequence:++sequence,run_id:'11111111-1111-4111-8111-'+String(sequence).padStart(12,'0'),task,status,evidence})]);
 await db.exec('set role anon');await event('folders',{folders_ok:true});assert(!(await read()).tasks.some(t=>t.task==='mkdir_photos'));
 const base={observed:true,exit_code:0,cwd:'project',recorded_at:'2026-11-01T08:00:00.000000+00:00'};
 for(const [task,extra] of [['terminal_ready',{hook_ready:true}],['host_name',{hostname_ok:true}],['working_dir',{}],['mkdir_photos',{folder_exists:true,already_existed:true}],['enter_project',{}],['list_project',{photos_listed:true}]]){
  await event(task,{...base,...extra,raw_command:'must never be retained',stdout:'private'});
  const item=(await read()).tasks.find(t=>t.task===task);assert.equal(item.status,'passed');assert(!Object.hasOwn(item.evidence,'raw_command'));assert(!Object.hasOwn(item.evidence,'stdout'));assert.equal(item.evidence.recorded_at,base.recorded_at);
 }
 assert.equal((await read()).shell_steps_supported,true);
 for(const [task,evidence] of [['mkdir_photos',{...base}],['enter_project',{...base,cwd:'home'}],['list_project',{...base,photos_listed:false}],['host_name',{...base,hostname_ok:false}],['working_dir',{...base,observed:false}],['enter_project',{...base,error_code:'command_failed'}],['working_dir',{...base,exit_code:300}],['working_dir',{...base,recorded_at:'secret text'}]])await assert.rejects(()=>event(task,evidence),/INVALID_COURSE_EVENT/);
 await event('enter_project',{...base,cwd:'home',exit_code:1,error_code:'command_failed'},'failed');assert.equal((await read()).tasks.find(t=>t.task==='enter_project').status,'failed');
 const rows=await q('select public.pi_helper_teacher_course_runs($1,$2,1::smallint) v',[room,pw]);assert(rows[0].runs.filter(t=>t.evidence.observed).every(t=>t.started_at===null));
 await assert.rejects(()=>event('arbitrary_terminal_command',base),/INVALID_COURSE_EVENT/);await assert.rejects(()=>event('working_dir',base,'passed','pi5-02'),/COURSE_HOST_MISMATCH/);
 await assert.rejects(()=>db.query('select * from pi_helper.course_runs'),/permission denied/);await db.close();
 console.log('PASS fixed native operations, real failure evidence, no retroactive mkdir from folder checks, private paths/output stripped, timestamp/exit validation and no invented start times');
})().catch(e=>{console.error(e);process.exit(1)});
