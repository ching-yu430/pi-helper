(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function lines(text){return String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean)}
function build(text,{onCopy,buttonClass='primary'}={}){
 const commands=lines(text),box=make('div',undefined,'command-steps');
 box.append(make('p','每次只複製一行，貼到指定視窗後按 Enter；等它執行結束，再依說明做下一行。','command-steps-intro'));
 const labels={hostname:'確認本組主機名稱',whoami:'確認登入帳號','systemctl is-active xrdp':'查看服務是否啟動','systemctl status xrdp --no-pager':'查看服務詳細狀態'};
 commands.forEach((command,index)=>{
  const step=make('div',undefined,'command-step'),label=make('p','第 '+(index+1)+' 行：'+(labels[command]||(index===0?'先執行這一行':'再執行這一行')),'command-step-label'),pre=make('pre',command),button=make('button','複製第 '+(index+1)+' 行',buttonClass);
  button.type='button';button.setAttribute('aria-label','複製第 '+(index+1)+' 行：'+command);button.onclick=()=>onCopy?.(command,pre);
  step.append(label,pre,button);box.append(step);
 });
 return box;
}
window.PiCommandSteps={lines,build};
})();
