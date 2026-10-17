(()=>{
'use strict';
const step=(title,text,command=null,where='Pi')=>({title,text,command,where});
const lessons={
flash:{title:'刷機圖解',steps:PiFlashSettings.steps.map(s=>({...s,text:s.body.join('\n'),where:'Windows／Imager'}))},
ssh:{title:'SSH 連線',steps:[step('用本組 .local 登入','Windows 連本組熱點，Pi 插卡接電並完成開機。','ssh user@{host}.local','Windows PowerShell'),step('第一次連線與密碼','先請助教核對目標與指紋，確認後輸入 yes；出現 password 時輸入 123，按 Enter。輸入時看不到字是正常的。',null,'Windows PowerShell'),step('確認組別與帳號','登入後分別執行兩行。hostname 應為本組名稱，whoami 應為 user。','hostname\nwhoami'),step('確認 SSH 完成','學生自行確認組別與帳號正確後，再開始遠端桌面教學。')]},
desktop:{title:'遠端桌面',steps:[step('更新套件索引','先確認已登入本組 Pi，再執行指令，等完成才繼續。','sudo apt update'),step('安裝遠端桌面','在同一個 Pi SSH 視窗執行，等安裝完成。','sudo apt install -y xrdp xorgxrdp'),step('啟動服務','執行成功後，再設定 X11。','sudo systemctl enable --now xrdp'),step('設定 X11','先執行指令，再依鍵盤提示操作。','sudo raspi-config'),step('重新開機','先儲存成果。執行後連線中斷是正常的；保持熱點開啟，等待數分鐘。','sudo reboot'),step('測試桌面連線','回到 Windows PowerShell 執行，檢查 TcpTestSucceeded 是否為 True。','Test-NetConnection {host}.local -Port 3389','Windows PowerShell'),step('開啟 Windows 遠端桌面','確認目標是本組 Pi，再處理憑證提示。','mstsc /v:{host}.local','Windows PowerShell'),step('登入桌面','Session 選 Xorg，username 填 user，password 填 123；改過密碼就使用目前 Pi 密碼。',null,'Windows 遠端桌面'),step('確認桌面完成','看到本組 Pi 桌面後，由學生回報成功。下課前先儲存並正確關機。')]},
shutdown:{title:'正確關機',steps:[step('先儲存成果','儲存程式與作業。關閉遠端桌面視窗不等於關機。'),step('執行關機','在已登入的 Pi SSH 或桌面終端機執行；現在先不要拔電。','sudo shutdown -h now'),step('等關機完成再拔電','至少再等 30 秒。仍有活動就繼續等，不確定請助教確認；不要只看到斷線就拔電。')]}
};
// Each teacher slide opens the matching student operation, never a saved success page.
const studentSteps={ssh:['login','trust','verify','sshDone'],desktop:['aptUpdate','installXrdp','enableXrdp','x11','rebootPi','rdpTcp','rdpOpen','rdpLogin','desktopDone'],shutdown:['shutdownSave','shutdown','shutdownWait']};
for(const [id,nodes] of Object.entries(studentSteps))lessons[id].steps.forEach((item,i)=>item.studentStep=nodes[i]);
window.PiLessonCatalog=lessons;
})();
