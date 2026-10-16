(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function build(indices,hostname){const host=String(hostname).replace(/\.local$/,'');const values={
0:[['寫入前','先備份 microSD 卡內成果']],1:[['Device／裝置','Raspberry Pi 5']],2:[['OS／系統','Raspberry Pi OS（64-bit）有桌面版'],['不要選','Lite（沒有桌面）']],3:[['Storage／儲存裝置','本組 microSD 卡的實際名稱與容量；不要照抄圖片磁碟']],
4:[['Hostname／主機名稱',host],['這個欄位不填','.local、user 或圖片中的 Jay']],5:[['城市／國家','Taipei（Taiwan）／TW'],['Time zone／時區','Asia/Taipei'],['鍵盤配置','依實際鍵盤；不要照抄圖片的地區設定']],
6:[['Username／使用者','user'],['Password／課堂密碼','123'],['Confirm password','再次輸入 123']],7:[['SSID／Wi-Fi 名稱','本組手機上顯示的熱點名稱'],['Wi-Fi 密碼／確認密碼','本組手機的實際熱點密碼；不是 Pi 密碼 123'],['Hidden SSID','一般可見熱點不要勾選']],
8:[['Enable SSH','開啟（ON）'],['驗證方式','Use password authentication／使用密碼驗證']],9:[['Raspberry Pi Connect','關閉（OFF）；本課程不需要']],
10:[['Device／OS','Pi 5／64-bit 有桌面版'],['本組 Hostname',host],['帳號／課堂密碼','user／123'],['Wi-Fi／地區','本組熱點、TW、Asia/Taipei'],['SSH','已開啟、使用密碼驗證'],['Storage','再次核對本組 microSD 卡']],
11:[['要清除的裝置','本組 microSD 卡，名稱與容量須再次確認']],12:[['完成條件','Writing 與 Verifying 均成功，再安全退出']],13:[['兩台裝置的網路','Windows 與 Pi 都連本組熱點'],['Windows SSH 指令','ssh user@'+host+'.local']]};
const box=make('section',undefined,'flash-settings');box.setAttribute('aria-label','本組實際設定');box.append(make('strong','本組實際設定｜請照這裡填，不要照抄圖片','flash-settings-title'));const dl=make('dl');for(const i of Array.isArray(indices)?indices:[indices])for(const [label,value] of values[i]||[]){dl.append(make('dt',label),make('dd',value))}box.append(dl,make('p','圖片只用來找欄位。圖片中的帳號、地區、Wi-Fi、主機名稱與磁碟都是示例，請改成本組設定。','flash-picture-warning'));return box}
window.PiFlashSettings={build};
})();
