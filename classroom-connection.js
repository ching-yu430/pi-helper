(()=>{
'use strict';
const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node};
const prefix='連回本組樹莓派';
const steps=[
 {title:'先打開本組熱點與樹莓派',place:'手機、樹莓派、Windows 筆電',action:'本組三個設備都準備好，再往下。',items:['手機：開啟本組熱點。','樹莓派：接上電源，保持熱點開啟，等它開機。','Windows 筆電：連上同一組的手機熱點。'],tip:'筆電能上網，仍不代表連到了本組熱點。請看清楚 Wi-Fi 名稱。',next:'都準備好了 →'},
 {title:'在 Windows 按 Win + R',place:'Windows 筆電',action:'按住鍵盤的 Windows 鍵，再按 R。',keys:true,tip:'要看到標題為「執行」的小視窗。已在樹莓派視窗裡，先按上方連線列的「－」回 Windows。',next:'看到「執行」視窗了 →'},
 {title:'貼上本組連線指令',place:'Windows｜執行視窗',action:'把這一行貼到「開啟」欄位，按 Enter。',command:true,tip:'請在 Windows 筆電開這個網頁，再按複製。手機複製的內容不會自動傳到筆電。',next:'已按 Enter →'},
 {title:'確認連線目標',place:'Windows｜遠端桌面連線',action:'確認要連的是本組樹莓派。',target:true,tip:'若出現憑證／身分提示，先核對是本組目標，再按「是」或「連線」。出現別組名稱或看不懂就找助教。',next:'看到登入畫面了 →'},
 {title:'登入樹莓派',place:'遠端桌面｜登入畫面',action:'在遠端桌面的登入畫面填這三格。',login:true,tip:'帳號是 user；主機名稱不是帳號。密碼使用樹莓派密碼，與 Windows、熱點、後台密碼分開。',next:'已看到樹莓派桌面 →'},
 {title:'開啟樹莓派的終端機',place:'樹莓派桌面',action:'按樹莓派桌面左上方的黑色「>_」圖示。',terminal:true,tip:'找不到圖示：樹莓派選單 → 附屬應用程式（Accessories）→ 終端機（Terminal）。更新過課堂工具，要用新開的終端機。',next:'看到本組命令列，開始上課 →'}
];
function create(root,{onReady,onChange,onHelp}={}){
 let host='',index=0;
 const heading=make('h2'),progress=make('p',undefined,'connection-progress'),place=make('p',undefined,'place'),action=make('p',undefined,'connection-action'),content=make('div'),tip=make('p',undefined,'connection-tip'),trouble=make('details',undefined,'connection-trouble'),troubleBody=make('div'),controls=make('nav',undefined,'connection-navigation'),back=make('button','← 上一步'),next=make('button',undefined,'primary'),already=make('button','我已經在樹莓派桌面','connection-already'),help=make('button','請助教幫忙','request-teacher-help');
 root.classList.add('connection-guide');root.setAttribute('aria-labelledby','connectionTitle');heading.id='connectionTitle';heading.tabIndex=-1;progress.id='connectionProgress';progress.setAttribute('role','status');content.id='connectionContent';tip.id='connectionTip';back.id='connectionBack';next.id='connectionNext';already.id='connectionAlready';help.id='connectionAsk';for(const b of [back,next,already,help])b.type='button';controls.setAttribute('aria-label','連線教學上下步');controls.append(back,next);trouble.append(make('summary','畫面不一樣／連不上？'),troubleBody);const card=make('section',undefined,'lesson-card connection-card');card.append(progress,heading,place,action,content,tip,trouble,controls,already);root.append(card,help);
 function troubles(){
  troubleBody.replaceChildren();
  const lines=index===0?['Pi 和筆電要連同一組的手機熱點。教室 Wi-Fi 或別組熱點不能代替。','等不到 Pi 開機時，保持供電，請助教查看；不要一直重拔電。']:index===1?['請找鍵盤上有 Windows 標誌的按鍵，不是按網頁裡的文字。','若是 Mac 或 Linux 筆電，請找助教確認連線工具；本課使用 Windows。']:index===2?['按 Enter 後變成搜尋網頁：你貼到了瀏覽器。回到 Windows，再按 Win + R。','已手動開啟「遠端桌面連線」：電腦欄位填 '+host+'.local，不要加 ssh、http:// 或 user@。']:index===3?['顯示找不到電腦／無法連線：先核對本組熱點、Pi 電源與主機名稱。','仍連不上，請助教確認本組 IP。不要猜 IP，也不用重刷或重裝 xrdp。','已看到 xrdp 登入畫面：可以直接按下一步。']:index===4?['若看到 Windows「安全性／認證」視窗，選「使用其他帳戶」，輸入 user 與樹莓派密碼。','Xorg 是登入畫面內的 Session 選項，請用滑鼠選。','密碼輸入時會被遮住，照常輸入即可；登入失敗先核對英文、大小寫及目前 Pi 密碼。','黑畫面、藍畫面或很久沒進桌面：保留畫面找助教，不要反覆拔電。']:['若看到 PS C:\\… >，那是 Windows PowerShell；請回到遠端桌面開樹莓派終端機。','若看到 Python 的 >>>，請開另一個樹莓派終端機，先不要把課程指令貼在這裡。','只看到 Windows 桌面？請從工作列切回本組的遠端桌面視窗。','後續貼指令：先點終端機，按 Ctrl + Shift + V，再按 Enter；一次只做一行。'];
  const list=make('ul');for(const text of lines)list.append(make('li',text));troubleBody.append(list);
  if(index===3){const link=make('a','查看首頁連線排查');const url=new URL('index.html#connectionHelp',location.href);url.searchParams.set('group',host);link.href=url.href;link.target='_blank';link.rel='noopener';troubleBody.append(link)}
 }
 function render(focus=false){
  const step=steps[index];root.dataset.step=String(index);progress.textContent='課前連線 '+(index+1)+' / '+steps.length+' · 第 '+Number(host.slice(-2))+' 組';heading.textContent=step.title;place.textContent=step.place;action.textContent=step.action;tip.textContent=step.tip;next.textContent=step.next;back.disabled=index===0;already.hidden=index!==0;trouble.open=false;content.replaceChildren();
  if(step.items){const list=make('ol',undefined,'connection-checklist');for(const text of step.items)list.append(make('li',text));content.append(list)}
  if(step.keys){const keys=make('p',undefined,'connection-keys');keys.append(make('kbd','⊞ Win'),document.createTextNode(' ＋ '),make('kbd','R'));content.append(keys,make('p','這一步是在 Windows 筆電操作。','connection-target'))}
  if(step.command){const command='mstsc /v:'+host+'.local',row=make('div',undefined,'camera-copy-row'),pre=make('pre',command),button=make('button','複製連線指令','command-copy'),feedback=make('p',undefined,'camera-copy-feedback');button.id='copyConnectionCommand';feedback.setAttribute('role','status');PiCommandSteps.bindCopy(button,command,{source:pre,status:feedback,success:'已複製。回「執行」視窗，按 Ctrl + V，再按 Enter。'});row.append(pre,button);content.append(row,feedback)}
  if(step.target)content.append(make('p',host+'.local','connection-target'),make('p','沒有跳出提示也正常，繼續到登入畫面。','muted'));
  if(step.login){const values=make('dl',undefined,'connection-values');for(const [label,value] of [['Session／工作階段','Xorg'],['Username／帳號','user'],['Password／密碼','樹莓派課堂密碼：123（老師改過就用新密碼）']])values.append(make('dt',label),make('dd',value));content.append(values,make('p','填完後按遠端桌面視窗裡的「OK／登入／Continue」。','connection-target'))}
  if(step.terminal){content.append(make('p','在樹莓派桌面按黑色 >_ 圖示','connection-target'),make('pre','user@'+host+':~ $'),make('p','上面是你要認出的命令列，不用輸入。看到本組名稱才開始貼課程指令。','muted'))}
  troubles();onChange?.(prefix+'｜'+(index+1)+'. '+step.title);if(focus){root.scrollIntoView({block:'start'});heading.focus({preventScroll:true})}
 }
 back.onclick=()=>{if(index>0){index--;render(true)}};
 next.onclick=()=>{if(index<steps.length-1){index++;render(true)}else finish()};
 function finish(){root.hidden=true;onReady?.()}
 already.onclick=()=>{index=5;render(true)};
 help.onclick=()=>onHelp?.(prefix+'｜'+(index+1)+'. '+steps[index].title);
 return {show(group,initialStep=0){if(!/^pi5-(?:0[1-9]|[1-9][0-9])$/.test(group))throw Error('請先選自己的組別。');host=group;index=Number.isInteger(initialStep)&&initialStep>=0&&initialStep<steps.length?initialStep:0;root.hidden=false;render(true)},hide(){root.hidden=true},get step(){return prefix+'｜'+(index+1)+'. '+steps[index].title}};
}
window.PiClassroomConnection={create,prefix};
})();
