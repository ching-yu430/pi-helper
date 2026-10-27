(()=>{
'use strict';
const q=id=>document.getElementById(id),select=q('courseGroup'),status=q('courseGroupStatus'),retry=q('retryCourseGroups'),links=Array.from(document.querySelectorAll('[data-lesson],[data-student-link]'));
let preferred=PiStudentGroup.read(),loading=false,syncing=false,policyFresh=false;
function selected(){return PiStudentGroup.valid(select.value)&&Number(select.value.slice(-2))<=PiGroups.count?select.value:''}
function updateLinks(){
 const group=selected();
 for(const link of links){
  const lesson=link.dataset.lesson||'ssh';if(lesson==='shutdown'){link.href=group?PiLearning.url('shutdown',group):'shutdown.html';link.setAttribute('aria-disabled','false');continue}const url=new URL(lesson==='camera'?'camera.html':'student.html',location.href);url.searchParams.set('lesson',lesson);if(group)url.searchParams.set('group',group);
  if(link.dataset.entryStep)url.searchParams.set('step',link.dataset.entryStep);link.href=url.href;
  if(link.dataset.lesson){const label=link.querySelector('[data-lesson-label]')||link;link.dataset.label ||= label.textContent;label.textContent=PiLearning.allowed(lesson)?link.dataset.label:lesson==='camera'?'等老師開放':'尚未開放：'+PiLearning.names[lesson]}
  link.setAttribute('aria-disabled',String(!group||!PiLearning.allowed(lesson)));
 }
 for(const host of document.querySelectorAll('[data-group-host]'))host.textContent=group?group+'.local':host.dataset.groupHostPlaceholder||'（選好組別後會顯示，例如 pi5-01.local）';
 status.textContent=group?'第 '+Number(group.slice(-2))+' 組 · '+group:'選好組別後，按「開始上課」。';
}
function populate(){
 const old=select.value||preferred;select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='請選自己的組別';select.append(placeholder);
 for(let n=1;n<=PiGroups.count;n++){const option=document.createElement('option');option.value=PiGroups.host(n);option.textContent='第 '+n+' 組 · '+option.value;select.append(option)}
 select.value=PiStudentGroup.valid(old)&&Number(old.slice(-2))<=PiGroups.count?old:'';updateLinks();
}
function renderLearning(){
 const group=selected(),saved=group?PiLearning.read(group):null,policy=PiLearning.policy,resume=Boolean(saved?.step&&PiLearning.allowed(saved.lesson)&&!saved.completed?.[saved.lesson]),link=q('continueLink'),description=q('continueDescription');
 const teacher=q('teachingNow'),hasTeacher=policy.managed&&policy.revision>0,entry=q('teacherEntry');
 entry.hidden=!group||!hasTeacher;
 const step=policy.current_lesson==='camera'?(policy.current_step===0?'其他檢查':'第 '+policy.current_step+' 步'):'第 '+(policy.current_step+1)+' 步';
 teacher.textContent=hasTeacher?'老師上次指定：'+PiLearning.names[policy.current_lesson]+' · '+step:'';
 if(hasTeacher&&!policyFresh)teacher.textContent+='（暫時無法更新）';
 const follow=q('followTeacherLink'),canFollow=Boolean(group&&policyFresh&&hasTeacher&&PiLearning.allowed(policy.current_lesson));
 const oldProgress=['flash','ssh','desktop'].includes(saved?.lesson),history=q('clearLearning').closest('.learning-options'),historySlot=oldProgress?q('initialSetup'):q('continueLesson');if(history.parentElement!==historySlot)historySlot.append(history);
 q('continueLesson').hidden=!group||(!hasTeacher&&(!saved?.step||oldProgress));
 q('continueLesson').dataset.teacherReady=String(canFollow);entry.classList.toggle('is-ready',canFollow);
 follow.hidden=!canFollow;follow.setAttribute('aria-disabled',String(!canFollow||select.disabled));
 if(canFollow)follow.href=PiLearning.url(policy.current_lesson,group,{teacher:1});else follow.removeAttribute('href');
 description.hidden=!saved?.step;description.textContent=saved?.step?'上次：'+saved.step+(saved.completed?.[saved.lesson]?'（已自行確認完成）':''):'';
 link.hidden=!resume||saved.lesson==='camera';link.setAttribute('aria-disabled',String(select.disabled||!resume));
 if(resume)link.href=PiLearning.url(saved.lesson,group,{resume:1});else link.removeAttribute('href');
 q('clearLearning').hidden=!saved;q('clearLearning').closest('.learning-options').hidden=!saved;
 const current=document.querySelector('[data-lesson="camera"]'),cameraDone=Boolean(saved?.completed?.camera);q('currentCourseStatus').hidden=!cameraDone;
 if(resume&&saved.lesson==='camera'&&group){current.href=PiLearning.url('camera',group,{resume:1});current.textContent='繼續上課 →'}
 else{const url=new URL('camera.html',location.href);url.searchParams.set('step','1');if(group)url.searchParams.set('group',group);current.href=url.href;current.textContent=PiLearning.allowed('camera')?(cameraDone?'重新查看課程 →':'開始上課 →'):'等老師開放'}
}

async function load(){
 if(loading)return;loading=true;select.disabled=true;retry.hidden=true;status.textContent='正在讀取課堂組別…';select.replaceChildren(new Option('請選自己的組別',''));let timeout;
 try{await Promise.race([Promise.all([PiGroups.refresh(),PiLearning.loadPolicy()]),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('連線逾時')),10000)})]);policyFresh=true;populate();select.disabled=false;renderLearning();if(preferred&&!selected()){PiStudentGroup.clear();preferred='';status.textContent='課堂組數已調整，請重新選擇自己的組別。'}}
 catch{policyFresh=false;renderLearning();status.textContent='組別讀取失敗或連線逾時。請確認筆電已連上網路，再按「重新讀取組別」；還是不行，請找助教。';select.replaceChildren(new Option('讀取失敗，請按下方按鈕重試',''));retry.hidden=false}
 finally{clearTimeout(timeout);loading=false}
}
async function syncPolicy(){
 if(loading||syncing)return;syncing=true;
 try{await PiLearning.loadPolicy();policyFresh=true;updateLinks();renderLearning()}
 catch{policyFresh=false;renderLearning()}
 finally{syncing=false}
}
select.addEventListener('change',()=>{preferred=selected();if(preferred)PiStudentGroup.save(preferred);else PiStudentGroup.clear();updateLinks();renderLearning()});
for(const link of links)link.addEventListener('click',event=>{
 if(link.dataset.lesson==='shutdown'){if(select.disabled||!selected()){event.preventDefault();location.assign('shutdown.html')}else PiStudentGroup.save(selected());return}
 if(select.disabled||!selected()){event.preventDefault();status.textContent=select.disabled?'請先完成讀取課堂組別，再開始課程。':'請先選自己的組別。';select.focus();select.reportValidity();return}
 if(!PiLearning.allowed(link.dataset.lesson||'ssh')){event.preventDefault();status.textContent='老師尚未開放這一課，請先繼續已開放的課程。';return}PiStudentGroup.save(selected());
});
document.addEventListener('pi-helper-groups-changed',()=>{if(select.disabled)return;const old=select.value||preferred;populate();renderLearning();if(old&&!selected()){preferred='';PiStudentGroup.clear();status.textContent='課堂組數已調整，請重新選擇自己的組別。'}});
q('clearLearning').onclick=()=>{if(selected()&&confirm('只清除此瀏覽器本組的課程進度，不影響助教回報或 Pi 檔案。確定清除？')){PiLearning.clear(selected());renderLearning()}};
q('continueLink').addEventListener('click',event=>{const saved=selected()?PiLearning.read(selected()):null;if(select.disabled||!selected()||!saved?.step||!PiLearning.allowed(saved.lesson)){event.preventDefault();status.textContent='選好組別後，按「開始上課」。';select.focus();return}PiStudentGroup.save(selected())});
q('followTeacherLink').addEventListener('click',event=>{if(select.disabled||!selected()||!policyFresh||!PiLearning.allowed(PiLearning.policy.current_lesson)){event.preventDefault();status.textContent='請先確認組別與老師指定階段。';return}PiStudentGroup.save(selected())});
retry.onclick=load;updateLinks();renderLearning();load();
const refreshVisible=()=>{if(!document.hidden){if(select.disabled)load();else syncPolicy()}};
document.addEventListener('visibilitychange',refreshVisible);window.addEventListener('online',refreshVisible);setInterval(()=>{if(!document.hidden&&!select.disabled)return syncPolicy()},5000);
function revealConnectionHelp(){if(['#connectionHelp','#connectionHelpTitle'].includes(location.hash)){q('connectionHelp').open=true;q('connectionHelp').scrollIntoView({block:'start'})}}
window.addEventListener('hashchange',revealConnectionHelp);revealConnectionHelp();
})();
