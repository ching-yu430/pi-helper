(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const steps=[
{title:"準備電腦、讀卡機與 microSD 卡",body:["先備份 SD 卡中需要保留的資料；寫入會清除整張卡。", "Pi 先不要接電。將 microSD 卡插入讀卡機，再接到 Windows 電腦。", "下載並開啟 Raspberry Pi Imager。"],picture:'devices',rows:[],download:true},
{title:"選擇 Raspberry Pi 5",body:["在 Device／裝置頁選擇「本組實際設定」的型號，再按 Next。"],rows:[['Device／裝置','Raspberry Pi 5'],['本課程設備','所有組別都使用 Pi 5']],highlight:0},
{title:"選擇 64 位元桌面系統",body:["在 OS／作業系統頁選擇「本組實際設定」的系統。若助教指定版本，請使用指定版本。", "確認包含桌面環境，再按 Next；後續遠端桌面課程不能使用 Lite。"],rows:[['OS／作業系統','Raspberry Pi OS (64-bit)'],['版本類型','有桌面（Desktop）'],['不要選','Raspberry Pi OS Lite']],highlight:1},
{title:"選擇本組 microSD 卡",body:["在 Storage／儲存裝置頁，依名稱與容量選取本組 microSD 卡。", "不確定是哪個磁碟時先停止，請助教協助。"],rows:[['Storage／儲存裝置','你的 microSD 卡'],['核對項目','容量 ＋ 裝置名稱'],['寫入影響','清除這張卡的所有資料']],highlight:0},
{title:"填寫本組主機名稱",body:["進入 Customisation → Hostname，填入「本組實際設定」的主機名稱，再按 Next。", "只填 pi5-XX；連線時才加 .local。"],rows:[['Hostname／主機名稱','{host}'],['刷機時填','{host}'],['連線時才使用','{host}.local']],highlight:0,host:true},
{title:"設定地區與時區",body:["進入 Localisation，依「本組實際設定」選擇城市、國家與時區。", "按 Next 繼續；不要按 Skip customisation。"],rows:[['國家／無線地區','TW / Taiwan'],['城市（若有）','Taipei'],['時區','Asia/Taipei']],highlight:0},
{title:"建立課堂帳號",body:["進入 User／使用者頁，填入「本組實際設定」的帳號與密碼。", "確認密碼再輸入一次相同內容，然後按 Next。"],rows:[['Username／使用者','user'],['Password／課堂密碼','123'],['確認密碼（若有）','再次輸入相同密碼']],highlight:0},
{title:"設定本組手機熱點",body:["開啟本組手機熱點，在 Wi-Fi 頁選 Secure network。", "依「本組實際設定」欄位填入手機上顯示的熱點名稱與密碼，再按 Next。", "核對大小寫與空格；Wi-Fi 密碼使用手機熱點密碼，不是 Pi 密碼 123。"],rows:[['SSID／網路名稱','本組手機熱點的實際名稱'],['Wi-Fi 密碼','與本組手機熱點完全相同'],['Windows 也要連','同一個手機熱點']],highlight:0},
{title:"開啟 SSH 與密碼驗證",body:["進入 Remote access／SSH authentication。", "將 Enable SSH 切換為開啟，選擇「本組實際設定」的驗證方式，再按 Next。"],rows:[['Enable SSH／啟用 SSH','開啟 ✓'],['驗證方式','Use password authentication'],['登入帳號','使用剛才建立的 user']],highlight:1},
{title:"繼續至寫入摘要",body:["Raspberry Pi Connect 頁直接按 Next。", "繼續至 Writing／寫入頁的 Summary 摘要。"],image:'connect-subtab.png',rows:[]},
{title:"核對設定並開始寫入",body:["核對摘要中的裝置、系統與 SD 卡，以及本組主機名稱、帳號、熱點、地區與 SSH 設定。", "確認正確後按 Write。"],image:'write.png',rows:[]},
{title:"確認清除 SD 卡",body:["再次核對警告中的磁碟名稱與容量，確認是本組 microSD 卡。", "若還有資料要保留，按 Cancel 並先備份。", "確認可以清除後，按 I understand, erase and write；若系統詢問寫入權限，確認是 Imager 後允許。"],image:'are-you-sure.png',rows:[]},
{title:"等待寫入與驗證完成",body:["保持讀卡機連接，等待 Writing 與 Verifying 都成功完成；不要略過驗證。", "若出現錯誤，先記錄完整訊息並請助教協助。", "出現 Done 後按 Finish，安全退出 SD 卡再取出。"],rows:[['Writing／寫入','完成'],['Verifying／驗證','成功完成'],['Done／完成','Finish，再安全退出']],highlight:1},
{title:"插卡開機，準備 SSH 連線",body:["開啟本組手機熱點，Windows 電腦連上同一熱點。", "Pi 未供電時插入 SD 卡，再接上適用的電源。", "首次開機需等候數分鐘，期間不要反覆斷電。", "開機後使用本組主機名稱連線；學生頁可按下方按鈕開始 SSH。"],picture:'network',rows:[]}
];
const flashImages={1:'device-tab.png',2:'os-tab.png',3:'storage-tab.png',4:'hostname-subtab.png',5:'localisation-subtab.png',6:'user-subtab.png',7:'wifi-subtab.png',8:'ssh-subtab.png'};for(const [i,file] of Object.entries(flashImages))steps[Number(i)].image=file;
const values={"1": [["Device／裝置", "Raspberry Pi 5"]], "2": [["OS／作業系統", "Raspberry Pi OS（64-bit）桌面版"]], "3": [["Storage／儲存裝置", "本組 microSD 卡（核對名稱與容量）"]], "4": [["Hostname／主機名稱", "{host}"]], "5": [["城市／國家", "Taipei（Taiwan）／TW"], ["Time zone／時區", "Asia/Taipei"]], "6": [["Username／使用者", "user"], ["Password／密碼", "123"], ["Confirm password／確認密碼", "123"]], "7": [["SSID／熱點名稱", "本組手機的熱點名稱"], ["Password／熱點密碼", "本組手機的熱點密碼"], ["Confirm password／確認密碼", "再次輸入相同熱點密碼"]], "8": [["Enable SSH", "開啟（ON）"], ["驗證方式", "Use password authentication／使用密碼驗證"]]};
function build(indices,hostname){const host=String(hostname).replace(/\.local$/,'');const rows=(Array.isArray(indices)?indices:[indices]).flatMap(i=>values[i]||[]);if(!rows.length)return null;
const box=make('section',undefined,'flash-settings');box.setAttribute('aria-label','本組實際設定');box.append(make('strong','本組實際設定｜請照這裡填，不要照抄圖片','flash-settings-title'));const dl=make('dl');for(const [label,value] of rows)dl.append(make('dt',label),make('dd',value.replace('{host}',host)));box.append(dl);return box}
function renderGuide(container,hostname){container.replaceChildren();steps.forEach((step,i)=>{const detail=make('details',undefined,'flash-step'),summary=make('summary');summary.append(make('span',String(i+1).padStart(2,'0')),document.createTextNode(' '+step.title));detail.open=i===0;detail.append(summary);if(step.image){const image=make('img');image.src='assets/imager/'+step.image;image.alt=step.title+'：Imager 介面範例';image.loading='lazy';detail.append(image)}const settings=build(i,hostname);if(settings)detail.append(settings);const list=make('ol');for(const text of step.body)list.append(make('li',text));detail.append(list);if(step.download){const link=make('a','下載 Raspberry Pi Imager ↗');link.href='https://www.raspberrypi.com/software/';link.target='_blank';link.rel='noopener';detail.append(link)}if(i===13)detail.append(make('pre','ssh user@'+String(hostname).replace(/\.local$/,'')+'.local'));container.append(detail)})}
window.PiFlashSettings={build,steps,renderGuide};
})();
