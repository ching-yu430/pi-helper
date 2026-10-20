(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const room=()=>window.PI_HELPER_CONFIG?.defaultRoomCode||'';
const hostname=group=>'pi5-'+String(group).padStart(2,'0');
function status(row,error){
 if(error==='FEATURE_UNAVAILABLE')return {state:'disabled',text:'設備回報尚未啟用',hint:''};
 if(error)return {state:'unknown',text:'設備狀態讀取失敗',hint:'尚無法確認，請重試；保留原本操作步驟。'};
 if(!row)return {state:'unknown',text:'正在確認設備回報',hint:''};
 if(!row.enabled)return {state:'disabled',text:'設備回報尚未啟用',hint:'可繼續照步驟操作。'};
 if(!row.received_at)return {state:'waiting',text:'等候 Pi 首次回報',hint:'請助教確認回報程式已安裝並連上網路。'};
 const age=Number(row.age_seconds)+(Date.now()-(row.fetchedAt||Date.now()))/1000;
 if(!Number.isFinite(age)||age>90)return {state:'stale',text:'Pi 暫無回報',hint:'超過 90 秒未收到資料，請確認供電與網路；不代表已關機。'};
 return {state:'fresh',text:'已收到 Pi 設備回報',hint:'設備檢查不代表筆電已成功登入。'};
}
const service=value=>({active:'已啟動',inactive:'未啟動',failed:'啟動失敗',activating:'啟動中',deactivating:'停止中',missing:'尚未安裝',unknown:'無法確認'})[value]||'無法確認';
const installed=value=>value===true?'已安裝':value===false?'尚未安裝':'無法確認';
function render(container,row,{group,detailed=false,error='',step=''}={}){
 const state=status(row,error);container.dataset.deviceState=state.state;container.replaceChildren();
 container.append(make('p',state.text,'device-status-title'));
 if(error==='FEATURE_UNAVAILABLE')container.append(make('p','請老師先完成設備回報功能更新。','muted'));
 else if(state.hint)container.append(make('p',state.hint,'muted'));
 const snapshot=row?.snapshot;
 if(snapshot&&row.enabled){
  const fresh=state.state==='fresh',match=snapshot.hostname===hostname(group);
  if(!fresh)container.append(make('p','以下是上次收到的資料，現在的狀態尚無法確認。','device-warning'));
  if(!match)container.append(make('p','主機名稱不同：應為 '+hostname(group)+'，設備回報為 '+snapshot.hostname+'。先請助教核對組別。','device-warning'));
  if(detailed){
   const list=make('dl',undefined,'device-check-list');
   const values=[['主機名稱',snapshot.hostname],['SSH',service(snapshot.ssh)],['遠端桌面服務',service(snapshot.xrdp)],['xrdp 套件',installed(snapshot.xrdp_installed)],['xorgxrdp 套件',installed(snapshot.xorgxrdp_installed)],['本機桌面設定',({x11:'X11',wayland:'Wayland',unknown:'無法確認'})[snapshot.display]||'無法確認'],['Python',snapshot.python_version||'無法確認'],['USB 相機',snapshot.usb_cameras===null?'無法確認':snapshot.usb_cameras>0?'偵測到 '+snapshot.usb_cameras+' 台':'尚未偵測到'],['可用空間',snapshot.free_mb===null?'無法確認':snapshot.free_mb+' MB']];
   for(const [key,value] of values)list.append(make('dt',key),make('dd',value));container.append(list);
   container.append(make('p','相機僅檢查是否被系統偵測到；X11 顯示設定值，仍需依課程重新開機。','muted'));
  }else container.append(make('p',step&&['login','trust','password','verify','name','tcp','network','localCheck','account'].includes(step)?'SSH：'+service(snapshot.ssh):'SSH：'+service(snapshot.ssh)+' · 遠端桌面：'+service(snapshot.xrdp),'device-service-summary'));
  if(fresh&&match&&step){
   const messages={enableXrdp:snapshot.xrdp==='active'?'設備已回報遠端桌面服務啟動。請核對指令結果後，再選下一步。':'',installXrdp:snapshot.xrdp_installed&&snapshot.xorgxrdp_installed?'設備已回報兩個套件安裝完成。請確認安裝視窗已回到命令列。':'',x11:snapshot.display==='x11'?'設備已回報 X11 設定。完成鍵盤操作後，仍要依下一步重新開機。':'',verify:'設備回報主機名稱為 '+hostname(group)+'。登入帳號仍請用 whoami 核對。'};
   if(messages[step])container.append(make('p',messages[step],'device-check-result'));
  }
 }
 if(row?.received_at){const time=new Date(row.received_at);if(Number.isFinite(time.getTime()))container.append(make('p','最後收到設備回報：'+time.toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),'muted'))}
}
function createTeacher({settings,request}){
 let rows=new Map(),error='',epoch=0,readSequence=0,busy=false,active=false;
 const section=make('details',undefined,'settings-section device-settings'),title=make('summary','樹莓派設備回報'),intro=make('p','由助教在各組 Pi 安裝一次，之後開機會自動回報；重刷後需重新安裝。'),label=make('label','選擇要設定的組別'),select=make('select'),actions=make('div',undefined,'action-row'),pair=make('button','產生安裝設定碼'),disable=make('button','停用此組設備回報'),message=make('p',undefined,'muted'),setup=make('div',undefined,'device-installation');
 select.id='deviceGroup';label.append(select);message.setAttribute('role','status');pair.type=disable.type='button';setup.hidden=true;actions.append(pair,disable);
 const docs=make('a','安裝、停用與排查說明 ↗');docs.href='docs/DEVICE_MONITOR.md';docs.target='_blank';docs.rel='noopener';
 section.append(title,intro,label,actions,message,setup,docs);settings.append(section);
 function options(){const old=select.value;select.replaceChildren();for(let group=1;group<=(window.PiGroups?.count||9);group++){const o=make('option','第 '+String(group).padStart(2,'0')+' 組 · '+hostname(group));o.value=String(group);select.append(o)}if(Number(old)>0&&Number(old)<=(window.PiGroups?.count||9))select.value=old;setup.replaceChildren();setup.hidden=true}
 options();document.addEventListener('pi-helper-groups-changed',options);select.onchange=()=>{setup.replaceChildren();setup.hidden=true;message.textContent=''};
 function paint(){for(const container of document.querySelectorAll('[data-device-group]')){const group=Number(container.dataset.deviceGroup);render(container,rows.get(group),{group,detailed:container.dataset.deviceDetailed==='true',error})}}
 function upgrade(){message.replaceChildren(make('span','尚未啟用，請老師先執行資料庫升級。 '));const link=make('a','查看更新步驟');link.href='classroom-setup.html#deviceMonitorUpgrade';message.append(link)}
 async function refresh(){const token=epoch,sequence=++readSequence;active=true;try{const data=await request('pi_helper_teacher_devices');if(token!==epoch||sequence!==readSequence)return;if(!Array.isArray(data))throw Error('設備資料格式不符。');rows=new Map(data.map(row=>[Number(row.group_no),{...row,fetchedAt:Date.now()}]));error='';}catch(e){if(token!==epoch||sequence!==readSequence)return;error=e.code||'READ_FAILED';if(e.code==='FEATURE_UNAVAILABLE')upgrade()}if(token===epoch&&sequence===readSequence)paint()}
 function attach(container,group,detailed=false){const slot=make('div',undefined,'device-status');slot.dataset.deviceGroup=String(group);slot.dataset.deviceDetailed=String(detailed);container.append(slot);render(slot,rows.get(group),{group,detailed,error});return slot}
 async function copy(text,pre){try{await navigator.clipboard.writeText(text);message.textContent='已複製，請在本組 Pi 執行。'}catch{const range=document.createRange();range.selectNodeContents(pre);getSelection().removeAllRanges();getSelection().addRange(range);message.textContent='請手動複製已選取的這一行。'}}
 pair.onclick=async()=>{
  if(busy||!active)return;const group=Number(select.value),token=epoch;
  if(!confirm('產生第 '+group+' 組的安裝設定碼？\n此組舊的設備憑證會立即失效，需用新設定碼重新安裝。'))return;
  busy=true;pair.disabled=disable.disabled=select.disabled=true;setup.replaceChildren();setup.hidden=true;message.textContent='正在產生…';
  try{
   const data=await request('pi_helper_teacher_pair_device',{p_group_no:group});if(token!==epoch)return;
   if(!/^[a-f0-9]{64}$/.test(data?.device_token)||data.expected_hostname!==hostname(group))throw Error('無法確認設備配對結果。');
   const config=window.PI_HELPER_CONFIG,code=btoa(JSON.stringify({url:config.supabaseUrl.replace(/\/$/,''),key:config.supabaseKey,device_token:data.device_token,expected_hostname:data.expected_hostname}));
   setup.hidden=false;setup.append(make('h4','在第 '+group+' 組已登入 Pi 的 SSH 視窗操作'),make('p','依序執行下方兩行。第 2 行出現提示時，再貼上安裝設定碼並按 Enter。'));
   setup.append(PiCommandSteps.build("curl --fail --location --proto '=https' https://raw.githubusercontent.com/ching-yu430/pi-helper/main/device-agent/pi_reporter.py --output /tmp/pi-helper-device.py\nsudo python3 /tmp/pi-helper-device.py install",{onCopy:copy}));
   const codeLabel=make('label','安裝設定碼（只交給本組安裝使用）'),input=make('textarea'),copyCode=make('button','複製安裝設定碼');input.readOnly=true;input.value=code;input.rows=3;input.id='deviceSetupCode';codeLabel.append(input);copyCode.type='button';copyCode.onclick=async()=>{try{await navigator.clipboard.writeText(code);message.textContent='已複製安裝設定碼，貼到安裝程式的提示處再按 Enter。'}catch{input.focus();input.select();message.textContent='請手動複製已選取的安裝設定碼。'}};
   setup.append(codeLabel,copyCode,make('p','安裝成功後回看板確認；不需要把管理員密碼填入 Pi。設定碼重新整理後不會保留。','muted'));message.textContent='設定碼已產生，等候安裝。';await refresh();
  }catch(e){if(token===epoch){if(e.code==='FEATURE_UNAVAILABLE')upgrade();else message.textContent='產生失敗：'+e.message}}finally{if(token===epoch){busy=false;pair.disabled=disable.disabled=select.disabled=false}}
 };
 disable.onclick=async()=>{if(busy||!active)return;const group=Number(select.value),token=epoch;if(!confirm('停用第 '+group+' 組的設備回報？Pi 的 SSH 與遠端桌面仍可使用。'))return;busy=true;pair.disabled=disable.disabled=select.disabled=true;try{await request('pi_helper_teacher_disable_device',{p_group_no:group});if(token!==epoch)return;setup.replaceChildren();setup.hidden=true;message.textContent='已停用此組設備回報。需要恢復時，重新產生設定碼並安裝。';await refresh()}catch(e){if(token===epoch)message.textContent='停用失敗：'+e.message}finally{if(token===epoch){busy=false;pair.disabled=disable.disabled=select.disabled=false}}};
 function reset(){epoch++;active=busy=false;rows.clear();error='';setup.replaceChildren();setup.hidden=true;message.textContent='';pair.disabled=disable.disabled=select.disabled=false;paint()}
 return {refresh,attach,reset};
}
// Student queries contain no teacher password, device token or other groups' data.
let student=null,studentEpoch=0,studentData=null,studentError='',studentFetched=0;
async function refreshStudent(force=false){
 if(!student?.container.isConnected)return;const current=student,token=++studentEpoch;
 if(!force&&studentData?.group_no===current.group&&Date.now()-studentFetched<15000){renderStudent();return}
 current.refresh.disabled=true;current.refresh.textContent='正在檢查…';
 try{const row=await PiSyncAPI.rpc('pi_helper_student_device',{p_room_code:room(),p_group_no:current.group});if(token!==studentEpoch||student!==current)return;if(!row||Number(row.group_no)!==current.group)throw Error('設備資料格式不符。');studentData={...row,fetchedAt:Date.now()};studentError='';studentFetched=Date.now()}catch(e){if(token!==studentEpoch||student!==current)return;studentError=e.code||'READ_FAILED'}finally{if(token===studentEpoch&&student===current){current.refresh.disabled=false;current.refresh.textContent='重新檢查設備'}}renderStudent();
}
function renderStudent(){if(!student?.container.isConnected)return;const state=status(studentData,studentError),mismatch=state.state==='fresh'&&studentData?.snapshot?.hostname!==hostname(student.group);render(student.body,studentData,{group:student.group,error:studentError,step:student.step});student.summary.textContent='樹莓派檢查：'+(mismatch?'主機名稱與本組不同，請助教核對':state.text);student.summary.classList.toggle('device-warning',mismatch);if(mismatch)student.summary.parentElement.open=true}
function mountStudent(container,{group,step}){const details=make('details',undefined,'student-device-check'),summary=make('summary','樹莓派檢查：正在確認'),body=make('div'),refresh=make('button','重新檢查設備');refresh.type='button';refresh.onclick=()=>refreshStudent(true);details.append(summary,body,refresh);container.append(details);if(student?.group!==group){studentData=null;studentError='';studentFetched=0}student={container,group,step,summary,body,refresh};renderStudent();refreshStudent()}
if(document.body.classList.contains('page-student')){setInterval(()=>{if(!document.hidden)refreshStudent()},15000);window.addEventListener('online',()=>refreshStudent(true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshStudent(true)});document.addEventListener('pi-helper-student-group',()=>{studentEpoch++;student=null;studentData=null;studentError='';studentFetched=0})}
window.PiDeviceMonitor={createTeacher,mountStudent};
})();
