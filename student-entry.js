(()=>{
'use strict';
const params=new URLSearchParams(location.search),requestedLesson=['flash','ssh','desktop','shutdown'].includes(params.get('lesson'))?params.get('lesson'):'ssh',status=document.getElementById('entryStatus'),actions=document.getElementById('entryActions'),workspace=document.getElementById('studentWorkspace'),follow=document.getElementById('followTeacherNow');let busy=false,lastFollow=params.get('teacher')==='1';
document.getElementById('entryShutdownLink').href='shutdown.html';document.getElementById('entryShutdownLink').hidden=false;document.getElementById('reset').hidden=true;for(const button of document.querySelectorAll('header button'))button.disabled=true;
function teacherStage(){const p=PiLearning.policy;if(!p.managed||p.revision<=0)throw Error('老師尚未指定步驟，請依現場指示選擇課程。');if(!PiLearning.allowed(p.current_lesson))throw Error('老師尚未開放指定的課程，請向老師確認。');if(!Number.isInteger(p.current_step)||!window.PiLessonCatalog?.[p.current_lesson]?.steps[p.current_step])throw Error('無法確認老師指定步驟，請老師重新選擇。');return {lesson:p.current_lesson,index:p.current_step}}
function saveEntryUrl(lesson){const url=new URL(location.href);url.searchParams.set('lesson',lesson);url.searchParams.set('resume','1');url.searchParams.delete('teacher');history.replaceState(null,'',url)}
async function enter(followTeacher=false){
 if(busy)return;lastFollow=followTeacher;const group=PiStudentGroup.read();if(!group){location.replace('index.html?lesson='+requestedLesson);return}busy=true;follow.disabled=true;actions.hidden=true;status.hidden=false;status.textContent=followTeacher?'正在讀取老師指定步驟…':'正在確認本組設定…';
 try{
  await Promise.all([PiGroups.refresh(),PiLearning.loadPolicy()]);if(Number(group.slice(-2))>PiGroups.count){PiStudentGroup.clear();throw Error('這個組別目前未開放，請回課程首頁重新選擇。')}
  const stage=followTeacher?teacherStage():null,lesson=stage?.lesson||requestedLesson;if(!PiLearning.allowed(lesson))throw Error('老師尚未開放這一課，請回課程首頁確認。');
  PiStudentGroup.save(group);workspace.hidden=false;
  if(stage){if(!PiStudentFlow.enterStage(group,stage.lesson,stage.index))throw Error('無法開啟老師指定步驟，請回課程首頁重試。')}
  else if(!(params.get('resume')==='1'&&PiLearning.read(group)?.lesson===lesson&&PiStudentFlow.resume(group,PiLearning.read(group))))PiStudentFlow.enter(group,lesson);
  status.hidden=true;document.getElementById('reset').hidden=false;for(const button of document.querySelectorAll('header button'))button.disabled=false;saveEntryUrl(lesson);
 }catch(e){status.textContent=e.code==='RPC_ERROR'||e instanceof TypeError?'暫時無法確認課堂設定，請重試，或請助教協助。':e.message;status.hidden=false;actions.hidden=false}
 finally{busy=false;follow.disabled=workspace.hidden}
}
document.getElementById('retryStudentEntry').onclick=()=>enter(lastFollow);follow.onclick=()=>enter(true);enter(params.get('teacher')==='1');
setInterval(async()=>{if(document.hidden)return;try{await PiLearning.loadPolicy();if(!workspace.hidden&&!PiLearning.allowed(PiStudentFlow.lesson())){workspace.hidden=true;document.getElementById('reset').hidden=true;for(const button of document.querySelectorAll('header button'))button.disabled=true;status.hidden=false;status.textContent='老師已關閉這一課，請回課程首頁。需要結束操作時仍可使用正確關機教學。';actions.hidden=false}}catch{}},5000);
})();
