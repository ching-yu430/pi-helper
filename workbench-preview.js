(()=>{
'use strict';
// This adapter is included ONLY by workbench-preview.html. It has no live
// endpoint, credentials, fetch calls or storage for the simulated classroom.
if(!document.body.hasAttribute('data-preview'))return;
const clone=value=>JSON.parse(JSON.stringify(value)),now=()=>Date.now(),stamp=(ago=0)=>new Date(now()-ago*1000).toISOString();
const host=group=>'pi5-'+String(group).padStart(2,'0');
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const scenarios=[
 {group:0,title:'全班總覽：九組不同狀況',hint:'點「查看本組」看操作清單；有求助的組別另外顯示「處理求助」。'},
 {group:1,title:'第 01 組｜照片資料夾檢查成功',hint:'展開「確認資料夾可寫入」。mkdir、cd、ls 仍顯示尚無獨立回報，不會一起打勾。'},
 {group:2,title:'第 02 組｜拍照工具安裝中',hint:'後台顯示執行中。按下方按鈕，模擬安裝結束，觀察結果與下一步改變。',advance:'模擬安裝完成'},
 {group:3,title:'第 03 組｜Python 失敗與重試',hint:'上次成功、這次失敗。展開「執行紀錄」比較兩次結果，再模擬重試成功。',advance:'模擬重試成功'},
 {group:4,title:'第 04 組｜找不到相機、學生求助',hint:'可先查看而不接手；展開「本組求助」試著接手、請學生再試一次，最後模擬學生確認解決。',advance:'模擬接回相機'},
 {group:5,title:'第 05 組｜安裝後沒有後續回報',hint:'顯示狀態待確認，保留上次資料；不會直接判定失敗或關機。',advance:'模擬恢復回報'},
 {group:6,title:'第 06 組｜拍照課的設備檢查完成',hint:'預覽、1080P 存檔與正常結束為同一次操作；照片品質及筆電下載另標學生自行確認。'},
 {group:7,title:'第 07 組｜只按網頁完成、沒有 Pi 證據',hint:'學生自行確認與樹莓派驗證分開。這組不能因為按了完成就顯示設備檢查通過。'},
 {group:8,title:'第 08 組｜尚未收到任何紀錄',hint:'沒有紀錄不代表學生沒操作。可以看到尚無紀錄與工具安裝確認提示。'},
 {group:9,title:'第 09 組｜剛安裝課堂工具',hint:'展開「設備資訊」可看版本、服務與備用 IP。安裝工具完成不等於課程完成。'}
];
let devices,courses,reports,help,installations,runNumber=0,current=0,chosen=new Set();
const policy={open_lessons:{flash:true,ssh:true,desktop:true,shutdown:true,camera:true},current_lesson:'camera',current_step:1,revision:1,teaching_paused:false,pause_supported:true,camera_supported:true,camera_checks_supported:true,camera_checks_enabled:true};
function record(group,task,status,evidence={},run=id(++runNumber),ago=0){
 const row=courses[group-1],sequence=++row.sequence,date=stamp(ago),existing=row.runs.find(r=>r.task===task&&r.run_id===run);
 const item={task,status,evidence:clone(evidence),run_id:run,sequence,received_at:date};
 row.tasks=row.tasks.filter(t=>t.task!==task);row.tasks.push(item);row.received_at=date;
 const history={...clone(item),started_at:existing?.started_at||(status==='running'?date:null),finished_at:status==='running'?null:date};
 row.runs=row.runs.filter(r=>r.task!==task||r.run_id!==run);row.runs.push(history);return run;
}
function attempt(group,task,evidence={},ago=0){const run=id(++runNumber);record(group,task,'running',{},run,ago+4);record(group,task,'passed',evidence,run,ago);return run}
function browser(group,step,state='working',completion=null){return {group_no:group,session_id:id(900+group),state,stage:'Python與USB拍照',step,result:JSON.stringify({_pi:1,text:completion?'學生已確認照片品質與 Windows 下載':'正在依教材操作；設備結果另列',step_at:stamp(30),completion}),updated_at:stamp(5)}}
function seed(){
 runNumber=0;chosen=new Set();devices=[];courses=[];reports=[];help=[];installations=[];
 for(let group=1;group<=9;group++){
  const enabled=![7,8].includes(group),stale=group===5;
  devices.push({group_no:group,enabled,received_at:enabled?stamp(stale?300:10):null,snapshot:enabled?{hostname:host(group),ssh:'active',xrdp:'active',display:'x11',xrdp_installed:true,xorgxrdp_installed:true,python_version:'Python 3.11.2',usb_cameras:group===4?0:1,free_mb:8192,uptime_seconds:1200}:null});
  courses.push({group_no:group,enabled,sequence:0,tasks:[],runs:[],received_at:null,network:enabled?[{interface:'wlan0',ip:'192.168.43.'+(20+group)}]:[]});
  installations.push({group_no:group,installed_version:enabled?'1.0.0':null,completed_at:enabled?stamp(1800):null,job:null});
  if(enabled)attempt(group,'location',{cwd:'home',python_version:'3.11.2'},600);
  if(enabled&&group!==9)attempt(group,'folders',{folders_ok:true},500);
  if([2,3,4,5,6].includes(group))attempt(group,'hello',{group_output:true,exit_code:0},450);
  if([2,4,5,6].includes(group)){attempt(group,'write',{group_output:true,new_file:true,exit_code:0},400);attempt(group,'update',{exit_code:0},350)}
  if([4,6].includes(group))attempt(group,'install',{exit_code:0},300);
 }
 record(2,'install','running',{},undefined,10);
 const failed=id(++runNumber);record(3,'hello','running',{},failed,30);record(3,'hello','failed',{error_code:'python_failed'},failed,25);
 const cameraRun=id(++runNumber);record(4,'environment','running',{},cameraRun,35);record(4,'environment','failed',{error_code:'camera_missing'},cameraRun,30);
 record(5,'install','running',{},undefined,300);
 attempt(6,'environment',{cv2_ok:true,tk_ok:true,v4l_ok:true,device:'/dev/video0',python_version:'3.11.2',opencv_version:'4.6.0',os:'示範系統版本',arch:'aarch64'},250);
 const capture=id(++runNumber);record(6,'camera','running',{},capture,200);record(6,'camera','passed',{readable:true,width:1280,height:720},capture,195);record(6,'photo','passed',{readable:true,width:1920,height:1080,bytes:245760,file_name:'pi5-06_practice_20261030_120000_000001_deadbeef.jpg',photo_count:1},capture,170);record(6,'camera_exit','passed',{released:true},capture,160);
 reports=[browser(1,'建立並找到課程資料夾'),browser(2,'安裝 OpenCV 並確認 USB 相機'),browser(3,'親手寫第一個 Python 程式'),browser(4,'安裝 OpenCV 並確認 USB 相機','need_help'),browser(5,'安裝 OpenCV 並確認 USB 相機'),browser(6,'把照片下載到 Windows','done','camera'),browser(7,'把照片下載到 Windows','done','camera'),browser(9,'建立並找到課程資料夾')];
 help=[{id:id(999),group_no:4,stage:'Python與USB拍照',step:'安裝 OpenCV 並確認 USB 相機',message:'USB 相機已接到樹莓派，但檢查找不到相機。',status:'open',assignee:null,revision:1,requested_at:stamp(180),updated_at:stamp(30)}];
}
seed();
window.PI_HELPER_CONFIG=Object.freeze({defaultRoomCode:'workbench-preview-only',pollMs:5000});
window.PiSyncAPI={configured:()=>true,pollMs:5000,async rpc(name,args={}){
 let result;
 switch(name){
 case 'pi_helper_group_settings':result={group_count:9};break;
 case 'pi_helper_teacher_room_info':result=[{title:'模擬課堂',active:true,ends_at:new Date(now()+86400000).toISOString()}];break;
 case 'pi_helper_teacher_reports':result=reports.map(r=>({...r,updated_at:r.group_no===5?r.updated_at:stamp(5)}));break;
 case 'pi_helper_teacher_devices':result=devices.map(r=>{const live=r.enabled&&(r.group_no!==5||chosen.has(5)),received_at=live?stamp(10):r.received_at;return {...r,received_at,age_seconds:received_at?Math.max(0,(now()-Date.parse(received_at))/1000):null}});break;
 case 'pi_helper_teacher_camera':{const running=courses[1].tasks.find(t=>t.task==='install'&&t.status==='running');if(running){running.received_at=stamp(10);const history=courses[1].runs.find(r=>r.run_id===running.run_id);if(history)history.received_at=running.received_at}result=courses.map(({runs,sequence,...r})=>({...r,age_seconds:r.received_at?Math.max(0,(now()-Date.parse(r.received_at))/1000):null}));break;}
 case 'pi_helper_teacher_course_runs':result=courses.filter(r=>!args.p_group_no||r.group_no===args.p_group_no).map(r=>({group_no:r.group_no,runs:r.runs}));break;
 case 'pi_helper_workbench_identity':result={id:id(800),name:'示範助教',admin:false};break;
 case 'pi_helper_teacher_course_settings':case 'pi_helper_course_settings':result=policy;break;
 case 'pi_helper_teacher_help':result=help;break;
 case 'pi_helper_teacher_tools':result={supported:true,versions:['1.0.0'],groups:installations};break;
 case 'pi_helper_teacher_update_help':{
  const row=help.find(r=>r.id===args.p_id);if(!row||row.revision!==args.p_revision)throw Error('模擬求助已更新，請重新讀取。');
  if(!['open','claimed','waiting','resolved'].includes(args.p_status))throw Error('不支援此模擬狀態。');
  Object.assign(row,{status:args.p_status,assignee:args.p_assignee,revision:row.revision+1,updated_at:stamp()});if(row.status==='resolved')row.resolved_by='teacher';result=row;break;
 }
 default:throw Error('這項設定不在情境預覽範圍內；正式課堂沒有變更。');
 }
 return clone(result);
}};
function dismissNotice(){const dialog=document.getElementById('helpRequestDialog');if(dialog?.open)dialog.querySelector('.help-request-actions button:last-child')?.click()}
async function refresh(){await document.querySelector('.dashboard-actions button')?.onclick();dismissNotice()}
function showScenario(group){const url=new URL(location.href);if(group)url.searchParams.set('scenario',String(group));else url.searchParams.delete('scenario');history.replaceState(null,'',url);current=group;document.getElementById('previewScenario').value=String(group);const sample=scenarios.find(s=>s.group===group);document.getElementById('previewHint').textContent=sample.hint;
 const advance=document.getElementById('previewAdvance');advance.textContent=sample.advance||'';advance.hidden=!sample.advance;advance.disabled=chosen.has(group);
 document.getElementById('previewStudentConfirm').hidden=group!==4;
 dismissNotice();if(!group){document.querySelector('.assistant-views button').click();return}
 document.querySelector('.group-card[data-group="'+group+'"] .group-help-button')?.click();
}
document.addEventListener('DOMContentLoaded',async()=>{
 const select=document.getElementById('previewScenario');select.replaceChildren();for(const sample of scenarios){const option=document.createElement('option');option.value=String(sample.group);option.textContent=sample.title;select.append(option)}
 select.onchange=()=>showScenario(Number(select.value));document.getElementById('detailGroupSelect').addEventListener('change',event=>showScenario(Number(event.target.value)));document.getElementById('previewReset').onclick=()=>{location.href='workbench-preview.html'};
 document.getElementById('previewAdvance').onclick=async()=>{
  if(chosen.has(current))return;const group=current,button=document.getElementById('previewAdvance');button.disabled=true;
  if(group===2){const run=courses[1].tasks.find(t=>t.task==='install').run_id;record(2,'install','passed',{exit_code:0},run)}
  if(group===3)attempt(3,'hello',{group_output:true,exit_code:0});
  if(group===4){devices[3].snapshot.usb_cameras=1;attempt(4,'environment',{cv2_ok:true,tk_ok:true,v4l_ok:true,device:'/dev/video0',python_version:'3.11.2',opencv_version:'4.6.0'})}
  if(group===5){devices[4].received_at=stamp();const run=courses[4].tasks.find(t=>t.task==='install').run_id;record(5,'install','passed',{exit_code:0},run);reports.find(r=>r.group_no===5).updated_at=stamp()}
  chosen.add(group);await refresh();document.getElementById('previewHint').textContent=group===4?'模擬相機檢查已通過。求助仍需助教處理及學生確認，不會自動結束。':'已送出模擬成功結果。展開該項執行紀錄，可看到之前的狀況。';
 };
 document.getElementById('previewStudentConfirm').onclick=async()=>{const row=help[0];if(row.status!=='waiting'){document.getElementById('previewHint').textContent='先在「本組求助」接手，再按「請學生再試一次」，才能模擬學生確認解決。';return}Object.assign(row,{status:'resolved',resolved_by:'student',revision:row.revision+1,updated_at:stamp()});reports.find(r=>r.group_no===4).state='working';await refresh();document.getElementById('previewHint').textContent='模擬學生已確認解決，求助移到已結束紀錄；這不會替尚未操作的課程打勾。'};
 // Keep sample groups out of real course pages and installation links.
 document.addEventListener('click',event=>{const link=event.target.closest('a'),inspect=event.target.closest('#inspectGroupSteps');if(link&&!link.hasAttribute('data-leave-preview')||inspect){event.preventDefault();event.stopImmediatePropagation();document.getElementById('previewHint').textContent='這裡只預覽後台。要操作正式教材，請先離開預覽。'}},true);
 try{document.getElementById('teacherPassword').value='preview-only';await document.querySelector('.dashboard-login').onsubmit({preventDefault(){}});dismissNotice();select.disabled=false;const selected=Number(new URLSearchParams(location.search).get('scenario')||0);showScenario(scenarios.some(s=>s.group===selected)?selected:0);document.body.dataset.previewReady='true'}catch{document.getElementById('previewHint').textContent='預覽載入失敗，請重新整理。'}
});
})();
