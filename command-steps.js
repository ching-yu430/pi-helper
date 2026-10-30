(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function lines(text){return String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean)}
// A callback must return true only after a confirmed clipboard write.
function bindCopy(button,text,{source=null,status=null,onCopy,success='已複製。',failure='無法自動複製，請選取內容後手動複製。'}={}){
 const label=button.textContent;let sequence=0;
 button.type='button';if(status){status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite')}
 button.onclick=async()=>{const attempt=++sequence;button.disabled=true;button.dataset.copyState='copying';let copied=false;
  try{const value=typeof text==='function'?text():text;if(onCopy)copied=await onCopy(value,source)===true;else{await navigator.clipboard.writeText(value);copied=true}}catch{}
  if(attempt!==sequence)return;button.disabled=false;button.dataset.copyState=copied?'success':'failed';button.textContent=copied?'已複製':'請手動複製';
  if(!copied&&source){try{const range=document.createRange();range.selectNodeContents(source);getSelection().removeAllRanges();getSelection().addRange(range)}catch{}}
  if(status){status.textContent=copied?success:failure;status.dataset.copyState=copied?'success':'failed';status.hidden=false}
  setTimeout(()=>{if(attempt===sequence){button.textContent=label;button.dataset.copyState=''}},2200);
  return copied;
 };
 button.resetCopyFeedback=()=>{sequence++;button.disabled=false;button.textContent=label;button.dataset.copyState='';if(status){status.hidden=true;status.dataset.copyState=''}};
 return button;
}
function build(text,{onCopy,buttonClass='',guided=false,pasteTarget='指定的視窗',pasteKeys='Ctrl + V',results=[],onStepChange,compact=false,commandTitles=[],navigation=true,copyLabel=null,showResult=true}={}){
 const commands=lines(text),box=make('div',undefined,'command-steps');
 if(compact)box.classList.add('command-compact');
 if(!compact)box.append(make('p',guided?'一次做一行：按綠色複製按鈕 → 切到'+pasteTarget+' → 按 '+pasteKeys+' 貼上 → 按 Enter。':'每次只複製一行，貼到指定視窗後按 Enter；等它執行結束，再依說明做下一行。','command-steps-intro'));
 const labels={hostname:'確認本組主機名稱',whoami:'確認登入帳號','systemctl is-active xrdp':'查看服務是否啟動','systemctl status xrdp --no-pager':'查看服務詳細狀態'};
 const cards=commands.map((command,index)=>{
  const step=make('div',undefined,'command-step'),label=make('p',compact?(commandTitles[index]||'指令 '+(index+1)):'第 '+(index+1)+' 行：'+(labels[command]||(index===0?'先執行這一行':'再執行這一行')),'command-step-label'),pre=make('pre',command),button=make('button',copyLabel||'複製第 '+(index+1)+' 行',('command-copy '+buttonClass).trim());
  const feedback=make('p',compact?pasteKeys+' 貼上 → Enter':undefined,'command-copy-feedback');feedback.hidden=!compact;feedback.setAttribute('role','status');
  button.setAttribute('aria-label','複製第 '+(index+1)+' 行：'+command);
  bindCopy(button,command,{source:pre,status:feedback,onCopy,success:guided?'已複製，到'+pasteTarget+'按 '+pasteKeys+' → Enter。':'已複製這一行，請到指定視窗貼上執行。'});
  if(compact){feedback.textContent=pasteKeys+' 貼上 → Enter';feedback.hidden=false}
  step.append(label,pre,button,feedback);box.append(step);
  if(guided){const result=make('p',(compact?'完成時：':'這行做完會看到：')+(results[index]||'文字停止捲動，又出現可以輸入指令的位置。'),'command-line-result');if(showResult)step.append(result)}
  return step;
 });
 if(guided&&commands.length){
  box.classList.add('command-guided');let current=0;
  const controls=make('nav',undefined,'command-line-navigation'),back=make('button',compact?'← 上一行':'← 看上一行'),count=make('span'),next=make('button',compact?'下一行 →':'這行做完了，換下一行 →');controls.setAttribute('aria-label','切換本步驟的指令');count.setAttribute('role','status');back.type=next.type='button';
  function show(index,focus=false){current=index;cards.forEach((card,i)=>card.hidden=i!==current);count.textContent=(compact?'指令 ':'第 ')+(index+1)+'／'+commands.length+(compact?'':' 行');back.disabled=index===0;next.hidden=index===commands.length-1;onStepChange?.(index);if(focus){const title=cards[index].querySelector('.command-step-label');title.tabIndex=-1;title.focus({preventScroll:true});cards[index].scrollIntoView({block:'nearest'})}}
  back.onclick=()=>show(current-1,true);next.onclick=()=>show(current+1,true);controls.append(back,count,next);if(navigation&&commands.length>1)box.append(controls);box.commandNavigation={get index(){return current},count:commands.length,show(index,focus=false){if(Number.isInteger(index)&&index>=0&&index<commands.length)show(index,focus)}};show(0);
 }
 return box;
}
window.PiCommandSteps={lines,build,bindCopy};
})();
