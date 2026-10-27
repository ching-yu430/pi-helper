(()=>{
'use strict';
const runner='~/pi-course ',where='樹莓派遠端桌面 → 終端機';
const stages=[
 {id:'location',title:'確認現在操作的是本組 Pi',action:'在樹莓派遠端桌面開啟終端機。一次執行一行，確認本組名稱與目前目錄。',commands:['hostname','pwd',runner+'location'],expected:'hostname 是 {host}。課程工具會回報執行當下的位置。',tasks:['location'],notes:['Windows PowerShell 用來連線；這堂課的 Python 與相機程式都在 Pi 執行。','「檢查通過」只確認設備與執行位置，仍要知道自己正在操作哪個視窗。']},
 {id:'folders',title:'建立並找到課程資料夾',action:'先用 pwd、ls 看目前位置，再依序建立課程與照片資料夾。資料夾已存在時不用刪除，直接進入。',commands:['pwd','ls','mkdir -p ~/pi-camera/photos','cd ~/pi-camera','pwd','ls',runner+'folders'],expected:'目前位置是 /home/user/pi-camera，裡面有 photos 資料夾。',tasks:['folders'],notes:['mkdir 建立資料夾；cd 進入資料夾；pwd 顯示目前位置；ls 列出內容。','檢查工具只確認資料夾存在且能寫入，不會替你完成建立練習。']},
 {id:'hello',title:'親手寫第一個 Python 程式',action:'在 Pi 的文字編輯器新增檔案，親手輸入下方程式，存成 /home/user/pi-camera/hello.py，再回終端機執行。',code:'print("第 {group} 組")',commands:[runner+'hello'],expected:'終端機出現「第 {group} 組」，網站收到本次執行成功的結果。',tasks:['hello'],notes:['用 Pi 的文字編輯器即可；找不到編輯器時請助教協助。不要把程式碼當作終端機指令。','改一次文字、儲存後再執行，觀察輸出。請保留本組「第 {group} 組」，供檢查工具核對。','一般 Python 啟動方式是 /usr/bin/python3 ~/pi-camera/hello.py；下方課程工具使用同一個 Python，另外回報本次結果。']},
 {id:'write',title:'用 Python 產生一個文字檔',action:'在 Pi 的文字編輯器新增下方程式，存成 /home/user/pi-camera/write_note.py。儲存後執行，再開啟產生的 message.txt。',code:'from pathlib import Path\n\nfolder = Path.home() / "pi-camera"\nfile = folder / "message.txt"\nfile.write_text("第 {group} 組的第一個文字檔\\n", encoding="utf-8")\nprint(file)',commands:[runner+'write'],expected:'pi-camera 裡出現 message.txt，開啟後能看到本組文字。',tasks:['write'],notes:['檢查會確認本次執行真的寫入檔案；只有之前留下的檔案不算本次通過。','找不到檔案時，先看程式印出的路徑。']},
 {id:'environment',title:'安裝 OpenCV 並確認 USB 相機',action:'把 USB 相機接到 Pi 的 USB 孔。依序執行更新、安裝與環境檢查；上一行結束後才做下一行。',commands:[runner+'update',runner+'install',runner+'environment'],expected:'系統 Python 能載入 OpenCV 與介面套件，v4l2 工具找到支援取像的 USB 裝置。',tasks:['environment'],notes:['更新與安裝會詢問 sudo 密碼，使用目前 Pi 密碼；輸入時不顯示文字。','安裝的是 v4l-utils、python3-opencv、python3-tk。暫不使用 pip、虛擬環境或辨識套件。','測試機已確認 /dev/video0 可取像；正式程式仍會列出可用裝置，不把節點編號當成固定規格。']},
 {id:'camera',title:'預覽、拍照並正常結束',action:'先取得統一拍照程式，再啟動。確認預覽後按「拍照」，打開存檔檢查，最後按「結束」。',commands:[runner+'camera-install',runner+'camera'],expected:'成功預覽、儲存本次 1920×1080 照片，最後正常結束並釋放相機。',tasks:['camera','photo','camera_exit'],notes:['滑鼠按鈕可直接操作，也可點預覽視窗後用英文 S 拍照、Q 結束。','維持 1280×720 預覽，拍照時重新開啟相機取 1920×1080。持續 1080P 方案尚未採用。','若終端機出現 Corrupt JPEG data，保留訊息並檢查照片；有存檔不代表畫面品質一定正常。','正式介面及相依套件仍需老師在 Pi 5 與遠端桌面驗收後，才開放學生使用。'],download:'courseware/camera_app.py'},
 {id:'quality',title:'檢查照片並整理練習資料',action:'用 Pi 的檔案管理員打開 pi-camera/photos，逐張確認清楚、曝光正常、物品完整，再整理需要保留的照片。',commands:[],expected:'選出的照片能開啟，物品清楚、未截斷；目前使用「練習拍照」，正式物料分類之後公布。',tasks:['photo'],manual:'我已開啟本次照片，確認物品清楚、完整，並整理好要保留的照片。',notes:['照片儲存在 Pi，不是 Windows。檔案可讀與尺寸正確只屬技術檢查，照片品質仍需親眼確認。','手機參考照片不算本次 USB 相機成果。保留不同拍攝批次，之後依老師規則分配資料。']},
 {id:'download',title:'把照片下載到 Windows',where:'Windows 筆電 → PowerShell',action:'回到 Windows PowerShell（看到 PS … >），執行本組下載指令，輸入 Pi 密碼。完成後到下載資料夾開啟照片。',commands:['scp -r user@{host}.local:/home/user/pi-camera/photos "$HOME\\Downloads\\pi-camera-photos"'],expected:'Windows 下載資料夾中能找到本組照片，且照片能正常開啟。',tasks:[],manual:'我已在 Windows 找到下載的照片，並成功開啟確認。',notes:['這一段尚待 Windows 實機驗收；重複下載時留意資料夾層級與同名檔案。','Pi 無法直接證明 Windows 已下載並開啟照片，因此這一步記為學生自行確認。','.local 排查仍失敗時，再請助教確認 IP；不要直接改填不明位址。']}
];
// Keep stage titles stable for saved progress and teacher links; student actions are short.
const help={
 location:{action:'先開啟樹莓派的終端機，再照下方指令一行一行做。',actions:['把遠端桌面視窗切到最前面。','在樹莓派左上角選單找「終端機／Terminal」，按一下開啟。','找到終端機後，就照下面的綠色複製按鈕操作。'],expected:'第一行要顯示 {host}。顯示別組名稱就停下，按「請助教幫忙」。',results:['顯示 {host}；別組名稱就先停下。','顯示 /home/user，或本組 pi-camera 資料夾的位置。','顯示「本次操作完成」，再回網頁按「更新結果」。']},
 folders:{action:'現在要做一個放程式和照片的資料夾。',actions:['留在剛才的樹莓派終端機。','照下方順序做，一行結束後再換下一行。'],expected:'畫面顯示 /home/user/pi-camera，並看得到 photos。',results:['看目前在哪個資料夾。','顯示這個資料夾裡的東西；沒有東西也可能是正常的。','通常沒有新文字，又出現可以輸入的位置。資料夾已經建立。','通常沒有新文字，又出現可以輸入的位置。你已進入 pi-camera。','顯示 /home/user/pi-camera。','看得到 photos 這個名稱。','顯示「本次操作完成」，再回網頁按「更新結果」。']},
 hello:{where:'樹莓派桌面 → 文字編輯器，寫好後再回終端機',action:'先寫一個會顯示本組名稱的小程式。',actions:['在樹莓派左上角選單找「文字編輯器／Text Editor」，新增空白檔案。','親手輸入下面的程式。注意引號和括號。','按 Ctrl + Shift + S，將檔案存成 /home/user/pi-camera/hello.py。','存好後，切回樹莓派終端機，再執行下方綠色按鈕的指令。'],expected:'終端機顯示「第 {group} 組」。改過程式後，要先儲存，再執行一次。',results:['顯示「第 {group} 組」和「本次操作完成」。']},
 write:{where:'樹莓派桌面 → 文字編輯器，寫好後再回終端機',action:'這次讓 Python 幫你做一個文字檔。',actions:['在樹莓派的文字編輯器新增空白檔案。','親手輸入下面的程式，存成 /home/user/pi-camera/write_note.py。','存好後，回樹莓派終端機，執行下方指令。','執行完成後，用樹莓派的檔案管理員開啟 pi-camera 裡的 message.txt。'],expected:'message.txt 裡有「第 {group} 組的第一個文字檔」。',results:['顯示 message.txt 的位置和「本次操作完成」。接著去開啟這個檔案。']},
 environment:{action:'把相機接到樹莓派，再安裝拍照需要的工具。',actions:['把 USB 相機插進樹莓派的 USB 孔，不要插在 Windows 筆電。','留在樹莓派終端機，執行下方指令。','如果詢問密碼，輸入樹莓派密碼，再按 Enter；沒有文字或星號是正常的。','安裝時等它跑完，不要重複按 Enter，也不要拔電。'],expected:'最後顯示 OpenCV 版本與可用相機。看不到相機就按「請助教幫忙」。',results:['文字停止捲動，出現「本次操作完成」。才換下一行。','安裝可能要等一段時間。出現「本次操作完成」才換下一行。','顯示 OpenCV 和 /dev/video… 等相機名稱，再回網頁更新結果。']},
 camera:{action:'先開拍照程式，再用滑鼠拍一張照片。',actions:['先執行下方第 1 行，看到完成後，再執行第 2 行。','拍照視窗開啟後，確認裡面看得到相機畫面。','把物品放好，用滑鼠按「拍照」。先不用記快捷鍵。','看到「照片已儲存」後，按「結束」，再回網頁看結果。'],expected:'網頁顯示照片尺寸為 1920×1080，並收到正常結束的結果。',results:['顯示統一拍照程式已放入 pi-camera。','開啟拍照視窗。用滑鼠拍照，完成後按「結束」。']},
 quality:{where:'樹莓派桌面 → 檔案管理員',action:'打開剛才拍的照片，用眼睛確認。',actions:['在樹莓派開啟檔案管理員。','打開 pi-camera，再打開 photos。','點兩下照片，確認物品清楚、完整，而且不會太亮或太暗。','確認後，勾選下方的照片確認欄。'],expected:'你能清楚看見整個物品。模糊或缺角就回上一階段重拍。',manual:'我已開啟本次照片，確認物品清楚、完整。'},
 download:{where:'Windows 筆電 → PowerShell；不是樹莓派終端機',action:'最後把照片搬到 Windows 筆電。',actions:['先把遠端桌面視窗縮小。這一步在 Windows 做。','按 Windows 開始鍵，輸入 PowerShell，按一下開啟。','看到 PS 開頭的輸入位置後，貼上下方指令並按 Enter。','輸入樹莓派密碼；輸入時沒有文字是正常的。','下載完後，在 Windows 開啟「下載」→ pi-camera-photos，找到並開啟照片。'],expected:'在 Windows 筆電上也能開啟照片。找到照片後，再勾選下方確認。',manual:'我已在 Windows 找到照片，並開啟確認。',results:['下載進度結束，重新出現 PS 開頭的輸入位置。接著開啟 Windows 的下載資料夾。']}
};
const studentNotes={
 location:['找不到終端機：在樹莓派選單找 Terminal，還是找不到就按「請助教幫忙」。','顯示別組名稱：先停下，請助教確認遠端桌面連到哪一台。'],
 folders:['mkdir 建立資料夾；cd 進入資料夾；pwd 顯示位置；ls 顯示裡面的東西。','資料夾已存在不用刪除。無法建立或寫入，請保留錯誤畫面。'],
 hello:['檔名要是 hello.py。不是 hello.py.txt，也不要存到 Windows。','改完程式先按 Ctrl + S 儲存，再回終端機重試。','程式一般可用 /usr/bin/python3 ~/pi-camera/hello.py 執行；這裡用課程工具執行，才能把檢查結果送回網頁。'],
 write:['找不到 message.txt：先看終端機顯示的檔案位置。','只有舊檔案還不算完成。請儲存程式後，再執行一次。'],
 environment:['相機要接在樹莓派，不是 Windows 筆電。','下載失敗：先確認手機熱點能上網，再重試。','顯示另一個安裝正在執行：先等它完成，不要刪除檔案或拔電。'],
 camera:['找不到畫面：確認相機接好，關閉其他正在用相機的程式，再按「重新連接相機」。','不能存檔：保留終端機錯誤，請助教查看。','若出現 Corrupt JPEG data，打開照片檢查有沒有破圖，並讓助教看警告。'],
 quality:['物品模糊、缺角或太暗，就回拍照階段再拍一次。','照片現在還在樹莓派。下一階段才下載到 Windows。'],
 download:['下載沒有成功或找不到照片：先保留 PowerShell 畫面，按「請助教幫忙」。','重複下載可能多一層 photos 資料夾，打開裡面找照片。','.local 連不上時，先請助教檢查；不要自己猜 IP。']
};
for(const stage of stages)Object.assign(stage,help[stage.id],{notes:studentNotes[stage.id]});
// Preserve existing server step IDs; location is an optional troubleshooting check.
stages[0].optional=true;
stages[1].commands=['mkdir -p ~/pi-camera/photos','cd ~/pi-camera','ls',runner+'folders'];
stages[1].actions=['在樹莓派桌面開啟終端機。','照下方指令建立資料夾。'];
stages[1].expected='pi-camera 資料夾裡看得到 photos。';
stages[1].notes=['mkdir 建立資料夾；cd 進入資料夾；ls 顯示裡面的東西。','資料夾已存在不用刪除。無法建立或寫入，保留錯誤畫面請助教幫忙。'];
stages[1].results=['沒有錯誤，又出現可以輸入的位置。','已進入 pi-camera 資料夾。','看得到 photos。','顯示「本次操作完成」。'];
// Compact student presentation; canonical titles above remain the reporting IDs.
const views={
 location:{title:'確認操作位置',where:'樹莓派｜終端機',action:'貼上指令，按 Enter。',commandTitles:['主機名稱','目前資料夾','回報結果'],results:['顯示 {host}。','顯示目前資料夾。','看到「本次操作完成」。']},
 folders:{title:'建立資料夾',where:'樹莓派｜終端機',action:'在樹莓派桌面開啟「終端機」。',commandTitles:['建立照片資料夾','進入資料夾','查看資料夾','回報結果'],results:['沒有錯誤就繼續。','沒有錯誤就繼續。','看到 photos。','看到「本次操作完成」。']},
 hello:{title:'寫第一個程式',where:'樹莓派｜文字編輯器',action:'開啟「文字編輯器」，輸入下方程式。',saveAs:'/home/user/pi-camera/hello.py',commandTitles:['執行程式'],results:['顯示「第 {group} 組」。']},
 write:{title:'用程式存檔',where:'樹莓派｜文字編輯器',action:'開啟「文字編輯器」，輸入下方程式。',saveAs:'/home/user/pi-camera/write_note.py',commandTitles:['執行程式'],results:['產生 message.txt。']},
 environment:{title:'接相機、安裝工具',where:'樹莓派｜終端機',action:'先把 USB 相機插在樹莓派。',commandTitles:['更新工具清單','安裝拍照工具','檢查相機'],results:['等到「本次操作完成」。','等到「本次操作完成」。','顯示 OpenCV 和可用相機。']},
 camera:{title:'拍一張照片',where:'樹莓派｜終端機',action:'執行這兩行，開啟拍照視窗。',commandTitles:['取得拍照程式','開啟拍照視窗'],results:['程式已放入 pi-camera。','按「拍照」，再按「結束」。']},
 quality:{title:'檢查照片',where:'樹莓派｜檔案管理員',action:'打開資料夾，點兩下照片。',path:'pi-camera → photos',check:'照片清楚、物品完整'},
 download:{title:'下載到筆電',where:'Windows｜PowerShell',action:'縮小遠端桌面，在 Windows 開啟 PowerShell。',commandTitles:['下載照片'],results:['在「下載」→ pi-camera-photos 開啟照片。'],check:'我已在筆電開啟照片'}
};
for(const stage of stages)stage.view=views[stage.id];
const fill=(text,host)=>String(text).replaceAll('{host}',host).replaceAll('{group}',host.slice(-2));
window.PiCameraCourse={version:'1.0.0',startIndex:1,runner,stages,fill,indexFor(title){const i=stages.findIndex(s=>s.title===title);return i<0?0:i}};
})();
