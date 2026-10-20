(()=>{
'use strict';
const step=(title,text,command=null,where='Pi')=>({title,text,command,where});
const lessons={
flash:{title:'刷機圖解',steps:PiFlashSettings.steps.map(s=>({...s,text:s.body.join('\n'),where:'Windows／Imager'}))},
ssh:{title:'SSH 連線',steps:[step('用本組 .local 登入','Windows 連本組熱點，Pi 插卡接電並完成開機。','ssh user@{host}.local','Windows PowerShell'),step('第一次連線與密碼','先請助教核對目標與指紋，確認後輸入 yes；出現 password 時輸入 123，按 Enter。輸入時看不到字是正常的。',null,'Windows PowerShell'),step('確認組別與帳號','登入後先複製第 1 行、貼上並按 Enter，看到結果再執行第 2 行。hostname 應為本組名稱，whoami 應為 user。','hostname\nwhoami'),step('確認 SSH 完成','學生自行確認組別與帳號正確後，再開始遠端桌面教學。')]},
desktop:{title:'遠端桌面',steps:[step('更新套件索引','先確認已登入本組 Pi，再執行指令，等完成才繼續。','sudo apt update'),step('安裝遠端桌面','在同一個 Pi SSH 視窗執行，等安裝完成。','sudo apt install -y xrdp xorgxrdp'),step('啟動服務','執行成功後，再設定 X11。','sudo systemctl enable --now xrdp'),step('設定 X11','先執行指令，再依鍵盤提示操作。','sudo raspi-config'),step('重新開機','先儲存成果。執行後連線中斷是正常的；保持供電與熱點開啟，再試本組 .local；能登入即可繼續，不必等滿 5 分鐘。5 分鐘後仍連不上請找助教，不要反覆拔電。','sudo reboot'),step('測試桌面連線','回到 Windows PowerShell 執行，檢查 TcpTestSucceeded 是否為 True。','Test-NetConnection {host}.local -Port 3389','Windows PowerShell'),step('開啟 Windows 遠端桌面','確認目標是本組 Pi，再處理憑證提示。','mstsc /v:{host}.local','Windows PowerShell'),step('登入桌面','Session 選 Xorg，username 填 user，password 填 123；改過密碼就使用目前 Pi 密碼。',null,'Windows 遠端桌面'),step('確認桌面完成','看到本組 Pi 桌面後，由學生回報成功。下課前先儲存並正確關機。')]},
shutdown:{title:'正確關機',steps:[step('先儲存成果','儲存程式與作業。關閉遠端桌面視窗不等於關機。'),step('執行關機','在已登入的 Pi SSH 或桌面終端機執行；現在先不要拔電。','sudo shutdown -h now'),step('等關機完成再拔電','至少再等 30 秒。仍有活動就繼續等，不確定請助教確認；不要只看到斷線就拔電。')]}
};
// Each teacher slide opens the matching student operation, never a saved success page.
const studentSteps={ssh:['login','trust','verify','sshDone'],desktop:['aptUpdate','installXrdp','enableXrdp','x11','rebootPi','rdpTcp','rdpOpen','rdpLogin','desktopDone'],shutdown:['shutdownSave','shutdown','shutdownWait']};
for(const [id,nodes] of Object.entries(studentSteps))lessons[id].steps.forEach((item,i)=>item.studentStep=nodes[i]);
const teaching={
 ssh:{short:['登入','信任與密碼','核對組別','確認完成'],expected:['出現首次連線確認、密碼提示，或本組 Pi 的命令列。','輸入密碼後，出現 user@本組主機名稱的命令列。','hostname 是本組主機名稱，whoami 是 user。','學生核對正確後，自行確認 SSH 完成。']},
 desktop:{short:['更新','安裝','啟動服務','X11','重開機','測試連線','開啟桌面','登入','確認完成'],expected:['更新結束，回到 Pi 的命令列，沒有錯誤。','安裝結束，回到命令列，沒有錯誤。','指令完成，沒有服務啟動錯誤。','依序選完 Advanced Options、Wayland、X11，並離開設定。','SSH 連線中斷，等候 Pi 重新開機。','TcpTestSucceeded 顯示 True。','出現本組 Pi 的 xrdp 登入畫面。','成功進入本組 Pi 的桌面。','學生看到實際桌面後，自行確認完成。']},
 shutdown:{short:['儲存','執行關機','等候再拔電'],expected:['程式與作業已儲存。','SSH 或遠端桌面連線中斷；現在先不要拔電。','至少再等 30 秒並確認關機完成；不確定請助教看。']}
};
const flashExpected=['卡內資料已備份，Imager 已開啟。','裝置是 Raspberry Pi 5。','系統是 Raspberry Pi OS（64-bit）桌面版。','已核對本組 SD 卡的名稱與容量。','主機名稱是本組 pi5-XX，沒有加 .local。','國家為 TW，時區為 Asia/Taipei。','帳號 user，密碼與確認密碼一致。','熱點名稱與密碼和本組手機完全相同。','SSH 已開啟，選擇密碼驗證。','進入寫入摘要。','摘要內容正確，準備寫入本組 SD 卡。','確認清除的是本組 SD 卡，開始寫入。','Writing 與 Verifying 都成功完成。','Pi 插卡供電，Windows 連同組熱點，等候開機。'];
for(const [id,lesson] of Object.entries(lessons))lesson.steps.forEach((item,i)=>{
 item.short=teaching[id]?.short[i]||String(i+1)+'. '+item.title;
 item.action=id==='flash'?item.body[0]:item.text.split('。')[0]+'。';
 item.expected=id==='flash'?flashExpected[i]:teaching[id].expected[i];
});
lessons.flash.steps[13].where='手機、Windows 與桌上的 Pi';
lessons.ssh.steps[3].where='核對本組登入結果';lessons.desktop.steps[8].where='Windows 遠端桌面';
lessons.shutdown.steps[0].where='Pi 桌面或目前操作的視窗';lessons.shutdown.steps[2].where='桌上的樹莓派';
if(window.PiCameraCourse)lessons.camera={title:'Python 與 USB 拍照',steps:PiCameraCourse.stages.map((s,i)=>({title:s.title,text:s.action+'\n'+s.notes.join('\n'),action:s.action,expected:s.expected,where:s.where||'樹莓派遠端桌面 → 終端機',short:String(i+1)+'. '+s.title,command:null,cameraIndex:i}))};
window.PiLessonCatalog=lessons;
})();
