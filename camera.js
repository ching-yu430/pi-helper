(()=>{
'use strict';
const q=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const params=new URLSearchParams(location.search),staff=params.get('staff')==='1',stages=PiCameraCourse.stages,startIndex=PiCameraCourse.startIndex||1;
let group='',index=0,row=null,error='',epoch=0,readSequence=0,reading=false,entering=false,manual={},manualFallback={},manualPhotoSequence=null,lastPhotoSequence=null,ready=false,completionConfirmed=false,runningCode=false,lineIndex=0,commandNav=null,activeChecks=false;
const checksEnabled=()=>PiLearning.policy.camera_checks_enabled===true;
const fill=text=>PiCameraCourse.fill(text,group),number=()=>Number(group.slice(-2));
function studentError(code){if(code==='python_failed'&&stages[index].assignment)return '程式執行出錯。把終端機錯誤交給 AI 修改，存檔後重試。';return ({photo_missing:'這次沒有新照片。請執行本組指令、拍照，再按結束。',photo_name:'照片檔名不對。把網頁的功能清單交給 AI 修改。',photo_overwritten:'程式更改了舊照片。請 AI 改成每張照片使用不同檔名。',photo_limit:'照片太多，請助教協助整理。',missing_folder:'找不到課程資料夾。回到「建立資料夾」再做一次。',missing_script:'找不到程式檔案。確認有存檔，而且檔名和資料夾都正確。',python_failed:'程式執行出錯。保留終端機畫面，請助教一起看。',wrong_group:'顯示的文字不是本組名稱。改成本組「第 '+group.slice(-2)+' 組」，存檔後再執行。',write_missing:'還沒有產生文字檔。確認程式存好，再執行一次。',write_unchanged:'目前只有舊檔案。先儲存程式，再執行一次。',environment_missing:'拍照工具還沒裝好。先做本階段的安裝指令。',camera_missing:'樹莓派找不到相機。確認 USB 相機插在樹莓派，還是不行就請助教幫忙。',camera_read:'相機沒有畫面。接好相機、關閉其他拍照程式後，再試一次。',camera_size:'照片尺寸不對。先保留照片，請助教確認。',save_failed:'這次沒有成功存好照片。保留終端機錯誤，請助教幫忙。',timeout:'這次等太久了。先保留畫面，請助教幫忙。'})[code]||PiCourseMonitor.errors[code]||PiCourseMonitor.errors.unknown}
function announce(text){q('cameraToast').textContent=text;q('cameraToast').hidden=false;setTimeout(()=>q('cameraToast').hidden=true,2800)}
function save(){if(staff||!group)return;PiLearning.save(group,{lesson:'camera',step:stages[index].title,cameraIndex:index,cameraCommandIndex:lineIndex,cameraCodeRunning:runningCode,cameraManual:manual,cameraFallback:manualFallback,cameraPhotoSequence:manualPhotoSequence,updated_at:new Date().toISOString()})}
function publish(){if(staff||!ready||!window.ClassSync)return;const stage=stages[index],complete=completionConfirmed;ClassSync.publish({groupNo:number(),stage:'Python與USB拍照',step:stage.title,result:complete?'學生已確認照片品質與 Windows 下載':!checksEnabled()?'學生自行操作（自動檢查關閉）':stage.manual&&manual[stage.id]?'學生自行確認本階段完成':verified(stage)?'本階段有設備驗證通過紀錄':manualFallback[stage.id]?'學生回報助教已協助核對（未設備驗證）':'正在依教材操作；設備結果另列',status:window.PiStudentSupport?.hasActiveHelp?.()?'need_help':complete?'done':'working',completion:complete?'camera':null})}
function taskMap(){return new Map((row?.enabled?row.tasks||[]:[]).map(task=>[task.task,task]))}
function verified(stage){if((!checksEnabled()&&!staff)||!row?.enabled||error||!stage.tasks.length)return false;const tasks=taskMap(),items=stage.tasks.map(id=>tasks.get(id));if(!items.every(task=>task?.status==='passed'))return false;if(stage.id==='quality')return items[0].evidence?.verifier==='student-v1'&&items[0].evidence?.fresh_photo===true;return stage.id!=='camera'||new Set(items.map(task=>task.run_id)).size===1&&items[0].evidence?.verifier==='student-v1'&&items[1].evidence?.fresh_photo===true&&items[1].evidence?.verifier==='student-v1'&&items[2].evidence?.camera_reopened===true&&items[2].evidence?.verifier==='student-v1'}
function paintResult(){
 if(!checksEnabled()&&!staff){q('cameraIssue').hidden=true;q('cameraCheckSummary').textContent='自動檢查已關閉';return}
 const stage=stages[index],map=taskMap(),items=stage.tasks.map(id=>map.get(id)),automatic=verified(stage);let text='',issue='',state='waiting';
 if(!stage.tasks.length)text=manual[stage.id]?'你已確認下載':'下載後開啟照片，再按「完成課程」。';
 else if(error){text='無法重新檢查';state='issue';issue=error==='FEATURE_UNAVAILABLE'?'自動檢查尚未啟用，請找助教設定。':'暫時無法更新。按「重新檢查」重試，仍不行就找助教。'}
 else if(!row)text='正在讀取結果…';
 else if(stage.assignment&&row.student_camera_supported!==true){text='檢查工具待更新';issue='請助教更新資料庫與課堂工具 1.1.0；也可先關閉自動檢查。'}
 else if(!row.enabled)text=staff?'尚無設備回報':'尚未設定自動檢查，請找助教。';
 else if(automatic){state='passed';text=stage.manual?(manual[stage.id]?'你已確認照片':'照片已存檔，請打開確認。'):'檢查通過';}
 else {const failed=items.find(task=>['failed','cancelled'].includes(task?.status)),running=items.find(task=>task?.status==='running');
  if(failed){text='需要處理';state='issue';issue=failed.evidence?.error_code?studentError(failed.evidence.error_code):'這次操作未完成，保留終端機畫面，請助教幫忙。'}
  else if(stage.id==='camera'&&items.every(task=>task?.status==='passed')){text='尚未完成本次拍照';issue='程式、新照片與相機檢查尚未對應同一次執行。請用本組指令拍照後按「結束」。'}
  else if(running)text=Date.now()-Date.parse(running.received_at)>90000?'執行狀態待確認，請看樹莓派畫面。':'正在執行，請等候…';
  else text='等候檢查結果';
 }
 if(!automatic&&stage.tasks.length&&manualFallback[stage.id])text='自行確認（未設備驗證）';
 if(stage.id==='quality'&&automatic&&map.get('photo')?.evidence?.warning_count>0)issue='相機有影像警告，請打開照片確認，並讓助教查看終端機。';
 q('cameraCheckSummary').textContent=text;q('cameraCheckSummary').dataset.state=state;q('cameraIssue').textContent=issue;q('cameraIssue').hidden=!issue;
}
function updateNext(){
 const stage=stages[index],writing=Boolean((stage.code||stage.assignment)&&!runningCode),more=!writing&&lineIndex<stage.commands.length-1,automatic=verified(stage),allowed=staff||!checksEnabled()||!stage.tasks.length||automatic||manualFallback[stage.id]===true;
 q('cameraNext').disabled=!writing&&!more&&!allowed;
 q('cameraNext').textContent=writing?(stage.assignment?'開始試拍 →':'存好了，下一步 →'):more?'下一步 →':index===stages.length-1?'完成課程 →':stage.id==='quality'?'照片看過了 →':'下一步 →';
 q('cameraBack').disabled=index<=startIndex&&lineIndex===0;
 q('cameraCommandCount').textContent=!writing&&stage.commands.length>1?'指令 '+(lineIndex+1)+' / '+stage.commands.length:'';if(q('cameraNext').disabled)q('cameraNext').textContent='等候檢查…';
 q('cameraFallback').hidden=!checksEnabled()||staff||completionConfirmed||!stage.tasks.length||automatic;
 q('cameraVerification').hidden=!checksEnabled()&&!staff;
 paintResult();
}
function renderChecks(){
 const stage=stages[index],box=q('cameraChecks'),map=taskMap();box.replaceChildren();if(!checksEnabled()&&!staff){q('cameraCheckStatus').textContent='自動檢查已關閉';updateNext();return}
 q('cameraCheckStatus').textContent=error==='FEATURE_UNAVAILABLE'?'自動檢查尚未啟用。請按「請助教幫忙」，讓助教設定。':error?'暫時無法更新。保留上次紀錄，尚不能確認最新結果；可重試或找助教。':!row?'正在讀取課程結果…':!row.enabled?'這組還沒設定自動檢查。可以先看教材，請助教幫忙設定。':!row.tasks?.length?'先照上方做。做完後，按「重新檢查」。':'看看這一步有沒有檢查通過；有錯誤就保留畫面，請助教幫忙。';
 if(!stage.tasks.length)box.append(make('p','這一步由你在指定裝置確認，不會標成設備自動驗證。'));
 for(const id of stage.tasks){const task=map.get(id),item=make('div',undefined,'camera-check'),oldRunning=task?.status==='running'&&Date.now()-Date.parse(task.received_at)>90000;item.dataset.status=task?.status||'pending';item.append(make('p',(PiCourseMonitor.titles[id]||id)+'：'+(oldRunning?'執行狀態待確認':({running:'執行中，請等候',passed:'設備驗證通過',failed:'需要處理',cancelled:'已中斷'})[task?.status]||'尚無驗證結果')));if(task){const e=task.evidence||{};item.append(make('p','收到紀錄：'+new Date(task.received_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),'muted'));if(e.error_code)item.append(make('p',studentError(e.error_code),'device-warning'));if(e.file_name)item.append(make('p',e.file_name+' · '+e.width+'×'+e.height+' · '+e.bytes+' bytes','muted'));if(e.warning_count>0)item.append(make('p','取像期間有 MJPEG 警告，請保留終端機訊息並打開照片確認。','device-warning'));if(oldRunning)item.append(make('p','超過 90 秒未收到後續狀態。請看 Pi 的原本視窗，不要因而拔電或刪除套件鎖。','muted'))}box.append(item)}
 if(stage.id==='camera'&&stage.tasks.every(id=>map.get(id)?.status==='passed')&&!verified(stage))box.append(make('p','程式、新照片與相機檢查尚未對應同一次執行。請用本組指令拍照後按「結束」。','note'));
 if(stage.id==='quality'&&row?.enabled){const photo=map.get('photo');if(photo&&lastPhotoSequence!==photo.sequence){lastPhotoSequence=photo.sequence;if(manualPhotoSequence!==photo.sequence){manual.quality=false;save()}}}
 updateNext();
}
async function refresh(force=false){
 if(!ready||document.hidden||reading&&!force)return;if(!checksEnabled()&&!staff){renderChecks();return}const token=epoch,sequence=++readSequence,target=group;reading=true;q('refreshCameraChecks').disabled=true;q('refreshCameraChecks').textContent='正在更新…';
 try{const next=await PiSyncAPI.rpc('pi_helper_student_camera',{p_room_code:PI_HELPER_CONFIG.defaultRoomCode,p_group_no:number()});if(token!==epoch||sequence!==readSequence||target!==group)return;if(!next||Number(next.group_no)!==number()||!Array.isArray(next.tasks))throw Error('回報格式不符');row=next;error=''}catch(e){if(token!==epoch||sequence!==readSequence)return;error=e.code||'READ_FAILED'}finally{if(token===epoch&&sequence===readSequence){reading=false;q('refreshCameraChecks').disabled=false;q('refreshCameraChecks').textContent='重新檢查';renderChecks()}}
}
async function copy(text,pre){try{await navigator.clipboard.writeText(text);return true}catch{const range=document.createRange();range.selectNodeContents(pre);getSelection().removeAllRanges();getSelection().addRange(range);announce('請手動複製已選取的這一行指令。');return false}}
function renderAssignment(stage,writing){
 const box=q('cameraAssignment');box.replaceChildren();box.hidden=!stage.assignment||!writing;if(box.hidden)return;
 const list=make('ul',undefined,'camera-requirements');for(const text of stage.requirements)list.append(make('li',text));box.append(list);
 const details=make('details',undefined,'camera-ai-prompt'),summary=make('summary','查看完整要求'),pre=make('pre',fill(stage.aiPrompt)),button=make('button','複製給 AI','command-copy'),feedback=make('p',undefined,'camera-copy-feedback');button.id='copyCameraPrompt';PiCommandSteps.bindCopy(button,fill(stage.aiPrompt),{source:pre,status:feedback,onCopy:async text=>{try{await navigator.clipboard.writeText(text);return true}catch{details.open=true;return false}},success:'已複製，請貼給你使用的 AI。'});details.append(summary,pre);box.append(button,feedback,details);
 const hint=make('p','照片資料夾：/home/user/pi-camera/photos','muted'),format=make('p','照片檔名：'+fill('{host}_年月日_時分秒_微秒.jpg'),'muted');box.append(hint,format);
}
function renderStage(focus=true){
 const stage=stages[index],view=stage.view,writing=Boolean((stage.code||stage.assignment)&&!runningCode);q('cameraCompletion').hidden=true;q('cameraTask').hidden=false;q('cameraNavigation').hidden=false;q('cameraFallback').open=false;q('cameraStage').value=String(index);q('cameraStageCount').textContent=stage.optional?'選用':(index-startIndex+1)+' / '+(stages.length-startIndex);q('cameraTaskTitle').textContent=view.title;q('cameraWhere').textContent=(stage.code||stage.assignment)&&!writing?'樹莓派｜終端機':view.where;q('cameraAction').textContent=(stage.code||stage.assignment)&&!writing?'執行 '+fill(view.saveAs).split('/').pop()+'。':fill(view.action);q('cameraActionList').replaceChildren(...(stage.actions||[]).map(text=>make('li',fill(text))));q('cameraExpected').textContent=fill(stage.expected);
 q('cameraPath').hidden=!view.path;q('cameraPath').textContent=view.path||'';
 renderAssignment(stage,writing);
 const code=q('cameraCode');code.replaceChildren();code.hidden=!writing||!stage.code;if(stage.code){if(view.editorIntro)code.append(make('p',view.editorIntro,'camera-editor-intro'));const program=fill(stage.code),row=make('div',undefined,'camera-copy-row'),pre=make('pre',program),button=make('button','複製程式碼','command-copy'),feedback=make('p',undefined,'camera-copy-feedback');button.id='copyCameraCode';PiCommandSteps.bindCopy(button,program,{source:pre,status:feedback,success:'已複製程式碼，請貼到 Thonny 上方空白區。'});row.append(pre,button);code.append(row,feedback)}
 const saveAs=q('cameraSaveAs');saveAs.replaceChildren();saveAs.hidden=!writing;if(writing){const row=make('span',undefined,'camera-copy-row camera-path-copy'),path=make('code',fill(view.saveAs)),button=make('button','複製檔案路徑','command-copy'),feedback=make('span',undefined,'camera-copy-feedback');button.id='copyCameraPath';PiCommandSteps.bindCopy(button,fill(view.saveAs),{source:path,status:feedback,success:'已複製檔案路徑，請貼到 Thonny 的檔案名稱欄位。'});row.append(path,button);saveAs.append(document.createTextNode('按 Ctrl + S，儲存為：'),row,feedback)}
 const commands=q('cameraCommands'),desiredLine=Math.max(0,Math.min(lineIndex,stage.commands.length-1));commands.hidden=writing;commands.replaceChildren();commandNav=null;
 if(stage.commands.length){const viewBox=PiCommandSteps.build(stage.commands.map(fill).join('\n'),{onCopy:copy,guided:true,compact:true,navigation:false,copyLabel:'複製指令',showResult:false,commandTitles:view.commandTitles,pasteTarget:index===7?'Windows PowerShell':'樹莓派終端機',pasteKeys:index===7?'Ctrl + V':'Ctrl + Shift + V',onStepChange:position=>{lineIndex=position;updateNext();save()}});commands.append(viewBox);commandNav=viewBox.commandNavigation;commandNav.show(desiredLine)}else lineIndex=0;
 const notes=q('cameraNotesList');notes.replaceChildren(...stage.notes.map(text=>make('li',fill(text))));if(stage.download){const li=make('li'),link=make('a','下載統一拍照程式'),source=make('a','查看完整原始碼');link.href=stage.download;link.download='camera_app.py';source.href='https://github.com/ching-yu430/pi-helper/blob/main/courseware/camera_app.py';source.target='_blank';source.rel='noopener';li.append(link,document.createTextNode(' · '),source,document.createTextNode('；使用上方短指令取得，不需要把整篇程式貼進終端機。'));notes.append(li)}
 q('cameraManualFallback').checked=manualFallback[stage.id]===true;q('cameraStaffNotice').hidden=!staff;renderChecks();save();publish();if(focus){q('cameraTask').scrollIntoView({block:'start'});q('cameraTaskTitle').focus({preventScroll:true})}
}
function move(value){if(!Number.isInteger(value)||value<0||value>=stages.length)return;index=value;completionConfirmed=false;runningCode=false;lineIndex=0;renderStage();const url=new URL(location.href);url.searchParams.set('step',String(index));url.searchParams.delete('teacher');history.replaceState(null,'',url)}
async function enter(follow=false){
 if(entering)return;entering=true;const token=++epoch;readSequence++;reading=false;q('cameraEntryActions').hidden=true;q('cameraEntry').hidden=false;q('cameraEntry').textContent=follow?'正在讀取老師指定階段…':'正在確認本組設定…';
 try{const next=PiStudentGroup.read();if(!PiStudentGroup.valid(next)){location.replace('index.html');return}await Promise.all([PiGroups.refresh(),PiLearning.loadPolicy()]);if(token!==epoch)return;if(Number(next.slice(-2))>PiGroups.count)throw Error('這個組別未開放，請回首頁選擇。');if(!staff&&!PiLearning.allowed('camera'))throw Error('老師尚未開放 Python 與 USB 拍照課程，請依現場指示選課。');let target=params.has('step')?Number(params.get('step')):startIndex;if(follow){const p=PiLearning.policy;if(!p.managed||p.revision<=0)throw Error('老師尚未指定階段，請依現場指示選課。');if(p.current_lesson!=='camera'){location.replace(PiLearning.url(p.current_lesson,next,{teacher:1}));return}target=p.current_step}else if(params.get('resume')==='1'){target=PiLearning.read(next)?.completed?.camera?startIndex:Math.max(startIndex,PiLearning.read(next)?.cameraIndex??startIndex)}
  if(group!==next){row=null;error='';manual={};manualFallback={};manualPhotoSequence=null;lastPhotoSequence=null}group=next;if(!staff)PiStudentGroup.save(group);const saved=PiLearning.read(group);manual={...saved?.cameraManual};manualFallback={...saved?.cameraFallback};manualPhotoSequence=saved?.cameraPhotoSequence??null;index=Number.isInteger(target)&&target>=0&&target<stages.length?target:startIndex;ready=true;completionConfirmed=false;activeChecks=checksEnabled();const restore=params.get('resume')==='1'&&!follow&&!saved?.completed?.camera;runningCode=restore&&saved?.cameraCodeRunning===true;lineIndex=restore&&Number.isInteger(saved?.cameraCommandIndex)?saved.cameraCommandIndex:0;q('cameraWorkspace').hidden=false;q('cameraGroupLabel').textContent='第 '+number()+' 組';q('cameraEntry').hidden=true;q('cameraAsk').hidden=staff;q('cameraSync').hidden=staff;q('cameraFallback').hidden=staff;q('followCameraTeacher').disabled=false;const home=new URL('index.html',location.href);home.searchParams.set('group',group);q('cameraCompleteHome').href=home.href;renderStage(false);await refresh();
 }catch(e){if(token!==epoch)return;q('cameraEntry').textContent=e.message||'讀取失敗，請重試或找助教。';q('cameraEntryActions').hidden=false}finally{if(token===epoch)entering=false}
}
const other=make('optgroup');other.label='其他檢查（需要時再做）';stages.forEach((stage,i)=>{const option=make('option',stage.optional?stage.view.title:(i-startIndex+1)+'. '+stage.view.title);option.value=String(i);(stage.optional?other:q('cameraStage')).append(option)});q('cameraStage').append(other);
q('cameraStage').onchange=()=>move(Number(q('cameraStage').value));
q('cameraBack').onclick=()=>{if(lineIndex>0){commandNav.show(lineIndex-1,true);return}if(stages[index].code&&runningCode){runningCode=false;renderStage(false);return}move(index-1)};
q('cameraNext').onclick=()=>{
 if(q('cameraNext').disabled)return;const stage=stages[index];
 if((stage.code||stage.assignment)&&!runningCode){runningCode=true;lineIndex=0;renderStage(false);return}
 if(lineIndex<stage.commands.length-1){commandNav.show(lineIndex+1,true);return}
 if(stage.manual||!checksEnabled()){manual[stage.id]=true;if(stage.id==='quality')manualPhotoSequence=taskMap().get('photo')?.sequence||null;save()}
 if(index===stages.length-1){if(!staff){completionConfirmed=true;PiLearning.save(group,{completed:{camera:true}});publish()}q('cameraCompletionTitle').textContent=staff?'教材預覽結束':'本組已確認完成';q('cameraCompletion').hidden=false;q('cameraTask').hidden=true;q('cameraNavigation').hidden=true;q('cameraFallback').hidden=true;q('cameraCompletion').scrollIntoView({block:'nearest'});q('cameraCompletionTitle').focus({preventScroll:true});return}
 move(index+1);
};
q('cameraManualFallback').onchange=()=>{manualFallback[stages[index].id]=q('cameraManualFallback').checked;save();updateNext();publish()};q('refreshCameraChecks').onclick=()=>refresh(true);q('retryCameraEntry').onclick=()=>enter(params.get('teacher')==='1');q('followCameraTeacher').onclick=()=>{q('cameraTools').open=false;enter(true)};
q('cameraAsk').onclick=()=>{if(!ready||!window.PiStudentSupport)return;PiStudentSupport.request({groupNo:number(),stage:'Python與USB拍照',step:stages[index].title,result:'學生請求課程協助',status:'need_help'})};
// Existing shared help code can request a report without rebuilding the task view.
window.PiStudentFlow={report:publish};
document.addEventListener('pi-helper-course-policy',()=>{if(!ready||entering)return;const enabled=checksEnabled();if(enabled===activeChecks)return;activeChecks=enabled;epoch++;readSequence++;reading=false;error='';q('refreshCameraChecks').disabled=false;renderChecks();publish();if(enabled)refresh(true)});
setInterval(()=>{if(!document.hidden&&ready)refresh()},5000);setInterval(async()=>{if(document.hidden||!ready)return;try{await PiLearning.loadPolicy();if((!staff&&!PiLearning.allowed('camera'))||number()>PiGroups.count){ready=false;epoch++;q('cameraWorkspace').hidden=true;q('cameraEntry').hidden=false;q('cameraEntry').textContent='課程或組別已調整，請回課程首頁確認。';q('cameraEntryActions').hidden=false}}catch{}},15000);
window.addEventListener('online',()=>ready?refresh(true):enter());document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready)refresh(true)});document.addEventListener('pi-helper-student-group',event=>{if(group&&event.detail?.group!==group){epoch++;row=null;error='';ready=false}});
enter(params.get('teacher')==='1');
})();
