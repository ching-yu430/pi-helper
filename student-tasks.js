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
 const instructions={
  login:['按 Windows 開始鍵，輸入 PowerShell，按一下開啟。','按下方綠色「複製指令」。切回 PowerShell，按 Ctrl + V，再按 Enter。','看執行後的畫面，選下方符合的那一個。'],
  password:['先點一下剛才的 PowerShell 視窗。','輸入樹莓派密碼。看不到文字或星號是正常的，不用重複輸入。','按 Enter，等畫面出現，再回網頁選結果。'],
  trust:['先請助教確認這是本組樹莓派。','確認後，點一下剛才的 PowerShell 視窗。','輸入 yes（小寫），按 Enter。'],
  verify:['留在剛才已登入樹莓派的 PowerShell 視窗。','先做第 1 行，看到結果後，按「換下一行」再做第 2 行。'],
  aptUpdate:['確認 PowerShell 裡看得到 '+user+'@'+host+'。','複製下方指令，切回這個視窗，按 Ctrl + V，再按 Enter。','如果詢問密碼，輸入目前樹莓派密碼。文字停止捲動後再看結果。'],
  installXrdp:['複製下方指令，貼到剛才已登入樹莓派的視窗，按 Enter。','等文字停止捲動，重新出現 '+user+'@'+host+'，再回來選結果。'],
  enableXrdp:['複製指令，貼到剛才已登入樹莓派的視窗，按 Enter。','沒有新文字也可能是正常的。看不到錯誤，再按下方成功選項。'],
  rdpTcp:['這一行要在 Windows 執行。看到 '+user+'@'+host+' 時，先輸入 exit，按 Enter。','看到 PS 開頭的位置後，複製下方指令、貼上，按 Enter。','找最後的 TcpTestSucceeded，看它是 True 還是 False。'],
  rdpOpen:['在 Windows PowerShell 貼上下方指令，按 Enter。','若跳出憑證警告，先核對是本組 '+host+'.local；不確定就找助教。','接著會出現樹莓派的登入視窗。'],
  rdpLogin:['Session 選 Xorg。','username 填 '+user+'。','password 填目前樹莓派密碼，按 OK。','看到樹莓派桌面後，才回網頁選成功。'],
  shutdown:['先把程式和作業存好。','在已登入本組樹莓派的視窗，執行下方指令。','斷線是正常的。先不要拔電，下一步還要等關機。']
 };
 const brief={login:'先在 Windows 開啟 PowerShell，再貼上這一行。',password:'現在只要輸入密碼，再按 Enter。',trust:'看到 yes/no 的問題時，照下面做。',verify:'確認連到的是自己的組別。',aptUpdate:'先更新工具清單。等它跑完再繼續。',installXrdp:'安裝遠端桌面需要的工具。',enableXrdp:'把遠端桌面服務打開。',rdpTcp:'回 Windows，檢查能不能連上遠端桌面。',rdpOpen:'在 Windows 開啟遠端桌面連線。',rdpLogin:'在跳出的視窗，照下面三個欄位填。',shutdown:'先存檔，再關機。現在不要拔電。'};
 Object.assign(brief,{localCheck:'先檢查手機熱點和組別，不要急著改 IP。',network:'先把本組手機熱點打開。筆電也要連同一個熱點。',tcp:'在 Windows 執行下方指令，找最後的 True 或 False。',tcpFalse:'連線測試沒有通過。再做一次登入，看看出現哪個錯誤。',refused:'畫面寫 Connection refused？先確認組別，再請助教檢查。',account:'帳號或密碼沒有通過。先確認帳號，再輸入一次密碼。',key:'這個警告先不要自己改。保留畫面，請助教確認。',syntax:'先按 Ctrl + C 取消，再重新複製下方完整指令。',client:'Windows 找不到 ssh。做完下方檢查，還是找不到就請助教幫忙。',stable:'連線突然中斷了。先確認剛才有沒有按重新開機或關機。',rdpService:'先登入本組樹莓派，再做下方兩行檢查。',apt:'先停下，保留紅字或錯誤畫面，再選下方符合的情況。',aptNet:'樹莓派下載不到工具。確認本組手機能上網，再試一次。',aptLock:'可能有另一個安裝還沒做完。先等它完成，不要刪除檔案。',black:'登入後是黑畫面？先保留視窗，請助教檢查。'});
 const windowHint=node.pi?'這個視窗要看得到 '+user+'@'+host+'。若只看到 PS，表示還沒登入樹莓派。':node.cmd?'這個視窗的輸入位置要以 PS 開頭。若看到 '+user+'@'+host+'，先輸入 exit，再按 Enter。':'';
 return {where,action:brief[id]||actions[id]||node.body,instructions:instructions[id]||[],windowHint,expected:expected[id]||'',mainCount:normal[id]};
}
window.PiStudentTasks={describe};
})();
