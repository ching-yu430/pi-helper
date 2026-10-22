(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function lines(text){return String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean)}
function build(text,{onCopy,buttonClass='',guided=false,pasteTarget='指定的視窗',pasteKeys='Ctrl + V',results=[],onStepChange}={}){
 const commands=lines(text),box=make('div',undefined,'command-steps');
 box.append(make('p',guided?'一次做一行：按綠色複製按鈕 → 切到'+pasteTarget+' → 按 '+pasteKeys+' 貼上 → 按 Enter。':'每次只複製一行，貼到指定視窗後按 Enter；等它執行結束，再依說明做下一行。','command-steps-intro'));
 const labels={hostname:'確認本組主機名稱',whoami:'確認登入帳號','systemctl is-active xrdp':'查看服務是否啟動','systemctl status xrdp --no-pager':'查看服務詳細狀態'};
 const cards=commands.map((command,index)=>{
  const step=make('div',undefined,'command-step'),label=make('p','第 '+(index+1)+' 行：'+(labels[command]||(index===0?'先執行這一行':'再執行這一行')),'command-step-label'),pre=make('pre',command),button=make('button','複製第 '+(index+1)+' 行',('command-copy '+buttonClass).trim());
  const feedback=make('p',undefined,'command-copy-feedback');feedback.hidden=true;feedback.setAttribute('role','status');
  button.type='button';button.setAttribute('aria-label','複製第 '+(index+1)+' 行：'+command);button.onclick=async()=>{const copied=await onCopy?.(command,pre);if(guided&&copied===true){feedback.textContent='複製好了。切到'+pasteTarget+'，按 '+pasteKeys+' 貼上，再按 Enter。';feedback.hidden=false}};
  step.append(label,pre,button);box.append(step);
  if(guided){step.append(feedback);const result=make('p','這行做完會看到：'+(results[index]||'文字停止捲動，又出現可以輸入指令的位置。'),'command-line-result');step.append(result)}
  return step;
 });
 if(guided&&commands.length>1){
  box.classList.add('command-guided');let current=0;
  const controls=make('nav',undefined,'command-line-navigation'),back=make('button','← 看上一行'),count=make('span'),next=make('button','這行做完了，換下一行 →');controls.setAttribute('aria-label','切換本步驟的指令');count.setAttribute('role','status');back.type=next.type='button';
  function show(index,focus=false){current=index;cards.forEach((card,i)=>card.hidden=i!==current);count.textContent='第 '+(index+1)+'／'+commands.length+' 行';back.disabled=index===0;next.hidden=index===commands.length-1;onStepChange?.(index);if(focus){const title=cards[index].querySelector('.command-step-label');title.tabIndex=-1;title.focus({preventScroll:true});cards[index].scrollIntoView({block:'nearest'})}}
  back.onclick=()=>show(current-1,true);next.onclick=()=>show(current+1,true);controls.append(back,count,next);box.append(controls);show(0);
 }
 return box;
}
window.PiCommandSteps={lines,build};
})();
