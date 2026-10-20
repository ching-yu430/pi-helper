(()=>{
'use strict';
const q=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const room=PI_HELPER_CONFIG.defaultRoomCode;
let password='',policy=null,cursor={lesson:'flash',index:0},live=false,busy=false,large=false,rendered='',presentation=false,fallback=false,epoch=0,roomReady=false,reading=false;
let helpRows=[],helpError='',helpChecked='',helpReading=false,helpKey='',imageFocus=null,helpFocus=null,zoom=1,marking=true;
const request=(name,extra={})=>PiSyncAPI.rpc(name,{p_room_code:room,p_teacher_code:password,...extra});
const valid=(lesson,index)=>Boolean(PiLessonCatalog[lesson]?.steps[index])&&Number.isInteger(index);
const knownPolicy=value=>value?.open_lessons&&valid(value.current_lesson,value.current_step)&&Number.isSafeInteger(value.revision);
const setStatus=(text,important=false)=>{const status=q('presenterStatus');status.textContent=text;status.classList.toggle('is-quiet',Boolean(policy)&&!important)};
const paused=()=>policy?.teaching_paused===true;
const supportsPause=()=>policy?.pause_supported===true;
for(const [id,lesson] of Object.entries(PiLessonCatalog)){const option=make('option',lesson.title);option.value=id;q('presenterLesson').append(option)}
function acceptPolicy(next){if(!knownPolicy(next))throw Error('課堂設定格式不符，請重新登入。');if(!policy||next.revision>=policy.revision)policy=next}
function setVisible(on){for(const id of ['presenterControls','presenterSlide','presenterNavigation'])q(id).hidden=!on;q('presenterLogin').hidden=on;document.body.classList.toggle('presenter-ready',on)}
function renderSlide(){
 const {lesson:id,index}=cursor,lesson=PiLessonCatalog[id],step=lesson.steps[index],host=(q('presenterGroup').value||'pi5-01.local').replace(/\.local$/,'');
 const key=JSON.stringify([id,index,host]);if(key===rendered)return;rendered=key;
 const slide=q('presenterSlide'),content=make('div',undefined,'presenter-content'),visual=make('div',undefined,'presenter-visual');
 content.append(make('p',lesson.title+' · 示範 '+host,'presenter-lesson-meta'),make('h2',step.title),make('p','操作位置：'+(step.where==='Pi'?'已登入本組 Pi 的 SSH 或桌面終端機':step.where),'presenter-command-place'));
 const action=make('section',undefined,'presenter-current-action');action.append(make('h3','現在做什麼'),make('p',id==='camera'?PiCameraCourse.fill(step.action,host):step.action));content.append(action);
 const x11=id==='desktop'&&index===3;
 if(step.command&&!x11){const text=step.command.replaceAll('{host}',host);content.append(PiCommandSteps.lines(text).length>1?PiCommandSteps.build(text,{onCopy:async(command,pre)=>{try{await navigator.clipboard.writeText(command);setStatus('已複製這一行，請貼上後按 Enter。',true)}catch{const range=document.createRange();range.selectNodeContents(pre);getSelection().removeAllRanges();getSelection().addRange(range);setStatus('請複製已選取的這一行指令。',true)}}}):make('pre',text));}
 if(id==='camera')content.append(PiCameraSlides.build(index,host,setStatus));
 if(id==='flash'){const values=PiFlashSettings.build(index,host);if(values)content.append(values)}
 if(step.image){const button=make('button',undefined,'presenter-image-open'),image=make('img');button.type='button';button.setAttribute('aria-label','放大並標示：'+step.title);image.src=PiFlashSettings.displayImage(step.image);image.alt=step.title;image.decoding='async';button.append(image);visual.append(button,make('p','點圖片可放大、圈出重點。','muted'))}
 if(x11){const instructions=make('div',undefined,'presenter-x11-instructions');content.append(instructions);let guide;const arrange=()=>{instructions.replaceChildren(...[...guide.querySelector('.x11-guide-content').children].filter(node=>node.tagName!=='FIGURE'))};guide=PiOperationImages.build('x11',{guided:true,onStageChange:i=>{action.querySelector('p').textContent=['先在已登入本組 Pi 的視窗執行指令。','用方向鍵選 Advanced Options，再按 Enter。','用方向鍵選 Wayland，再按 Enter。','用方向鍵選 X11，再按 Enter。','按 Tab 選 Finish 離開；詢問重新開機時選 No。'][i];if(guide)arrange()},onCopy:async command=>{try{await navigator.clipboard.writeText(command);setStatus('已複製指令，請在本組 Pi 的視窗執行。')}catch{setStatus('可選取畫面上的指令手動複製。',true)}},onComplete:()=>move('desktop',4)});visual.append(guide);arrange();const keys=make('details',undefined,'presenter-notes');keys.append(make('summary','完整鍵盤操作'),PiFlashSettings.keyboardGuide());content.append(keys)}
 if(id==='desktop'&&!x11){const imageKey={6:'rdpOpen',7:'rdpLogin'}[index];if(imageKey){const picture=PiOperationImages.build(imageKey,{host:host+'.local',user:'user'});for(const node of [...picture.children])if(node.tagName!=='FIGURE')content.append(node);visual.append(picture)}}
 const expected=make('section',undefined,'presenter-expected');expected.append(make('h3','完成後應看到'),make('p',id==='camera'?PiCameraCourse.fill(step.expected,host):step.expected));content.append(expected);
 if(id==='shutdown')content.append(make('p',index===2?'至少再等 30 秒，確認關機完成才拔電。':'先儲存成果，現在不要拔電。','presenter-shutdown-alert'));
 const notes=make('details',undefined,'presenter-notes');notes.append(make('summary','補充說明'),make('p',id==='camera'?PiCameraCourse.fill(step.text,host):step.text));content.append(notes);
 const copy=make('div',undefined,'presenter-copy');copy.append(...content.childNodes);content.append(copy);const canvas=make('div',undefined,'presenter-canvas');canvas.append(content);if(visual.children.length)canvas.append(visual);slide.replaceChildren(canvas);slide.classList.toggle('has-visual',Boolean(visual.children.length));slide.scrollTop=0;
}
function render(){
 if(!policy)return;const lesson=PiLessonCatalog[cursor.lesson];q('presenterLesson').value=cursor.lesson;
 const select=q('presenterStep');if(select.dataset.lesson!==cursor.lesson){select.replaceChildren();lesson.steps.forEach((item,i)=>{const option=make('option','第 '+(i+1)+' 步：'+item.title);option.value=String(i);select.append(option)});select.dataset.lesson=cursor.lesson}select.value=String(cursor.index);
 q('presenterLesson').disabled=select.disabled=busy;q('presenterBack').disabled=busy||cursor.index===0;q('presenterNext').disabled=busy||cursor.index===lesson.steps.length-1;
 const publish=q('presenterPublish');publish.textContent=live?'改為預覽':'開始帶課';publish.classList.toggle('primary',!live);publish.disabled=busy||!roomReady||(!live&&!policy.open_lessons[cursor.lesson]);
 q('presenterPause').textContent=paused()?'繼續上課':'先停在這裡';q('presenterPause').setAttribute('aria-pressed',String(paused()));q('presenterPause').disabled=busy||!supportsPause()||policy.revision===0||!roomReady;q('presenterPause').title=supportsPause()?'提示學生保留目前步驟，仍可閱讀與求助':'請先完成全班暫停提示的資料庫升級';q('presenterShutdown').disabled=busy||!roomReady;
 const published=policy.revision>0?PiLessonCatalog[policy.current_lesson].title+' · 第 '+(policy.current_step+1)+' 步':'尚未指定';
 const mode=paused()?'暫停中':live?'帶課中':'預覽中',box=q('presenterMode');box.classList.toggle('is-live',live);box.classList.toggle('is-paused',paused());
 if(box.textContent!==mode)box.textContent=mode;
 box.title=(live?'正在同步指定步驟':'預覽不會變更學生指定步驟')+'｜全班上次指定：'+published+(paused()?'｜學生正在等老師說明':'');
 q('presenterPublished').textContent='全班上次指定：'+published+(paused()?'（等候老師說明）':'');q('presenterPauseSetup').hidden=supportsPause();
 q('presenterCounter').textContent=(cursor.index+1)+' / '+lesson.steps.length;renderSlide();
}
async function publishStage(lesson,index,pauseValue=paused(),activate=true){
 if(!policy||busy||!valid(lesson,index)||!roomReady)return false;if(lesson==='camera'&&!policy.camera_supported){setStatus('請老師先執行 Python 與拍照課程的 SQL 升級，再開放教材。',true);return false;}
 const token=epoch;busy=true;render();
 try{
  const next=supportsPause()?await request('pi_helper_teacher_present_course',{p_current_lesson:lesson,p_current_step:index,p_paused:pauseValue,p_revision:policy.revision}):await request('pi_helper_teacher_set_course',{p_open_lessons:policy.open_lessons,p_current_lesson:lesson,p_current_step:index,p_revision:policy.revision});
  if(token!==epoch)return false;acceptPolicy(next);if(activate){cursor={lesson:policy.current_lesson,index:policy.current_step};live=true;setStatus('已指定給學生；學生可按「跟上老師進度」開啟。')}return true;
 }catch(e){if(token!==epoch)return false;if(activate)live=false;setStatus((activate?'尚未指定：':'提示未更新：')+e.message,true);try{const next=await request('pi_helper_teacher_course_settings');if(token===epoch)acceptPolicy(next)}catch{}return false}
 finally{if(token===epoch){busy=false;render()}}
}
async function move(lesson,index){if(!policy||busy||!valid(lesson,index))return;cursor={lesson,index};if(live&&!policy.open_lessons[lesson]){live=false;setStatus('此課尚未開放，請先在工作台開放教材。',true);render();return}if(live)await publishStage(lesson,index);else{setStatus(lesson==='camera'&&!policy.camera_supported?'可預覽教材；要指定給全班，請老師先執行新課程 SQL 升級。':'正在預覽，準備好後按「開始帶課」。',lesson==='camera'&&!policy.camera_supported);render()}}
q('presenterPublish').onclick=()=>{if(live){live=false;setStatus('已切換預覽；保留學生原本的指定階段。');render()}else publishStage(cursor.lesson,cursor.index)};
q('presenterPause').onclick=async()=>{
 if(!supportsPause()||busy||!policy.revision)return;q('presenterOptions').open=false;const target=!paused();
 const ok=await publishStage(policy.current_lesson,policy.current_step,target,false);if(ok){setStatus(target?'已通知學生：先完成目前步驟，等老師說明。':'已解除提示，學生可以繼續上課。');render()}
};
q('presenterShutdown').onclick=async()=>{q('presenterOptions').open=false;if(await publishStage('shutdown',0,false))setStatus('已指定正確關機：先儲存，再執行關機，確認完成才拔電。')};
function setPresentation(value){presentation=value;document.body.classList.toggle('presentation-mode',value);q('presenterFullscreen').textContent=value?(document.fullscreenElement?'離開全螢幕':'結束投影'):'全螢幕';q('presenterFullscreen').setAttribute('aria-pressed',String(value));scheduleFit()}
async function togglePresentation(){
 if(!policy)return;const token=epoch;
 if(presentation){fallback=false;setPresentation(false);if(document.fullscreenElement)try{await document.exitFullscreen()}catch{}return}
 setPresentation(true);try{if(typeof document.documentElement.requestFullscreen!=='function')throw Error();await document.documentElement.requestFullscreen();if(token!==epoch||!policy){if(document.fullscreenElement)await document.exitFullscreen();setPresentation(false);return}setPresentation(true)}catch{if(token!==epoch||!policy)return;fallback=true;setPresentation(true);setStatus('已切換投影版面，可使用瀏覽器的全螢幕功能。')}
}
document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement)setPresentation(Boolean(policy));else if(!fallback)setPresentation(false)});
function helpGroups(){const groups=new Map();for(const row of helpRows){if(row.group_no<1||row.group_no>PiGroups.count||!['open','claimed','waiting'].includes(row.status))continue;const current=groups.get(row.group_no);if(!current||({open:0,claimed:1,waiting:2})[row.status]<({open:0,claimed:1,waiting:2})[current.status])groups.set(row.group_no,row)}return [...groups.values()].sort((a,b)=>a.group_no-b.group_no)}
function renderHelp(){
 const rows=helpGroups(),count=rows.filter(row=>row.status!=='waiting').length,initial=!helpChecked&&!helpError;
 q('presenterHelp').textContent=initial?'讀取求助中…':helpError?'求助待更新':'待協助 '+count+' 組';
 q('presenterHelpStatus').textContent=initial?'正在讀取求助狀態…':helpError||('上次更新：'+(helpChecked||'正在讀取')+'；待學生確認 '+rows.filter(row=>row.status==='waiting').length+' 組。');
 const badge=q('presenterHelpBadge');badge.hidden=initial||(!helpError&&count===0);badge.textContent=helpError?'!':String(count);badge.title=helpError?'求助待更新':'待協助 '+count+' 組';q('presenterOptions').querySelector('summary').setAttribute('aria-label','教學工具'+(initial?'，正在讀取求助':helpError?'，求助待更新':count?'，待協助 '+count+' 組':''));
 const key=JSON.stringify([rows,helpError,initial]);if(key===helpKey)return;helpKey=key;const list=q('presenterHelpGroups');list.replaceChildren();
 if(!rows.length)list.append(make('p',initial?'正在讀取求助狀態…':helpError?'目前無法確認求助狀態，請重試或到工作台查看。':'目前沒有待協助或待學生確認的組別。'));
 for(const row of rows){const card=make('article',undefined,'presenter-help-group');card.append(make('h3','第 '+String(row.group_no).padStart(2,'0')+' 組 · '+({open:'等候接手',claimed:'助教處理中',waiting:'待學生確認'})[row.status]),make('p',row.step));const link=make('a','到工作台協助此組 ↗');link.href='assistant.html?assist='+row.group_no;link.target='_blank';link.rel='noopener';card.append(link);list.append(card)}
}
async function refreshHelp(){
 if(!policy||helpReading)return;const token=epoch;helpReading=true;
 try{const rows=await request('pi_helper_teacher_help');if(token!==epoch)return;if(!Array.isArray(rows))throw Error('求助資料格式不符。');helpRows=rows;helpError='';helpChecked=new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei'})}
 catch(e){if(token===epoch)helpError=e.code==='FEATURE_UNAVAILABLE'?'共用求助尚未啟用，請先完成課堂功能升級。':'求助更新失敗，保留上次資料：'+e.message}
 finally{if(token===epoch){helpReading=false;renderHelp()}}
}
async function refreshClass(){
 if(!policy||reading||busy||document.hidden)return;const token=epoch;reading=true;
 try{const next=await request('pi_helper_teacher_course_settings');if(token!==epoch||busy)return;const changed=next.revision>policy.revision;acceptPolicy(next);if(changed&&live){cursor={lesson:policy.current_lesson,index:policy.current_step};setStatus('課堂設定已更新，顯示最新指定階段。')}render()}
 catch(e){if(token===epoch)setStatus('課堂設定暫時無法更新：'+e.message,true)}finally{if(token===epoch)reading=false}
}
function closeHelp(){q('presenterHelpDialog').close();if(helpFocus?.isConnected)helpFocus.focus({preventScroll:true})}
q('presenterHelp').onclick=()=>{helpFocus=q('presenterOptions').querySelector('summary');q('presenterOptions').open=false;q('presenterHelpDialog').showModal();renderHelp();refreshHelp()};q('presenterHelpClose').onclick=closeHelp;q('presenterHelpRefresh').onclick=refreshHelp;q('presenterHelpDialog').addEventListener('cancel',event=>{event.preventDefault();closeHelp()});
function setZoom(value){zoom=Math.max(1,Math.min(4,value));q('presenterImageStage').style.width=(zoom*100)+'%';q('presenterZoomLevel').textContent=Math.round(zoom*100)+'%';q('presenterZoomOut').disabled=zoom===1;q('presenterZoomIn').disabled=zoom===4}
function closeImage(){q('presenterImageDialog').close();if(imageFocus?.isConnected)imageFocus.focus({preventScroll:true})}
function setMarking(value){marking=value;const button=q('presenterMark');button.setAttribute('aria-pressed',String(value));button.classList.toggle('primary',value);button.textContent=value?'標記中（點圖片）':'開始標記';q('presenterImageStage').classList.toggle('is-marking',value);q('presenterImageHint').textContent=value?'在圖片上點一下，加入編號圓圈；可放大或捲動後繼續標記。':'標記已暫停。按「開始標記」後，再點圖片加入圓圈。'}
function openImage(img,focus){imageFocus=focus;q('presenterZoomImage').src=img.currentSrc||img.src;q('presenterZoomImage').alt=img.alt;q('presenterImageTitle').textContent=img.alt||'圖片重點';q('presenterImageMarks').replaceChildren();setZoom(1);setMarking(true);q('presenterImageDialog').showModal();q('presenterImageDialog').querySelector('.presenter-image-scroll').scrollTo(0,0)}
q('presenterSlide').addEventListener('click',event=>{const trigger=event.target.closest('a,button'),img=event.target.closest('img')||trigger?.querySelector('img');if(!img||!q('presenterSlide').contains(img))return;event.preventDefault();openImage(img,trigger||img)});
q('presenterImageClose').onclick=closeImage;q('presenterImageDialog').addEventListener('cancel',event=>{event.preventDefault();closeImage()});
q('presenterZoomIn').onclick=()=>setZoom(zoom+.5);q('presenterZoomOut').onclick=()=>setZoom(zoom-.5);q('presenterZoomReset').onclick=()=>setZoom(1);q('presenterMark').onclick=()=>setMarking(!marking);q('presenterClearMarks').onclick=()=>q('presenterImageMarks').replaceChildren();
q('presenterImageStage').onclick=event=>{if(!marking)return;const bounds=q('presenterZoomImage').getBoundingClientRect();if(!bounds.width||!bounds.height)return;const x=(event.clientX-bounds.left)/bounds.width,y=(event.clientY-bounds.top)/bounds.height;if(x<0||x>1||y<0||y>1)return;const mark=make('span',String(q('presenterImageMarks').children.length+1),'presenter-image-mark');mark.style.left=(x*100)+'%';mark.style.top=(y*100)+'%';mark.setAttribute('aria-label','重點標示');q('presenterImageMarks').append(mark)};
q('presenterLogin').onsubmit=async event=>{
 event.preventDefault();const token=++epoch;password=q('presenterPassword').value;q('presenterPassword').value='';setStatus('正在登入…');
 try{const info=await request('pi_helper_teacher_room_info');if(token!==epoch)return;if(!info?.[0])throw Error('無法確認課堂狀態。');roomReady=info[0].active&&Date.parse(info[0].ends_at)>Date.now();await PiGroups.refresh(password);if(token!==epoch)return;PiGroups.populate(q('presenterGroup'),true);const next=await request('pi_helper_teacher_course_settings');if(token!==epoch)return;acceptPolicy(next);cursor={lesson:policy.current_lesson,index:policy.current_step};live=false;rendered='';setVisible(true);setStatus(roomReady?'目前是預覽；按「開始帶課」才會指定給學生。':'課堂已關閉或到期，請先在工作台管理開放。',!roomReady);render();await refreshHelp()}
 catch(e){if(token!==epoch)return;password='';policy=null;setVisible(false);setStatus(e.code==='FEATURE_UNAVAILABLE'?'上課同步尚未啟用，請先完成資料庫升級。':e.message)}
};
q('presenterStep').onchange=()=>move(cursor.lesson,Number(q('presenterStep').value));q('presenterLesson').onchange=()=>move(q('presenterLesson').value,0);q('presenterGroup').onchange=render;q('presenterBack').onclick=()=>move(cursor.lesson,cursor.index-1);q('presenterNext').onclick=()=>move(cursor.lesson,cursor.index+1);q('presenterFullscreen').onclick=togglePresentation;q('presenterFullscreen').setAttribute('aria-pressed','false');
q('presenterLarger').onclick=()=>{large=!large;document.body.classList.toggle('presenter-large',large);q('presenterLarger').textContent=large?'還原文字大小':'放大文字';q('presenterLarger').setAttribute('aria-pressed',String(large));q('presenterOptions').open=false};
q('presenterLogout').onclick=async()=>{epoch++;password='';policy=null;busy=reading=helpReading=false;roomReady=false;live=false;rendered='';helpRows=[];helpError=helpChecked=helpKey='';fallback=false;q('presenterOptions').open=false;for(const id of ['presenterHelpDialog','presenterImageDialog'])if(q(id).open)q(id).close();q('presenterImageMarks').replaceChildren();q('presenterZoomImage').removeAttribute('src');q('presenterHelpGroups').replaceChildren();setPresentation(false);setVisible(false);q('presenterSlide').replaceChildren();q('presenterHelpBadge').hidden=true;setStatus('已登出。');if(document.fullscreenElement)try{await document.exitFullscreen()}catch{}};
document.addEventListener('keydown',event=>{if(!policy||event.defaultPrevented||q('presenterHelpDialog').open||q('presenterImageDialog').open||event.altKey||event.ctrlKey||event.metaKey||/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName))return;if(event.key==='Escape'&&presentation){fallback=false;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else setPresentation(false)}if(event.key==='ArrowRight'){event.preventDefault();q('presenterNext').click()}if(event.key==='ArrowLeft'){event.preventDefault();q('presenterBack').click()}});
// Fit the complete lesson, including late-loading images and expanded notes.
let fitFrame=0;
function scheduleFit(){if(!fitFrame)fitFrame=requestAnimationFrame(()=>{fitFrame=0;fitSlide()})}
function fitSlide(){
 const slide=q('presenterSlide'),canvas=slide.querySelector('.presenter-canvas');if(!canvas)return;
 const copy=canvas.querySelector('.presenter-copy'),visual=canvas.querySelector('.presenter-visual');
 if(!presentation){canvas.style.cssText='';copy.style.cssText='';if(visual)for(const img of visual.querySelectorAll('img'))img.style.removeProperty('max-height');return}
 const style=getComputedStyle(slide),width=slide.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height=slide.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
 if(width<=0||height<=0)return;
 canvas.style.width=width+'px';
 if(visual){
  canvas.style.height=height+'px';canvas.style.transform='translateX(-50%)';
  const panel=canvas.querySelector('.presenter-content'),available=visual.clientHeight,images=[...visual.querySelectorAll('img')];
  // Image size depends on its own panel, never on the amount of text on the left.
  const top=visual.getBoundingClientRect().top,usedHeight=Math.max(0,...[...visual.children].map(node=>node.getBoundingClientRect().bottom-top+(parseFloat(getComputedStyle(node).marginBottom)||0)));
  const overhead=usedHeight-images.reduce((sum,img)=>sum+img.offsetHeight,0);
  for(const img of images)img.style.maxHeight=Math.max(24,(available-overhead-4)/images.length)+'px';
  copy.style.width=panel.clientWidth+'px';
  const textScale=Math.min(1,panel.clientWidth/Math.max(1,copy.scrollWidth),panel.clientHeight/Math.max(1,copy.scrollHeight,copy.offsetHeight));
  copy.style.transform='scale('+textScale+')';panel.scrollTop=panel.scrollLeft=0;
  slide.scrollTop=slide.scrollLeft=0;return;
 }
 canvas.style.removeProperty('height');copy.style.cssText='';
 const scale=Math.min(1,width/Math.max(width,canvas.scrollWidth),height/Math.max(1,canvas.offsetHeight,canvas.scrollHeight));
 canvas.style.transform='translateX(-50%) scale('+scale+')';slide.scrollTop=slide.scrollLeft=0;
}
if(typeof ResizeObserver==='function'){
 const observer=new ResizeObserver(scheduleFit);observer.observe(q('presenterSlide'));
 new MutationObserver(()=>{const canvas=q('presenterSlide').querySelector('.presenter-canvas');observer.disconnect();observer.observe(q('presenterSlide'));if(canvas){observer.observe(canvas);observer.observe(canvas.querySelector('.presenter-copy'));const visual=canvas.querySelector('.presenter-visual');if(visual)observer.observe(visual)}scheduleFit()}).observe(q('presenterSlide'),{childList:true,subtree:true,characterData:true});
}
q('presenterSlide').addEventListener('load',scheduleFit,true);q('presenterSlide').addEventListener('toggle',scheduleFit,true);window.addEventListener('resize',scheduleFit);
if(document.fonts)document.fonts.ready.then(scheduleFit);
setInterval(()=>{if(policy&&!document.hidden){refreshClass();refreshHelp()}},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshClass();refreshHelp()}});window.addEventListener('online',()=>{refreshClass();refreshHelp()});
})();
