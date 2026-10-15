# Pi 5 教學校對紀錄

2026-10-15。以使用者指定講義為優先，逐頁解碼完整文字並渲染 PDF 圖文，目視核對刷機、指令、X11、黑畫面與 IP 掃描頁。未修改原始講義；網站附原檔供對照。

## 來源優先順序

1. 主要：assets/handouts/pi5-hostname-first.pdf，原檔「樹莓派5_免查IP版.pdf」，共 6 頁。
2. 備援：assets/handouts/pi5-ip-fallback.pdf，原檔「樹莓派5_電腦查IP版.pdf」，共 8 頁。僅在需要查實際 IP 時使用。
3. Raspberry Pi 官方文件及 xrdp 專案，補充版本差異與技術限制，不覆蓋講義指定的課堂流程。

## 已逐項對齊

| 教學內容 | 主要講義位置 | 網站處理 |
| --- | --- | --- |
| 九組 hostname pi5-01～pi5-09 | 第 1 頁 | 保留九組；刷機不加 .local，連線才加；助教可選組及載入本組範例 |
| Pi 5、64-bit 有桌面版、不選 Lite | 第 2 頁第 2 節 | 學生刷機 14 步與助教刷機抽屜均對齊；版本依課堂指定 |
| user／123、同組熱點、TW、Asia/Taipei | 第 2 頁第 2 節 | 保留講義值；新版城市欄說明為 Taipei；區分 Pi 密碼與熱點密碼 |
| SSH 開啟並使用密碼驗證 | 第 2 頁第 2 節 | 明示開啟 SSH；官方範例照片可能關閉，文字要求開啟 |
| 完成寫入與驗證、先熱點再開 Pi | 第 2 頁第 3 節 | 首頁刷機優先、等初次開機完成，不中途斷電 |
| ssh user@本組.local、首次信任、密碼不顯字 | 第 3 頁第 4 節 | 分清網頁、Windows PowerShell 與 Pi SSH，登入後核對 hostname／whoami |
| apt update、安裝 xrdp xorgxrdp、啟用服務 | 第 3 頁第 5 節 | 學生新增三個獨立節點；助教教學每行獨立複製，出錯就停 |
| raspi-config → Advanced Options → Wayland → X11 | 第 4 頁第 6 節 | 新增設定與 reboot 節點，說明選單版本差異與 SSH 斷線正常 |
| mstsc、Session Xorg、Pi 帳密 | 第 4 頁第 7 節 | 設定目標隨組別更新；IP 模式使用已確認位址；不是 Windows PIN |
| 獨立桌面、正確 shutdown | 第 4 頁第 7～8 節 | 新增關機節點、儲存成果、至少等約 30 秒且依實際完成狀況，不只看綠燈 |
| RDP 3389 與 xrdp active 檢查 | 第 5 頁 | 明示 Windows 執行 Test-NetConnection；Pi SSH 才執行 systemctl |
| 黑畫面：Xorg、同帳號本機登入、Console／CLI、日誌 | 第 6 頁 | 學生先核對 Xorg／本機登入；助教詳細排查與教學卡涵蓋其餘步驟 |
| 金鑰警告只在核對重刷／身分後清特定目標 | 第 6 頁 | 保留助教核對與 ssh-keygen -R 指定目標，不刪整份 known_hosts |
| Advanced IP Scanner 的 IP、Scan、設備核對 | IP 講義第 3 頁第 4 節 | 明示備援條件、目前 Wi-Fi 網段、不能抄範例 IP／別組範圍；登入後仍查 hostname |

## 官方查核與必要區別

- [Raspberry Pi Remote access](https://www.raspberrypi.com/documentation/computers/remote-access.html)：mDNS 可用 hostname.local；需要網路支援，不能保證每種熱點都可用。SSH 需啟用，與 Web 網站本身無直接連線關係。
- [Raspberry Pi Getting started](https://www.raspberrypi.com/documentation/computers/getting-started.html)：Imager 可自訂帳號、Wi-Fi、時區與 SSH 密碼驗證；新版 Capital city 對應 Wi-Fi 無線地區。網站用設定名稱對照，不保證固定分頁順序或特定版本按鈕。
- [Raspberry Pi Configuration](https://www.raspberrypi.com/documentation/computers/configuration.html#switch-between-wayland-and-x11)：官方目前預設並偏好 Wayland，仍文件化 raspi-config 的 X11 選項。本課堂保留講義指定 X11，但明示不是所有 Pi 5 都必須切換，也不是黑畫面的萬用修復。
- [xrdp 專案](https://github.com/neutrinolabs/xrdp)：支援 ARM 平台；Xorg 桌面使用 xorgxrdp，RDP 服務通常監聽 TCP 3389。網站保留講義的 xrdp／xorgxrdp 安裝指令與 Xorg Session。

講義 user／123 是課堂統一設定，並非 Pi 5 出廠預設帳密；課後持續使用應更換。OS 版本未由講義鎖定，網站不聲稱任意新版映像都能得到完全相同畫面；課前仍須用各組同一映像完成一台 SSH／RDP 實機驗收。

## 本次驗證限制

程式／DOM 模擬可檢查指令字串、步驟連結及顯示邏輯，無法證明實體 Pi 套件安裝或熱點互通一定成功。本環境沒有可用的網站預覽瀏覽器，尚未完成真實手機畫面驗收；也未執行正式 Supabase API 或 SQL。不能將文字校對宣稱為所有硬體情境皆無誤。
