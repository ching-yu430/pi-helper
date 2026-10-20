(()=>{
'use strict';
const normal={login:3,password:1,trust:1,verify:1,sshDone:1,aptUpdate:1,installXrdp:1,enableXrdp:1,rebootPi:1,rdpTcp:1,rdpOpen:1,rdpLogin:1,desktopDone:2,finish:1,shutdownSave:1,shutdown:1,shutdownWait:1};
function describe(id,node,config){
 const host=config.group,user=config.user;
 const sameWindow=['password','trust','verify','account','apt','aptNet','aptLock','key','syntax','stable'].includes(id);
 const desktop=['rdpLogin','black','desktopDone'].includes(id);
 let where=node.pi?'筆電 → 已登入 '+host+' 的 SSH 視窗（看到 '+user+'@'+host+'）':node.cmd?'筆電 → Windows PowerShell（看到 PS … >）':sameWindow?'筆電 → 剛才輸入指令的同一個視窗':desktop?'筆電 → 遠端桌面連線視窗':'查看本組筆電、手機熱點與樹莓派';
 if(id==='shutdownSave')where='目前存放程式、作業的視窗';
 if(id==='shutdownWait')where='桌上的樹莓派；保持電源接著';
 const actions={
  login:'先按「複製指令」，切到 Windows PowerShell 貼上，再按 Enter。',
  password:'輸入樹莓派密碼，再按 Enter。輸入時不會出現文字或星號。',
  trust:'先請助教核對本組設備與金鑰指紋。確認相符後，在同一個視窗輸入 yes，再按 Enter。',
  verify:'先執行第 1 行 hostname，看到結果後，再執行第 2 行 whoami。',
  aptUpdate:'在本組 Pi 的 SSH 視窗貼上下方指令，按 Enter，等更新結束。',
  installXrdp:'在同一個 Pi SSH 視窗貼上指令，按 Enter，等安裝結束。',
  enableXrdp:'在同一個 Pi SSH 視窗貼上指令，再按 Enter。',
  x11:'先執行下方指令，再依圖片提示使用方向鍵與 Enter。',
  rebootPi:'先儲存成果，再執行下方指令。斷線後保持電源與熱點開啟，等 Pi 重新開機。',
  rdpTcp:'回到 Windows PowerShell。若看到 user@'+host+'，先輸入 exit 按 Enter；看到 PS … > 後，再貼上下方指令執行。',
  rdpOpen:'在 Windows PowerShell 貼上指令，再按 Enter。若有憑證警告，先核對是本組 Pi；不確定就請助教確認。',
  rdpLogin:'Session 選 Xorg，username 填 user，password 填 123，再按 OK。改過 Pi 密碼就填現在的密碼。',
  shutdown:'確認成果已儲存，再於本組 Pi 執行下方指令。現在不要拔電。',
  shutdownWait:'至少再等 30 秒。若仍有活動就繼續等，不確定請助教確認，現在先不要拔電。'
 };
 const expected={
  login:'出現第一次連線確認、密碼提示，或 '+user+'@'+host+' 的命令列。對照下方選項。',
  password:'出現 '+user+'@'+host+' 的命令列，表示已登入。',
  trust:'出現 password:，接著輸入樹莓派密碼。',
  verify:'第 1 行顯示 '+host+'；第 2 行顯示 '+user+'。',
  aptUpdate:'更新停止捲動，重新出現 '+user+'@'+host+' 的命令列，沒有錯誤。',
  installXrdp:'安裝停止捲動，重新出現命令列，沒有錯誤。',
  enableXrdp:'重新出現命令列，沒有服務啟動錯誤。',
  x11:'依序選完 Advanced Options → Wayland → X11，再依提示離開設定。',
  rebootPi:'SSH 連線中斷是正常的。能重新登入即可繼續；5 分鐘後仍連不上請找助教，不要反覆拔電。',
  rdpTcp:'最後的 TcpTestSucceeded 顯示 True。',
  rdpOpen:'出現有 Session、username、password 的登入畫面。',
  rdpLogin:'出現本組樹莓派的桌面。',
  shutdown:'SSH 或遠端桌面連線中斷；接著還要等關機完成。',
  shutdownWait:'已等候並確認關機完成；斷線本身不代表已完成關機。'
 };
 return {where,action:actions[id]||node.body,expected:expected[id]||'',mainCount:normal[id]};
}
window.PiStudentTasks={describe};
})();
