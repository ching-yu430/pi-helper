(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function build(index,host,onStatus){
 const stage=PiCameraCourse.stages[index],box=make('div',undefined,'camera-slide-instructions'),fill=text=>PiCameraCourse.fill(text,host);
 async function copy(text,pre){try{await navigator.clipboard.writeText(text);onStatus('已複製，請貼到指定的視窗。',true);return true}catch{try{const range=document.createRange();range.selectNodeContents(pre);getSelection().removeAllRanges();getSelection().addRange(range)}catch{}onStatus('無法自動複製，請手動複製已選取的內容。',true);return false}}
 if(stage.assignment){const list=make('ul',undefined,'camera-requirements');for(const text of stage.requirements)list.append(make('li',text));box.append(list,make('p','程式存成：'+fill(stage.view.saveAs)),make('p','照片資料夾：/home/user/pi-camera/photos'),make('p','照片檔名：'+fill('{host}_YYYYMMDD_HHMMSS_ffffff.jpg')+'（ffffff 是六位微秒）'))}
 if(stage.code){const pre=make('pre',fill(stage.code)),button=make('button','複製程式碼','command-copy');PiCommandSteps.bindCopy(button,fill(stage.code),{source:pre,onCopy:copy});box.append(make('p','在 Thonny 按 Ctrl + N 輸入程式，再按 Ctrl + S 存成 '+fill(stage.view.saveAs),'muted'),pre,button)}
 if(stage.commands.length){
  const label=make('label','這個階段的指令（一次只做一行）'),select=make('select'),pre=make('pre'),button=make('button','複製目前這一行','command-copy');
  stage.commands.forEach((command,i)=>{const option=make('option','第 '+(i+1)+' / '+stage.commands.length+' 行');option.value=String(i);select.append(option)});label.append(select);const render=()=>{pre.textContent=fill(stage.commands[Number(select.value)||0]);button.resetCopyFeedback?.()};select.onchange=render;PiCommandSteps.bindCopy(button,()=>pre.textContent,{source:pre,onCopy:copy});box.append(label,pre,button);render();
 }
 return box;
}
window.PiCameraSlides={build};
})();
