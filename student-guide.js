(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const $=id=>document.getElementById(id),seenKey='pi-helper-guide-v3-seen';
const steps=[
 {
  "title": "先認識桌上的東西",
  "where": "現在先看網頁，不用輸入指令",
  "items": [
   "樹莓派（Pi）就是桌上那塊小電腦。SD 卡放它的系統，電源讓它開機。",
   "你手上的 Windows 電腦用來操作樹莓派。手機只要開熱點，讓兩台電腦連在一起。",
   "這個網頁只顯示步驟，不會連上 Pi 或執行指令。先準備 Pi 5、電源、SD 卡、讀卡機與 Windows 電腦。"
  ],
  "example": "看網頁 → 到電腦照做 → 回網頁選看到的結果",
  "tip": "一次只做畫面上的一步，不用先看懂所有英文。"
 },
 {
  "title": "選組別，再把系統寫進 SD 卡",
  "where": "在網頁選組別；在 Windows 開 Imager",
  "items": [
   "在下方選自己的組別。每次都選同一組。",
   "還沒做過刷機：關閉導覽後，按「① 尚未刷機：開始刷機圖解」。",
   "照圖解完成每一步，等寫入與驗證都成功，再取出 SD 卡。這就叫做「刷機」。"
  ],
  "example": ()=>host()+'（填入刷機主機名稱）',
  "tip": "刷機會清空 SD 卡；有要保留的資料，先找助教備份。"
 },
 {
  "title": "開熱點、插卡，再接電",
  "where": "在手機與桌上的樹莓派操作",
  "items": [
   "手機開啟本組熱點，Windows 電腦連上這個熱點。",
   "樹莓派先不要接電。插入剛寫好的 SD 卡，再接上電源。",
   "等候數分鐘，保持熱點開啟。樹莓派會使用刷機時填好的熱點設定連線。"
  ],
  "example": "手機熱點開啟 → Windows 連熱點 → Pi 插卡接電 → 等開機",
  "tip": "不要反覆拔電。如果不確定有沒有開機，先問助教。"
 },
 {
  "title": "在 Windows 開 PowerShell，貼上指令",
  "where": "在 Windows 電腦操作",
  "items": [
   "按 Windows 開始鍵，輸入 PowerShell，開啟 Windows PowerShell。",
   "回網頁按「② 已完成刷機：開始 SSH 連線」，再按「複製指令」。",
   "切回 PowerShell，按 Ctrl + V 貼上，再按 Enter。這就是用 SSH 登入樹莓派。"
  ],
  "example": ()=> 'ssh user@'+host()+'.local',
  "tip": "手機的複製按鈕只會複製到手機。請在 Windows 開同一個網頁複製，或照畫面輸入。"
 },
 {
  "title": "照畫面回答，不用猜成功",
  "where": "先看 PowerShell，再回網頁",
  "items": [
   "第一次出現 yes/no：先請助教核對設備，確認後輸入 yes，再按 Enter。",
   "出現 password：輸入 123，再按 Enter。輸入時看不到字或星號是正常的。",
   "回網頁，點你真的看到的結果。看到錯誤就選同一句英文；不知道就請助教看畫面。"
  ],
  "example": "密碼看不到字 → 照常輸入 → 按 Enter",
  "tip": "有錯誤就停在這一步，保留畫面。不要猜著選「成功」。"
 },
 {
  "title": "登入後，照網頁安裝遠端桌面",
  "where": "在剛剛登入樹莓派的 PowerShell 視窗操作",
  "items": [
   "依網頁先核對組別與帳號，再開始安裝。每次只複製一條指令，按 Enter，等完成才繼續。",
   "X11 那一步會出現選單。請看醒目的鍵盤提示，用方向鍵、Enter 與 Tab 選擇。",
   "重新開機時連線會斷掉；等數分鐘，再照網頁開啟 Windows 遠端桌面。Session 選 Xorg，帳號 user，密碼 123。"
  ],
  "example": ()=> 'user@'+host()+':~$  ← 已登入樹莓派',
  "tip": "看到 PS C:\\…> 是 Windows；看到 user@pi5-XX 是已登入樹莓派。不要把命令列前面的提示字一起複製。"
 },
 {
  "title": "現在從這裡開始",
  "where": "回到網頁操作",
  "items": [
   "還沒刷機：按下方「尚未刷機」。",
   "刷機完成：按「已完成刷機」，回首頁選組別，開始 SSH。",
   "下課前先儲存，按完成頁的「正確關機」。執行後至少再等 30 秒，確認關機完成才拔電。",
   "中途卡住請助教幫忙。也可按「用 AI 協助」；不要貼密碼。"
  ],
  "example": "先刷機 → SSH 登入 → 安裝 → 開遠端桌面",
  "tip": "每做完一步才選結果；網頁會依結果帶你走下一步。"
 }
];
function host(){return $('group').value||'pi5-01'}
const opener=make('button','操作導覽');opener.type='button';document.querySelector('.top-links').prepend(opener);
const dialog=make('dialog',undefined,'guide-dialog');dialog.setAttribute('aria-labelledby','studentGuideTitle');
const inner=make('div',undefined,'guide-inner'),top=make('div',undefined,'guide-top'),progress=make('p'),skip=make('button','關閉導覽','guide-skip');skip.type='button';top.append(progress,skip);
const dots=make('div',undefined,'guide-count');dots.setAttribute('aria-hidden','true');const number=make('span',undefined,'guide-number'),title=make('h2');title.id='studentGuideTitle';title.tabIndex=-1;
const where=make('p',undefined,'place'),list=make('ol',undefined,'guide-checklist'),example=make('pre',undefined,'guide-example'),tip=make('p',undefined,'guide-tip');
const groupLabel=make('label','我的組別'),group=make('select');group.id='guideGroup';for(let i=1;i<=(window.PiGroups?.count||9);i++){const o=make('option','第 '+i+' 組 · pi5-'+String(i).padStart(2,'0'));o.value='pi5-'+String(i).padStart(2,'0');group.append(o)}groupLabel.append(group);
const entries=make('div',undefined,'guide-entries'),flash=make('button','尚未刷機 → 開啟刷機圖解','primary'),ready=make('button','已完成刷機 → 回首頁開始 SSH');flash.type=ready.type='button';entries.append(flash,ready);
const controls=make('div',undefined,'guide-controls'),back=make('button','← 上一步'),next=make('button','下一步 →','primary');back.type=next.type='button';controls.append(back,next);inner.append(top,dots,number,title,where,groupLabel,list,example,tip,entries,controls);dialog.append(inner);document.body.append(dialog);let index=0,previousFocus=null;
function render(){const s=steps[index];progress.textContent='操作導覽 '+(index+1)+' / '+steps.length;number.textContent=String(index+1).padStart(2,'0');title.textContent=s.title;where.textContent=s.where;where.className='place'+(index===5?' pi':'');list.replaceChildren();for(const text of s.items)list.append(make('li',text));example.textContent=typeof s.example==='function'?s.example():s.example;tip.textContent=s.tip;groupLabel.hidden=index!==1;entries.hidden=index!==steps.length-1;back.disabled=index===0;next.hidden=index===steps.length-1;dots.replaceChildren();for(let i=0;i<steps.length;i++)dots.append(make('span',undefined,'guide-dot'+(i===index?' active':'')));inner.scrollTop=0;title.focus({preventScroll:true})}
function open(){previousFocus=document.activeElement;group.value=host();index=0;if(typeof dialog.showModal!=='function')return;dialog.showModal();render()}
function close(){try{localStorage.setItem(seenKey,'1')}catch{}dialog.close();previousFocus?.focus?.({preventScroll:true})}
group.onchange=()=>{$('group').value=group.value;example.textContent=steps[index].example()};
document.addEventListener('pi-helper-groups-changed',()=>{if(dialog.open)render()});
back.onclick=()=>{if(index>0){index--;render()}};next.onclick=()=>{if(index<steps.length-1){index++;render()}};skip.onclick=close;opener.onclick=open;
flash.onclick=()=>{close();$('openFlashHome').click()};ready.onclick=()=>{close();$('edit').click();$('setup').scrollIntoView({block:'start'});$('group').focus()};dialog.addEventListener('cancel',()=>{try{localStorage.setItem(seenKey,'1')}catch{}previousFocus?.focus?.({preventScroll:true})});try{if(localStorage.getItem(seenKey)!=='1')open()}catch{open()}
})();
