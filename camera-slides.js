(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function build(index,host,onStatus){
 const stage=PiCameraCourse.stages[index],box=make('div',undefined,'camera-slide-instructions'),fill=text=>PiCameraCourse.fill(text,host);
 if(stage.code)box.append(make('p',fill((stage.actions||[]).find(text=>text.includes('/home/user/'))||'在 Pi 的文字編輯器親手輸入並儲存：'),'muted'),make('pre',fill(stage.code)));
 if(stage.commands.length){
  const label=make('label','這個階段的指令（一次只做一行）'),select=make('select'),pre=make('pre'),copy=make('button','複製目前這一行','command-copy');copy.type='button';
  stage.commands.forEach((command,i)=>{const option=make('option','第 '+(i+1)+' / '+stage.commands.length+' 行');option.value=String(i);select.append(option)});label.append(select);const render=()=>pre.textContent=fill(stage.commands[Number(select.value)||0]);select.onchange=render;copy.onclick=async()=>{try{await navigator.clipboard.writeText(pre.textContent);onStatus('已複製目前這一行，請在指定視窗貼上後按 Enter。',true)}catch{const range=document.createRange();range.selectNodeContents(pre);getSelection().removeAllRanges();getSelection().addRange(range);onStatus('請手動複製已選取的這一行。',true)}};box.append(label,pre,copy);render();
 }
 return box;
}
window.PiCameraSlides={build};
})();
