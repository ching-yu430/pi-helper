(()=>{
'use strict';
const runner='~/pi-course ',where='樹莓派遠端桌面 → 終端機';
const stages=[
 {id:'location',title:'確認現在操作的是本組 Pi',action:'在樹莓派遠端桌面開啟終端機。一次執行一行，確認本組名稱與目前目錄。',commands:['hostname','pwd',runner+'location'],expected:'hostname 是 {host}。課程工具會回報執行當下的位置。',tasks:['location'],notes:['Windows PowerShell 用來連線；這堂課的 Python 與相機程式都在 Pi 執行。','「檢查通過」只確認設備與執行位置，仍要知道自己正在操作哪個視窗。']},
 {id:'folders',title:'建立並找到課程資料夾',action:'先用 pwd、ls 看目前位置，再依序建立課程與照片資料夾。資料夾已存在時不用刪除，直接進入。',commands:['pwd','ls','mkdir -p ~/pi-camera/photos','cd ~/pi-camera','pwd','ls',runner+'folders'],expected:'目前位置是 /home/user/pi-camera，裡面有 photos 資料夾。',tasks:['folders'],notes:['mkdir 建立資料夾；cd 進入資料夾；pwd 顯示目前位置；ls 列出內容。','檢查工具只確認資料夾存在且能寫入，不會替你完成建立練習。']},
 {id:'hello',title:'親手寫第一個 Python 程式',action:'在 Pi 的 Thonny 新增檔案，親手輸入下方程式，存成 /home/user/pi-camera/hello.py，再回終端機執行。',code:'print("第 {group} 組")',commands:[runner+'hello'],expected:'終端機出現「第 {group} 組」，網站收到本次執行成功的結果。',tasks:['hello'],notes:['用 Pi 的 Thonny 即可；找不到編輯器時請助教協助。不要把程式碼當作終端機指令。','改一次文字、儲存後再執行，觀察輸出。請保留本組「第 {group} 組」，供檢查工具核對。','一般 Python 啟動方式是 /usr/bin/python3 ~/pi-camera/hello.py；下方課程工具使用同一個 Python，另外回報本次結果。']},
 {id:'write',title:'用 Python 產生一個文字檔',action:'在 Pi 的 Thonny 新增下方程式，存成 /home/user/pi-camera/write_note.py。儲存後執行，再開啟產生的 message.txt。',code:'from pathlib import Path\n\nfolder = Path.home() / "pi-camera"\nfile = folder / "message.txt"\nfile.write_text("第 {group} 組的第一個文字檔\\n", encoding="utf-8")\nprint(file)',commands:[runner+'write'],expected:'pi-camera 裡出現 message.txt，開啟後能看到本組文字。',tasks:['write'],notes:['檢查會確認本次執行真的寫入檔案；只有之前留下的檔案不算本次通過。','找不到檔案時，先看程式印出的路徑。']},
 {id:'environment',title:'安裝 OpenCV 並確認 USB 相機',action:'把 USB 相機接到 Pi 的 USB 孔。依序執行更新、安裝與環境檢查；上一行結束後才做下一行。',commands:[runner+'update',runner+'install',runner+'environment'],expected:'系統 Python 能載入 OpenCV 與介面套件，v4l2 工具找到支援取像的 USB 裝置。',tasks:['environment'],notes:['更新與安裝會詢問 sudo 密碼，使用目前 Pi 密碼；輸入時不顯示文字。','安裝的是 v4l-utils、python3-opencv、python3-tk。暫不使用 pip、虛擬環境或辨識套件。','測試機已確認 /dev/video0 可取像；正式程式仍會列出可用裝置，不把節點編號當成固定規格。']},
 {id:'camera',title:'預覽、拍照並正常結束',action:'先取得統一拍照程式，再啟動。確認預覽後按「拍照」，打開存檔檢查，最後按「結束」。',commands:[runner+'camera-install',runner+'camera'],expected:'成功預覽、儲存本次 1920×1080 照片，最後正常結束並釋放相機。',tasks:['camera','photo','camera_exit'],notes:['滑鼠按鈕可直接操作，也可點預覽視窗後用英文 S 拍照、Q 結束。','維持 1280×720 預覽，拍照時重新開啟相機取 1920×1080。持續 1080P 方案尚未採用。','若終端機出現 Corrupt JPEG data，保留訊息並檢查照片；有存檔不代表畫面品質一定正常。','正式介面及相依套件仍需老師在 Pi 5 與遠端桌面驗收後，才開放學生使用。'],download:'courseware/camera_app.py'},
 {id:'quality',title:'檢查照片並整理練習資料',action:'用 Pi 的檔案管理員打開 pi-camera/photos，逐張確認清楚、曝光正常、物品完整，再整理需要保留的照片。',commands:[],expected:'選出的照片能開啟，物品清楚、未截斷；目前使用「練習拍照」，正式物料分類之後公布。',tasks:['photo'],manual:'我已開啟本次照片，確認物品清楚、完整，並整理好要保留的照片。',notes:['照片儲存在 Pi，不是 Windows。檔案可讀與尺寸正確只屬技術檢查，照片品質仍需親眼確認。','手機參考照片不算本次 USB 相機成果。保留不同拍攝批次，之後依老師規則分配資料。']},
 {id:'download',title:'把照片下載到 Windows',where:'Windows 筆電 → PowerShell',action:'回到 Windows PowerShell（看到 PS … >），執行本組下載指令，輸入 Pi 密碼。完成後到下載資料夾開啟照片。',commands:['scp -r user@{host}.local:/home/user/pi-camera/photos "$HOME\\Downloads\\pi-camera-photos"','explorer.exe "$HOME\\Downloads\\pi-camera-photos"'],expected:'Windows 下載資料夾中能找到本組照片，且照片能正常開啟。',tasks:[],manual:'我已在 Windows 找到下載的照片，並成功開啟確認。',notes:['這一段尚待 Windows 實機驗收；重複下載時留意資料夾層級與同名檔案。','Pi 無法直接證明 Windows 已下載並開啟照片，因此這一步記為學生自行確認。','.local 排查仍失敗時，再請助教確認 IP；不要直接改填不明位址。']}
];
// Keep stage titles stable for saved progress and teacher links; student actions are short.
const help={
 location:{action:'先開啟樹莓派的終端機，再照下方指令一行一行做。',actions:['把遠端桌面視窗切到最前面。','在樹莓派左上角選單找「終端機／Terminal」，按一下開啟。','找到終端機後，就照下面的綠色複製按鈕操作。'],expected:'第一行要顯示 {host}。顯示別組名稱就停下，按「請助教幫忙」。',results:['顯示 {host}；別組名稱就先停下。','顯示 /home/user，或本組 pi-camera 資料夾的位置。','顯示「本次操作完成」，再回網頁到操作說明按「重新檢查」。']},
 folders:{action:'現在要做一個放程式和照片的資料夾。',actions:['留在剛才的樹莓派終端機。','照下方順序做，一行結束後再換下一行。'],expected:'畫面顯示 /home/user/pi-camera，並看得到 photos。',results:['看目前在哪個資料夾。','顯示這個資料夾裡的東西；沒有東西也可能是正常的。','通常沒有新文字，又出現可以輸入的位置。資料夾已經建立。','通常沒有新文字，又出現可以輸入的位置。你已進入 pi-camera。','顯示 /home/user/pi-camera。','看得到 photos 這個名稱。','顯示「本次操作完成」，再回網頁到操作說明按「重新檢查」。']},
 hello:{where:'樹莓派桌面 → Thonny，寫好後再回終端機',action:'先寫一個會顯示本組名稱的小程式。',actions:['在樹莓派左上角選單，開啟「程式設計（Programming）→ Thonny」，按 Ctrl + N。','親手輸入下面的程式。注意引號和括號。','按 Ctrl + S，將檔案存成 /home/user/pi-camera/hello.py。','存好後，切回樹莓派終端機，再執行下方綠色按鈕的指令。'],expected:'終端機顯示「第 {group} 組」。改過程式後，要先儲存，再執行一次。',results:['顯示「第 {group} 組」和「本次操作完成」。']},
 write:{where:'樹莓派桌面 → Thonny，寫好後再回終端機',action:'這次讓 Python 幫你做一個文字檔。',actions:['在樹莓派開啟 Thonny，按 Ctrl + N 新增檔案。','親手輸入下面的程式，存成 /home/user/pi-camera/write_note.py。','存好後，回樹莓派終端機，執行下方指令。','執行完成後，用樹莓派的檔案管理員開啟 pi-camera 裡的 message.txt。'],expected:'message.txt 裡有「第 {group} 組的第一個文字檔」。',results:['顯示 message.txt 的位置和「本次操作完成」。接著去開啟這個檔案。']},
 environment:{action:'把相機接到樹莓派，再安裝拍照需要的工具。',actions:['把 USB 相機插進樹莓派的 USB 孔，不要插在 Windows 筆電。','留在樹莓派終端機，執行下方指令。','如果詢問密碼，輸入樹莓派密碼，再按 Enter；沒有文字或星號是正常的。','安裝時等它跑完，不要重複按 Enter，也不要拔電。'],expected:'最後顯示 OpenCV 版本與可用相機。看不到相機就按「請助教幫忙」。',results:['文字停止捲動，出現「本次操作完成」。才換下一行。','安裝可能要等一段時間。出現「本次操作完成」才換下一行。','顯示 OpenCV 和 /dev/video… 等相機名稱，再回網頁更新結果。']},
 camera:{action:'先開拍照程式，再用滑鼠拍一張照片。',actions:['先執行下方第 1 行，看到完成後，再執行第 2 行。','拍照視窗開啟後，確認裡面看得到相機畫面。','把物品放好，用滑鼠按「拍照」。先不用記快捷鍵。','看到「照片已儲存」後，按「結束」，再回網頁看結果。'],expected:'網頁顯示照片尺寸為 1920×1080，並收到正常結束的結果。',results:['顯示統一拍照程式已放入 pi-camera。','開啟拍照視窗。用滑鼠拍照，完成後按「結束」。']},
 quality:{where:'樹莓派桌面 → 檔案管理員',action:'打開剛才拍的照片，用眼睛確認。',actions:['在樹莓派開啟檔案管理員。','打開 pi-camera，再打開 photos。','點兩下照片，確認物品清楚、完整，而且不會太亮或太暗。','確認後，按「照片看過了」。'],expected:'你能清楚看見整個物品。模糊或缺角就回上一階段重拍。',manual:'我已開啟本次照片，確認物品清楚、完整。'},
 download:{where:'Windows 筆電 → PowerShell；不是樹莓派終端機',action:'最後把照片搬到 Windows 筆電。',actions:['先把遠端桌面視窗縮小。這一步在 Windows 做。','按 Windows 開始鍵，輸入 PowerShell，按一下開啟。','看到 PS 開頭的輸入位置後，貼上下方指令並按 Enter。','輸入樹莓派密碼；輸入時沒有文字是正常的。','下載完後，執行下一行 explorer.exe，直接開啟儲存照片的 Windows 資料夾。'],expected:'在 Windows 筆電上也能開啟照片。找到並開啟照片後，按「完成課程」。',manual:'我已在 Windows 找到照片，並開啟確認。',results:['下載進度結束，重新出現 PS 開頭的輸入位置。接著開啟 Windows 的下載資料夾。']}
};
const studentNotes={
 location:['找不到終端機：在樹莓派選單找 Terminal，還是找不到就按「請助教幫忙」。','顯示別組名稱：先停下，請助教確認遠端桌面連到哪一台。'],
 folders:['mkdir 建立資料夾；cd 進入資料夾；pwd 顯示位置；ls 顯示裡面的東西。','資料夾已存在不用刪除。無法建立或寫入，請保留錯誤畫面。'],
 hello:['找不到 Thonny：請助教從「課堂工具」確認編輯器已安裝。','檔名要是 hello.py，不要存到 Windows。','寫在上方程式區，不要寫進下方 >>> 區塊。','改完程式先按 Ctrl + S 儲存，再回終端機重試。','程式一般可用 /usr/bin/python3 ~/pi-camera/hello.py 執行；這裡用課程工具執行，才能把檢查結果送回網頁。'],
 write:['在 Thonny 按 Ctrl + N 新增程式，存好後回終端機執行網頁指令。','找不到 message.txt：先看終端機顯示的檔案位置。','只有舊檔案還不算完成。請儲存程式後，再執行一次。'],
 environment:['相機要接在樹莓派，不是 Windows 筆電。','下載失敗：先確認手機熱點能上網，再重試。','顯示另一個安裝正在執行：先等它完成，不要刪除檔案或拔電。'],
 camera:['找不到畫面：確認相機接好，關閉其他正在用相機的程式，再按「重新連接相機」。','不能存檔：保留終端機錯誤，請助教查看。','若出現 Corrupt JPEG data，打開照片檢查有沒有破圖，並讓助教看警告。'],
 quality:['物品模糊、缺角或太暗，就回拍照階段再拍一次。','照片現在還在樹莓派。下一階段才下載到 Windows。'],
 download:['$HOME 是 Windows 使用者資料夾；通常是 C:\\Users\\你的Windows帳號。照片會放在它的 Downloads\\pi-camera-photos。','請在同一個 Windows PowerShell 執行下一行 explorer.exe，直接開啟下載位置。','下載沒有成功或找不到照片：先保留 PowerShell 畫面，按「請助教幫忙」。','重複下載可能多一層 photos 資料夾，打開裡面找照片。','.local 連不上時，先請助教檢查；不要自己猜 IP。']
};
for(const stage of stages)Object.assign(stage,help[stage.id],{notes:studentNotes[stage.id]});
// Preserve existing server step IDs; location is an optional troubleshooting check.
stages[0].optional=true;
stages[1].commands=['source ~/.local/share/pi-helper-course/course_shell.bash && mkdir -p ~/pi-camera/photos','cd ~/pi-camera','ls',runner+'folders'];
stages[0].commandTasks=['host_name','working_dir','location'];
stages[1].commandTasks=['mkdir_photos','enter_project','list_project','folders'];
stages[1].tasks=['mkdir_photos','enter_project','list_project','folders'];
stages[1].actions=['在樹莓派桌面開啟終端機。','照下方指令建立資料夾。'];
stages[1].expected='pi-camera 資料夾裡看得到 photos。';
stages[1].notes=['更新工具或換終端機後，先從第 1 行開始。這行會啟用目前視窗的指令回報；以前沒回報的 mkdir、cd、ls 要重新執行。','第 1 行顯示找不到 course_shell.bash：請助教確認已安裝工具 1.6.0。','mkdir 建立資料夾；cd 進入資料夾；ls 顯示裡面的東西。','資料夾已存在不用刪除。無法建立或寫入，保留錯誤畫面請助教幫忙。'];
stages[1].results=['沒有錯誤，又出現可以輸入的位置。','已進入 pi-camera 資料夾。','看得到 photos。','顯示「本次操作完成」。'];
// Compact student presentation; canonical titles above remain the reporting IDs.
const views={
 location:{title:'確認操作位置',where:'樹莓派｜終端機',action:'貼上指令，按 Enter。',commandTitles:['主機名稱','目前資料夾','回報結果'],results:['顯示 {host}。','顯示目前資料夾。','看到「本次操作完成」。']},
 folders:{title:'建立資料夾',where:'樹莓派｜終端機',action:'在樹莓派開啟終端機，先做第 1 行，啟用這個視窗的回報。',commandTitles:['啟用回報並建立照片資料夾','進入資料夾','查看資料夾','回報結果'],results:['沒有錯誤就繼續。','沒有錯誤就繼續。','看到 photos。','看到「本次操作完成」。']},
 hello:{title:'寫第一個程式',where:'樹莓派｜Thonny',action:'左上角選單 → 程式設計（Programming）→ Thonny。',editorIntro:'按 Ctrl + N，在上方空白區輸入：',saveAs:'/home/user/pi-camera/hello.py',commandTitles:['執行程式'],results:['顯示「第 {group} 組」。']},
 write:{title:'用程式存檔',where:'樹莓派｜Thonny',action:'左上角選單 → 程式設計（Programming）→ Thonny。',editorIntro:'按 Ctrl + N，在上方空白區輸入：',saveAs:'/home/user/pi-camera/write_note.py',commandTitles:['執行程式'],results:['產生 message.txt。']},
 environment:{title:'接相機、安裝工具',where:'樹莓派｜終端機',action:'先把 USB 相機插在樹莓派。',commandTitles:['更新工具清單','安裝拍照工具','檢查相機'],results:['等到「本次操作完成」。','等到「本次操作完成」。','顯示 OpenCV 和可用相機。']},
 camera:{title:'拍一張照片',where:'樹莓派｜終端機',action:'執行這兩行，開啟拍照視窗。',commandTitles:['取得拍照程式','開啟拍照視窗'],results:['程式已放入 pi-camera。','按「拍照」，再按「結束」。']},
 quality:{title:'檢查照片',where:'樹莓派｜檔案管理員',action:'打開資料夾，點兩下照片。',path:'pi-camera → photos',check:'照片清楚、物品完整'},
 download:{title:'下載到筆電',where:'Windows｜PowerShell',action:'縮小遠端桌面，在 Windows 開啟 PowerShell。',commandActions:['在 Windows PowerShell 執行下載指令。等下載完成，再按「下一步」。','下載完成後，照下面的步驟開啟電腦裡的照片。'],openPhotoSteps:['按 Win + E，開啟 Windows「檔案總管」。','在左邊點「下載」（Downloads），再點兩下 pi-camera-photos。','若裡面有 photos 資料夾，先點兩下進去。','點兩下 JPG 照片。看到照片後，再按「完成課程」。'],path:'照片位置：檔案總管 → 下載（Downloads）→ pi-camera-photos',commandTitles:['下載照片','開啟下載的資料夾'],results:['等下載完成，重新出現 PS 命令列，再按下一步。','資料夾開啟後，點兩下照片；若只有 photos，先打開它。'],check:'我已在筆電開啟照片'}
};
for(const stage of stages)stage.view=views[stage.id];
// Keep the saved stage ID while teaching each real command separately.
const environment=stages.find(s=>s.id==='environment');
Object.assign(environment,{
 commands:[runner+'run -- sudo apt update',runner+'run -- sudo apt install -y v4l-utils python3-opencv python3-tk',runner+'run -- /usr/bin/python3 -c "import cv2; import tkinter; print(cv2.__version__)"',runner+'run -- v4l2-ctl --list-devices',runner+'run -- v4l2-ctl -d {device} --list-formats-ext',runner+'run -- v4l2-ctl -d {device} --all'],
 commandTasks:['update','install','opencv','camera_list','camera_formats','camera_info'],tasks:['update','install','opencv','camera_list','camera_formats','camera_info'],
 action:'在樹莓派終端機，依序安裝 OpenCV、接上 USB 相機，再查詢相機。',
 actions:['更新套件清單，再安裝 OpenCV 與相機工具。','確認 OpenCV 能載入。','將 USB 相機插在樹莓派，列出相機。','依查詢結果選相機位置，再查解析度與設定。'],
 expected:'OpenCV 顯示版本，找到 USB 相機，且列出 MJPG 1920x1080。',
 notes:['每次只複製目前這一行；前面的 ~/pi-course run -- 讓同一次執行能回報給老師。請使用課堂工具 1.6.0。','python3-opencv 是 OpenCV；v4l-utils 用來查相機；python3-tk 是視窗介面套件。','詢問密碼時輸入樹莓派密碼。看不到文字或星號是正常的。','沒有 GENERAL WEBCAM：確認相機插在樹莓派，不是在筆電。','/dev/video0 是常見位置，依本組列出的結果選擇；不要選只能提供中繼資料的節點。','ModuleNotFoundError: cv2：重新執行安裝，並使用 /usr/bin/python3。','安裝有下載錯誤：確認熱點能上網再重試；有套件鎖定就等其他安裝結束，不要刪除 lock 檔。','查詢列出的解析度與 FPS 是支援模式，仍需實際拍照確認。'],
 view:{title:'安裝 OpenCV、確認相機',where:'樹莓派｜終端機',action:'先更新套件清單。',
 commandTitles:['更新套件清單','安裝 OpenCV 與相機工具','測試 OpenCV','列出 USB 相機','查詢支援解析度','查看相機設定'],
 commandActions:['先更新套件清單，等它執行完。','安裝 OpenCV、相機工具與視窗套件。','確認 Python 能使用 OpenCV。','把 USB 相機插在樹莓派，再執行這一行。','選好相機位置，再查詢支援的解析度。','使用同一個相機位置，查看設定。'],
 results:['等到「本次操作完成」，再做下一行。','安裝完成並回到輸入位置。','看到 OpenCV 版本，例如 4.6.0；版本不同也可以。','找到 GENERAL WEBCAM，並看最後「可用 USB 相機：…」。下一行選這個位置。','在 MJPG 下找到 1920x1080。沒有就請助教確認。','看到 Driver name、Width/Height 等相機資訊。這些設定不用修改。']}
});
// The AI assignment owns its file; the legacy teacher camera app remains available separately.
const assignment=stages.find(s=>s.id==='camera');
Object.assign(assignment,{
 assignment:true,where:'樹莓派｜Thonny，寫好後回終端機',download:null,commands:[runner+'run -- /usr/bin/python3 /home/user/pi-camera/{host}_camera.py'],commandTasks:['student_camera'],tasks:['student_camera','photo','camera_exit'],
 action:'自己向 AI 提問，做出符合以下規範的拍照程式。',
 expected:'結束程式後，檢查這次的新照片與相機；預覽和照片品質要親眼確認。',
 actions:['先讀作業規範，再自己想要怎麼向 AI 提問。','在樹莓派開啟 Thonny，貼上程式並儲存到指定位置。','用網頁指令開啟程式，預覽、拍照，再按結束。','有錯誤就把錯誤交給 AI 修改，儲存後重新執行。'],
 requirements:['看得到相機畫面。','用滑鼠按「拍照」，存成 1920×1080 JPG，不放大小圖。','照片存到指定資料夾，檔名不重複。','顯示已存檔、張數、尺寸與位置。','按「結束」或關閉視窗後，相機還能再用。','相機沒接好或不能存檔時，有提示並可重試。'],
 notes:['環境：樹莓派 5、系統 Python 3、OpenCV、Tkinter。程式不需額外參數就能啟動。','先做出能拍照的程式，再修改功能，不用加入辨識或串流。','檢查在程式結束後進行；只留下舊照片不算這次完成。','看到預覽、照片清楚、不是把小圖放大，由學生或助教確認。','這行會執行上方存好的本組程式，並檢查新照片。請使用課堂工具 1.6.0；舊版請助教指派更新。','保留一次「遇到什麼問題、請 AI 改了什麼」的例子即可。'],
 view:{title:'用 AI 做拍照程式',where:'樹莓派｜Thonny',action:'自己向 AI 提問，做出符合以下規範的拍照程式。',saveAs:'/home/user/pi-camera/{host}_camera.py',commandTitles:['開啟本組程式並檢查'],results:['預覽 → 拍照 → 結束，之後才會回報檢查結果。']}
});
// Main lesson instructions: only the actions needed in the current window.
const terminalSteps=['切到剛才的樹莓派終端機。還沒開啟時，按樹莓派桌面左上角黑色「>_」圖示。','按下方「複製指令」，點一下樹莓派終端機，按 Ctrl + Shift + V，再按 Enter。','等這一行執行完，重新看到 user@{host} 的輸入位置，再按網頁的「下一步」。請留在同一個終端機。'];
for(const stage of stages){
 if(stage.commands.length&&stage.id!=='download')stage.view.instructions=terminalSteps;
 if(stage.code){
  stage.view.writingInstructions=['在樹莓派桌面，點左上角樹莓派選單 → 程式設計（Programming）→ Thonny，按 Ctrl + N。','點 Thonny 上半部空白區，複製下方程式後按 Ctrl + V。不要貼到下方的 >>>。','按 Ctrl + S；在「檔案名稱」貼上下方完整路徑，按「儲存」。存好才回網頁按「存好了，下一步」。'];
  stage.view.editorIntro='按 Ctrl + N，在 Thonny 上半部空白區輸入：';
 }
}
stages[1].view.commandActions=['先執行這一行，啟用目前視窗的回報並建立照片資料夾。','把目前操作的位置切換到 pi-camera 資料夾。','列出這個資料夾的內容，找 photos 這個名稱。','檢查 photos 能不能存檔，並將結果回報給老師。'];
stages[3].view.runningInstructions=[...terminalSteps,'執行後，在樹莓派按上方黃色資料夾圖示。按 Ctrl + L，輸入 /home/user/pi-camera，按 Enter，再點兩下 message.txt。'];
stages[6].view.instructions=['在樹莓派桌面，按上方黃色資料夾圖示，開啟檔案管理員。','在檔案管理員按 Ctrl + L，輸入 /home/user/pi-camera/photos，再按 Enter。','點兩下 JPG 照片。確認物品清楚、完整，沒有太亮或太暗，再回網頁按「照片看過了」。'];
stages[6].view.path='照片在樹莓派：/home/user/pi-camera/photos';
assignment.view.where='Windows｜AI 網站 → 樹莓派｜Thonny';
assignment.view.writingInstructions=['在 Windows 瀏覽器開啟你使用的 AI 網站。告訴 AI 下方六項功能、使用的工具、照片資料夾及檔名規則。','複製 AI 給的 Python 程式。回樹莓派遠端桌面，點樹莓派選單 → 程式設計 → Thonny，按 Ctrl + N。','點 Thonny 上半部空白區，按 Ctrl + V。按 Ctrl + S，把下方完整路徑貼到「檔案名稱」並儲存，再回網頁按「開始試拍」。'];
assignment.view.runningInstructions=[...terminalSteps,'等拍照視窗出現：用滑鼠按「拍照」，再按程式的「結束」。回到網頁等檢查結果；有錯誤先保留終端機畫面。'];
stages[7].commands=['New-Item -ItemType Directory -Force "$HOME\\Downloads\\pi-camera-photos" | Out-Null','scp -r user@{host}.local:/home/user/pi-camera/photos "$HOME\\Downloads\\pi-camera-photos"','explorer.exe "$HOME\\Downloads\\pi-camera-photos\\photos"'];
stages[7].view.commandTitles=['準備筆電上的照片資料夾','下載本組照片','開啟下載好的照片'];
stages[7].view.commandActions=['先在 Windows 筆電準備放照片的資料夾。已經有這個資料夾也可以執行。','將樹莓派的照片下載到 Windows，等下載完成再按「下一步」。','最後打開筆電裡的照片，確認真的下載好了。'];
stages[7].view.results=['沒有錯誤，重新出現 PS 開頭的輸入位置。','下載進度結束，重新出現 PS 命令列。沒有紅色錯誤才繼續。','開啟 photos 資料夾。點兩下 JPG，確認看得到照片。'];
stages[7].view.commandInstructions=[['縮小樹莓派遠端桌面。按 Windows 開始鍵，輸入 PowerShell，再按 Enter；找到 PS 開頭的輸入位置。','複製下方指令，點一下 Windows PowerShell，按 Ctrl + V，再按 Enter。這行只建立資料夾，不會刪除舊照片。'],['留在同一個 Windows PowerShell，複製下方指令，按 Ctrl + V，再按 Enter。','第一次出現 yes/no 時，先請助教核對本組目標，再輸入 yes。出現 password 時，輸入樹莓派密碼再按 Enter；看不到文字或星號是正常的。','等下載結束，重新看到 PS 開頭的輸入位置。看到紅色錯誤就保留畫面，請助教幫忙；不要直接按下一步。'],[]];
stages[7].view.openPhotoSteps=['留在剛才的 Windows PowerShell，複製下方 explorer.exe 指令，貼上後按 Enter。','新開的 photos 資料夾裡，點兩下 JPG 照片。第一次詢問用哪個程式開啟時，選「相片／Photos」。','確定看得到照片，再回網頁按「完成課程」。'];
stages[7].view.path='Windows 照片位置：使用者資料夾 → Downloads → pi-camera-photos → photos';
stages[7].notes=stages[7].notes.filter(text=>!text.startsWith('重複下載可能'));
stages[7].notes.push('每次依序使用這三行。照片固定放在 Downloads\\pi-camera-photos\\photos；重複下載不會再多一層 photos。','若 Windows 的「下載」已移到 OneDrive 或其他地方，仍用本頁 explorer.exe 指令開啟這次指定的位置。');
environment.view.commandInstructions=environment.commands.map((_,i)=>{
 const select=i>=4?['先在下方「相機位置」選剛才看到的 /dev/video…。不確定選哪個，就保留畫面請助教幫忙。']:[];
 const note=i<2?['如果詢問 [sudo] password，輸入樹莓派密碼再按 Enter。沒有文字或星號是正常的；不要再貼一次指令。']:i===3?['相機要插在樹莓派。先看最後「可用 USB 相機：…」，再對照下方範例找 GENERAL WEBCAM。']:[];
 return [...select,...terminalSteps.slice(0,2),...note,terminalSteps[2]];
});
assignment.view.runningInstructions=[...terminalSteps.slice(0,2),'等拍照視窗出現，用滑鼠按「拍照」。看到存檔成功後，按程式的「結束」，不要只縮小視窗。','回到網頁等檢查結果。有錯誤先保留終端機畫面；要修改程式，按下方「回去修改程式」。'];
function instructionsFor(stage,{writing=false,lineIndex=0}={}){
 return writing?stage.view.writingInstructions||[]:stage.view.commandInstructions?.[lineIndex]||stage.view.runningInstructions||stage.view.instructions||[];
}
const fill=(text,host,device='/dev/video0')=>String(text).replaceAll('{host}',host).replaceAll('{group}',host.slice(-2)).replaceAll('{device}',device);
window.PiCameraCourse={version:'1.6.0',startIndex:1,runner,stages,fill,instructionsFor,indexFor(title){const i=stages.findIndex(s=>s.title===title);return i<0?0:i}};
})();
