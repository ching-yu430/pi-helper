(()=>{
'use strict';
const q=id=>document.getElementById(id),select=q('courseGroup'),status=q('courseGroupStatus'),retry=q('retryCourseGroups'),links=Array.from(document.querySelectorAll('[data-lesson],[data-student-link]'));
let preferred=PiStudentGroup.read(),loading=false,syncing=false,policyFresh=false;
function selected(){return PiStudentGroup.valid(select.value)&&Number(select.value.slice(-2))<=PiGroups.count?select.value:''}
function updateLinks(){
 const group=selected();
 for(const link of links){
  const lesson=link.dataset.lesson||'ssh',url=new URL('student.html',location.href);url.searchParams.set('lesson',lesson);if(group)url.searchParams.set('group',group);link.href=url.href;
  if(link.dataset.lesson){link.dataset.label ||= link.textContent;link.textContent=PiLearning.allowed(lesson)?link.dataset.label:'尚未開放：'+PiLearning.names[lesson]}
  link.setAttribute('aria-disabled',String(!group||!PiLearning.allowed(lesson)));
 }
 for(const host of document.querySelectorAll('[data-group-host]'))host.textContent=group?group+'.local':'本組主機名稱';
 status.textContent=group?'本組：第 '+Number(group.slice(-2))+' 組 · '+group+'。下方課程會直接使用這個組別。':'請先選自己的組別，再選擇下方課程。';
}
function populate(){
 const old=select.value||preferred;select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='請選自己的組別';select.append(placeholder);
 for(let n=1;n<=PiGroups.count;n++){const option=document.createElement('option');option.value=PiGroups.host(n);option.textContent='第 '+n+' 組 · '+option.value;select.append(option)}
 select.value=PiStudentGroup.valid(old)&&Number(old.slice(-2))<=PiGroups.count?old:'';updateLinks();
}
function renderLearning(){
 const group=selected(),saved=group?PiLearning.read(group):null,policy=PiLearning.policy,resume=Boolean(saved?.step&&PiLearning.allowed(saved.lesson)&&!saved.completed?.[saved.lesson]),link=q('continueLink'),description=q('continueDescription');
 q('continueLesson').hidden=!group;
 const teacher=q('teachingNow');
 // A stored stage does not establish that the teacher has started this class.
 teacher.textContent=policy.managed&&policy.revision>0?'老師上次指定：'+PiLearning.names[policy.current_lesson]+' · 第 '+(policy.current_step+1)+' 步':policy.managed?'老師尚未指定課程，請依現場指示選擇下方課程。':'請依老師指示選擇下方課程。';
 if(!policyFresh)teacher.textContent+='（暫時無法更新）';
 const follow=q('followTeacherLink'),canFollow=Boolean(group&&policyFresh&&policy.managed&&policy.revision>0&&PiLearning.allowed(policy.current_lesson));
 q('continueLesson').dataset.teacherReady=String(canFollow);q('teacherEntry').classList.toggle('is-ready',canFollow);
 follow.hidden=!canFollow;follow.setAttribute('aria-disabled',String(!canFollow||select.disabled));
 if(canFollow)follow.href='student.html?group='+encodeURIComponent(group)+'&lesson='+encodeURIComponent(policy.current_lesson)+'&teacher=1';else follow.removeAttribute('href');
 description.hidden=!saved?.step;
 description.textContent=saved?.step?'本組上次進度：'+saved.step+(saved.completed?.[saved.lesson]?'（已自行確認完成）':''):'';
 link.hidden=!resume;link.setAttribute('aria-disabled',String(select.disabled||!resume));
 if(resume)link.href='student.html?group='+encodeURIComponent(group)+'&lesson='+encodeURIComponent(saved.lesson)+'&resume=1';else link.removeAttribute('href');
 q('clearLearning').hidden=!saved;q('clearLearning').closest('.learning-options').hidden=!saved;
 for(const lessonLink of links.filter(a=>a.dataset.lesson)){
  let badge=lessonLink.parentElement.querySelector('.lesson-local-progress');if(!badge){badge=document.createElement('p');badge.className='lesson-local-progress muted';lessonLink.before(badge)}
  badge.textContent=saved?.completed?.[lessonLink.dataset.lesson]?'本瀏覽器／本組：學生自行確認完成':'';
 }
}
async function load(){
 if(loading)return;loading=true;select.disabled=true;retry.hidden=true;status.textContent='正在讀取課堂組別…';select.replaceChildren(new Option('正在讀取組別…',''));let timeout;
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
 if(select.disabled||!selected()){event.preventDefault();status.textContent=select.disabled?'請先完成讀取課堂組別，再開始課程。':'請先選自己的組別。';select.focus();select.reportValidity();return}
 if(!PiLearning.allowed(link.dataset.lesson||'ssh')){event.preventDefault();status.textContent='老師尚未開放這一課，請先繼續已開放的課程。';return}PiStudentGroup.save(selected());
});
document.addEventListener('pi-helper-groups-changed',()=>{if(select.disabled)return;const old=select.value||preferred;populate();renderLearning();if(old&&!selected()){preferred='';PiStudentGroup.clear();status.textContent='課堂組數已調整，請重新選擇自己的組別。'}});
q('clearLearning').onclick=()=>{if(selected()&&confirm('只清除此瀏覽器本組的課程進度，不影響助教回報或 Pi 檔案。確定清除？')){PiLearning.clear(selected());renderLearning()}};
q('continueLink').addEventListener('click',event=>{const saved=selected()?PiLearning.read(selected()):null;if(select.disabled||!selected()||!saved?.step||!PiLearning.allowed(saved.lesson)){event.preventDefault();status.textContent='請先選自己的組別，再選擇下方課程。';select.focus();return}PiStudentGroup.save(selected())});
q('followTeacherLink').addEventListener('click',event=>{if(select.disabled||!selected()||!policyFresh||!PiLearning.allowed(PiLearning.policy.current_lesson)){event.preventDefault();status.textContent='請先確認組別與老師指定階段。';return}PiStudentGroup.save(selected())});
retry.onclick=load;updateLinks();renderLearning();load();
const refreshVisible=()=>{if(!document.hidden){if(select.disabled)load();else syncPolicy()}};
document.addEventListener('visibilitychange',refreshVisible);window.addEventListener('online',refreshVisible);setInterval(()=>{if(!document.hidden&&!select.disabled)return syncPolicy()},5000);
})();
