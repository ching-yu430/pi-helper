(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const steps=[
 ['先選自己的組別','選擇第 01～09 組，確認畫面上的主機名稱符合自己的組別，再按「開始 SSH 連線」。','還沒刷機？可從「刷機圖解」依圖片與步驟開始。'],
 ['在學生電腦執行指令','先看指令上方標示的位置，按複製，再貼到學生電腦的 PowerShell 執行。','手機用來看步驟；複製到手機後，仍需將指令傳到學生電腦。'],
 ['對照畫面，選執行結果','閱讀選項下方的英文回覆範例，選擇符合自己畫面的結果；網頁就會帶你到下一步。','開始操作後會自動回報組別與進度。可查看頁面上的同步狀態。'],
 ['看不懂時，使用 AI 協助','按「都不符合／看不懂，用 AI 協助」，先查看完整提示詞，再複製貼到 AI 對話詢問。','貼上執行結果前，請移除密碼與私鑰；要重做時可按右下角「重新開始」。']
];
const opener=make('button','操作導覽');opener.type='button';document.querySelector('.top-links').prepend(opener);
const dialog=make('dialog',undefined,'guide-dialog');dialog.setAttribute('aria-labelledby','studentGuideTitle');const inner=make('div',undefined,'guide-inner'),top=make('div',undefined,'guide-top'),progress=make('p'),skip=make('button','略過','guide-skip');skip.type='button';top.append(progress,skip);const dots=make('div',undefined,'guide-count');dots.setAttribute('aria-hidden','true');const number=make('span',undefined,'guide-number'),title=make('h2');title.id='studentGuideTitle';title.tabIndex=-1;const body=make('p',undefined,'guide-body'),tip=make('p',undefined,'guide-tip'),controls=make('div',undefined,'guide-controls'),back=make('button','上一步'),next=make('button','下一步','primary');back.type=next.type='button';controls.append(back,next);inner.append(top,dots,number,title,body,tip,controls);dialog.append(inner);document.body.append(dialog);let index=0,previousFocus=null;
function render(){progress.textContent='操作導覽 '+(index+1)+' / '+steps.length;number.textContent=String(index+1).padStart(2,'0');title.textContent=steps[index][0];body.textContent=steps[index][1];tip.textContent=steps[index][2];back.disabled=index===0;next.textContent=index===steps.length-1?'開始使用':'下一步';dots.replaceChildren();for(let i=0;i<steps.length;i++)dots.append(make('span',undefined,'guide-dot'+(i===index?' active':'')));inner.scrollTop=0;title.focus({preventScroll:true})}
function open(){previousFocus=document.activeElement;index=0;if(typeof dialog.showModal!=='function')return;dialog.showModal();render()}
function close(){try{localStorage.setItem('pi-helper-guide-seen','1')}catch{}dialog.close();if(previousFocus&&typeof previousFocus.focus==='function')previousFocus.focus({preventScroll:true})}
back.onclick=()=>{if(index>0){index--;render()}};next.onclick=()=>{if(index<steps.length-1){index++;render()}else close()};skip.onclick=close;opener.onclick=open;dialog.addEventListener('cancel',()=>{try{localStorage.setItem('pi-helper-guide-seen','1')}catch{}if(previousFocus?.focus)previousFocus.focus({preventScroll:true})});try{if(localStorage.getItem('pi-helper-guide-seen')!=='1')open()}catch{open()}
})();
