(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e},q=id=>document.getElementById(id),seenKey='pi-helper-guide-v5-seen';
const steps=[
 {title:'先選自己的組別',where:'在課程首頁操作',items:['樹莓派（Pi）是桌上的小電腦；上課時用 Windows 筆電操作它。','先在首頁選自己的組別，後面的步驟就會帶入本組設定。','已能使用樹莓派桌面，直接按首頁「開始上課」。要重看刷機或連線，再展開「初次設定（已完成）」。'],example:()=>host()==='pi5-XX'?'先選組別，才會顯示本組設定。':'本組主機：'+host()+'.local',tip:'按網頁按鈕不會替你執行指令，仍需到指定視窗操作。'},
 {title:'老師教哪一步，就打開哪一步',where:'在首頁選好組別後操作',items:['老師已指定步驟：按「跟上老師進度」。就算這課已自行確認完成，也能再進去看。老師指定的任何課程都會顯示在首頁。','做到一半回首頁，按「繼續上課」。舊課程的進度收在「初次設定（已完成）」裡。','操作途中想跟上老師，按「跟上老師進度」（拍照課在上方「工具」裡）。網頁會讀取老師最新指定的步驟。'],example:'老師指定步驟 ≠ 本組上次進度',tip:'老師換步驟時不會自動跳頁。看到「等老師說明」時，先留在目前步驟。'},
 {title:'看清楚位置，再貼上指令',where:'在 Windows 筆電操作',items:['上課用的筆電，要連上本組手機熱點。樹莓派也使用同一個熱點。','畫面寫「Windows PowerShell」：在 Windows 按開始鍵，輸入 PowerShell 並開啟。','Windows PowerShell：複製後按 Ctrl + V，再按 Enter。樹莓派桌面的終端機：改按 Ctrl + Shift + V，再按 Enter。'],example:()=>host()==='pi5-XX'?'選組後，網頁會提供本組的登入指令。':'ssh user@'+host()+'.local',tip:'優先用本組 .local。找不到時照網頁檢查；仍不行再請助教協助。手機複製的指令不會自動到筆電。'},
 {title:'做完一步，才選實際結果',where:'先看操作位置，再照畫面做',items:['一次只看一行。做完後按下一步，再做下一個動作。','複製不會幫你執行。要切回指定視窗、貼上、按 Enter。看到說明中的結果，才按下一步。','X11 設定先執行指令，再照每個小步驟的圖片，用方向鍵、Enter 與 Tab 操作。'],example:'在指定視窗照做 → 對照結果 → 回網頁選下一步',tip:'找不到視窗、按鈕或結果，就按「請助教幫忙」。不確定時先停下，不要直接選成功。'},
 {title:'卡住就按「請助教幫忙」',where:'在目前卡住的步驟送出求助',items:['按「請助教幫忙」，可填卡住的情況，再按「送出求助」。保留筆電上的錯誤畫面。','看到「已送出，等候助教」就先等；「助教已接手」表示有人正在協助。','看到「請確認處理結果」，照原步驟再試一次，再選「問題已解決」或「仍有問題，請再幫忙」。'],example:'送出求助 → 助教接手 → 再試一次 → 回報結果',tip:'要查看狀態，按原本的求助按鈕即可。不用重複送出，也不要貼密碼。'},
 {title:'下課先關機，再拔電',where:'依「正確關機」課程操作',items:['先儲存樹莓派裡的程式與作業。','回首頁開第 04 課「先關機，再拔電」，在已登入的 Pi 視窗執行關機指令。','執行後至少再等 30 秒，確認關機完成才拔電；不確定就請助教看。'],example:'儲存 → 執行關機 → 等至少 30 秒 → 確認完成 → 拔電',tip:'只關閉遠端桌面視窗，樹莓派還在運作。'}
];
function host(){return window.PiStudentGroup?.read()||q('courseGroup')?.value||q('group')?.value||'pi5-XX'}
let opener=q('openStudentGuide');if(!opener){opener=make('button','使用說明');opener.id='openStudentGuide';opener.type='button';opener.disabled=Boolean(q('studentWorkspace')?.hidden);document.querySelector('.top-links').prepend(opener)}
const dialog=make('dialog',undefined,'guide-dialog');dialog.setAttribute('aria-labelledby','studentGuideTitle');
const inner=make('div',undefined,'guide-inner'),top=make('div',undefined,'guide-top'),progress=make('p'),skip=make('button','關閉說明','guide-skip');skip.type='button';top.append(progress,skip);
const dots=make('div',undefined,'guide-count');dots.setAttribute('aria-hidden','true');const number=make('span',undefined,'guide-number'),title=make('h2');title.id='studentGuideTitle';title.tabIndex=-1;
const where=make('p',undefined,'place'),list=make('ol',undefined,'guide-checklist'),example=make('pre',undefined,'guide-example'),tip=make('p',undefined,'guide-tip');
const entries=make('div',undefined,'guide-entries'),home=make('a','回課程首頁選課','lesson-action');home.href='index.html';entries.append(home);
const controls=make('div',undefined,'guide-controls'),back=make('button','← 上一步'),next=make('button','下一步 →','primary');back.type=next.type='button';controls.append(back,next);inner.append(top,dots,number,title,where,list,example,tip,entries,controls);dialog.append(inner);document.body.append(dialog);let index=0,previousFocus=null;
function render(){const s=steps[index];progress.textContent='使用說明 '+(index+1)+' / '+steps.length;number.textContent=String(index+1).padStart(2,'0');title.textContent=s.title;where.textContent=s.where;list.replaceChildren();for(const text of s.items)list.append(make('li',text));example.textContent=typeof s.example==='function'?s.example():s.example;tip.textContent=s.tip;entries.hidden=index!==steps.length-1;back.disabled=index===0;next.textContent=index===steps.length-1?'關閉說明，開始操作':'下一步 →';dots.replaceChildren();for(let i=0;i<steps.length;i++)dots.append(make('span',undefined,'guide-dot'+(i===index?' active':'')));inner.scrollTop=0;title.focus({preventScroll:true})}
function open(){previousFocus=document.activeElement;index=0;if(typeof dialog.showModal!=='function')return;dialog.showModal();render()}
function close(){try{localStorage.setItem(seenKey,'1')}catch{}dialog.close();previousFocus?.focus?.({preventScroll:true})}
back.onclick=()=>{if(index>0){index--;render()}};next.onclick=()=>{if(index<steps.length-1){index++;render()}else close()};skip.onclick=close;opener.onclick=open;dialog.addEventListener('cancel',()=>{try{localStorage.setItem(seenKey,'1')}catch{}previousFocus?.focus?.({preventScroll:true})});
})();
