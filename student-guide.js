(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const $=id=>document.getElementById(id),seenKey='pi-helper-guide-v2-seen';
const steps=[
 {title:'先分清楚：網頁、Windows、Pi',where:'先看說明',items:['這個網頁只顯示教學、產生指令與回報進度，不會連上 Pi 或執行指令。','手機可以看步驟；真正的刷機、PowerShell 與遠端桌面操作要在 Windows 電腦完成。'],example:'網頁看步驟 → 到指定位置操作 → 回網頁選結果',tip:'請先把 Windows 電腦、Pi 5、SD 卡、讀卡機與本組手機熱點準備好。'},
 {title:'選自己的組別，先完成刷機',where:'在網頁選組；在電腦開 Imager',items:['在下方選自己的組別，燒錄 hostname 不加 .local。','尚未刷機就按首頁「① 尚未刷機：開始刷機圖解」，逐步完成並等寫入與驗證成功。','講義使用 Pi 5、64-bit 有桌面版、user／123、TW、Asia/Taipei、同組熱點與 SSH 密碼驗證。'],example:()=>host()+'（刷機） → '+host()+'.local（連線）',tip:'只確認名稱與範例，不要把別組主機名稱填入 Imager。'},
 {title:'SSH 指令貼到 Windows PowerShell',where:'在 Windows 電腦執行',items:['先開本組熱點，Windows 與 Pi 都連同一熱點，等 Pi 第一次開機完成。','已完成刷機後，回首頁按「② 已完成刷機：開始 SSH 連線」。','按「複製指令」，貼到 Windows PowerShell，按 Enter。首次信任先核對設備；密碼提示時依講義輸入 123，畫面不顯字是正常的。'],example:()=> 'ssh user@'+host()+'.local',tip:'手機的複製按鈕只複製到手機；可在電腦開同一網址，或依畫面逐字輸入。'},
 {title:'執行完成後，才回網頁選結果',where:'先看 PowerShell，再回網頁',items:['選項內的英文只是比對範例，不代表網站已測到你的 Pi。','例如看到 Could not resolve hostname，就選「找不到主機名稱」；看到密碼提示，就選「出現密碼輸入提示」。','登入後用 hostname／whoami 核對本組。名稱解析失敗、同組熱點與開機均確認後，才參考「電腦查 IP 版」。'],example:'實際畫面：Could not resolve hostname\n網頁選擇：找不到主機名稱 →',tip:'沒有相符選項就求助，不要為了往下一步而猜選成功。'},
 {title:'登入後才在 Pi 執行 sudo 指令',where:'在已登入的 Pi SSH 命令列執行',items:['確認已看到 Pi 的命令提示字元後，依網站教學更新、安裝 xrdp／xorgxrdp，再啟用服務。每行成功後再繼續。','依講義透過 raspi-config 選 X11，再重開機；SSH 斷線是正常現象。','之後回 Windows 開遠端桌面，目標用本組 .local，Session 選 Xorg，帳密依講義。'],example:()=> 'user@'+host()+':~$  ← 代表已登入，這段不要一起複製\nsudo apt update',tip:'看到「Windows PowerShell」與「樹莓派 SSH」標籤時，先確認自己正在正確視窗。'},
 {title:'需要協助、回報與清除紀錄',where:'回到網頁操作',items:['看不懂時按「都不符合／看不懂，用 AI 協助」，先檢查提示詞再複製到自己的 AI 對話。這不會自動傳訊給助教。','「已回報至助教看板」才代表最近送出成功；失敗可按重試。','「清除本機排查」會清掉本分頁內容；助教看板的歷史回報由助教另外清除，Pi 的檔案不受影響。'],example:'移除密碼、私鑰與不需要公開的內容，再複製 AI 提示詞。',tip:'先選下方入口：還沒刷機從圖解開始，已刷機則回首頁選組並開始 SSH。'}
];
function host(){return $('group').value||'pi5-01'}
const opener=make('button','操作導覽');opener.type='button';document.querySelector('.top-links').prepend(opener);
const dialog=make('dialog',undefined,'guide-dialog');dialog.setAttribute('aria-labelledby','studentGuideTitle');
const inner=make('div',undefined,'guide-inner'),top=make('div',undefined,'guide-top'),progress=make('p'),skip=make('button','關閉導覽','guide-skip');skip.type='button';top.append(progress,skip);
const dots=make('div',undefined,'guide-count');dots.setAttribute('aria-hidden','true');const number=make('span',undefined,'guide-number'),title=make('h2');title.id='studentGuideTitle';title.tabIndex=-1;
const where=make('p',undefined,'place'),list=make('ol',undefined,'guide-checklist'),example=make('pre',undefined,'guide-example'),tip=make('p',undefined,'guide-tip');
const groupLabel=make('label','我的組別'),group=make('select');group.id='guideGroup';for(let i=1;i<=9;i++){const o=make('option','第 '+i+' 組 · pi5-'+String(i).padStart(2,'0'));o.value='pi5-'+String(i).padStart(2,'0');group.append(o)}groupLabel.append(group);
const entries=make('div',undefined,'guide-entries'),flash=make('button','尚未刷機 → 開啟刷機圖解','primary'),ready=make('button','已完成刷機 → 回首頁開始 SSH');flash.type=ready.type='button';entries.append(flash,ready);
const controls=make('div',undefined,'guide-controls'),back=make('button','← 上一步'),next=make('button','下一步 →','primary');back.type=next.type='button';controls.append(back,next);inner.append(top,dots,number,title,where,groupLabel,list,example,tip,entries,controls);dialog.append(inner);document.body.append(dialog);let index=0,previousFocus=null;
function render(){const s=steps[index];progress.textContent='操作導覽 '+(index+1)+' / '+steps.length;number.textContent=String(index+1).padStart(2,'0');title.textContent=s.title;where.textContent=s.where;where.className='place'+(index===4?' pi':'');list.replaceChildren();for(const text of s.items)list.append(make('li',text));example.textContent=typeof s.example==='function'?s.example():s.example;tip.textContent=s.tip;groupLabel.hidden=index!==1;entries.hidden=index!==steps.length-1;back.disabled=index===0;next.hidden=index===steps.length-1;dots.replaceChildren();for(let i=0;i<steps.length;i++)dots.append(make('span',undefined,'guide-dot'+(i===index?' active':'')));inner.scrollTop=0;title.focus({preventScroll:true})}
function open(){previousFocus=document.activeElement;group.value=host();index=0;if(typeof dialog.showModal!=='function')return;dialog.showModal();render()}
function close(){try{localStorage.setItem(seenKey,'1')}catch{}dialog.close();previousFocus?.focus?.({preventScroll:true})}
group.onchange=()=>{$('group').value=group.value;example.textContent=steps[index].example()};
back.onclick=()=>{if(index>0){index--;render()}};next.onclick=()=>{if(index<steps.length-1){index++;render()}};skip.onclick=close;opener.onclick=open;
flash.onclick=()=>{close();$('openFlashHome').click()};ready.onclick=()=>{close();$('edit').click();$('setup').scrollIntoView({block:'start'});$('group').focus()};dialog.addEventListener('cancel',()=>{try{localStorage.setItem(seenKey,'1')}catch{}previousFocus?.focus?.({preventScroll:true})});try{if(localStorage.getItem(seenKey)!=='1')open()}catch{open()}
})();
