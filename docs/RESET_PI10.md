# pi5-10 重新測試首次安裝

本操作適用測試機 pi5-10 的 user 帳號，只還原本專案的課堂工具與練習位置。保留 Raspberry Pi OS、SSH、xrdp 遠端桌面、熱點及已安裝的系統套件；不是重刷 SD 卡。

在 pi5-10 的遠端桌面按左上角黑色 >_ 圖示，開啟終端機。先關閉課堂工具、Thonny 和拍照程式；每次貼一行並按 Enter：

```bash
curl --fail --location --proto '=https' https://raw.githubusercontent.com/ching-yu430/pi-helper/main/tooling/reset_pi10.py --output /tmp/pi-helper-reset-pi10.py
/usr/bin/python3 -B /tmp/pi-helper-reset-pi10.py --apply
```

詢問 sudo 密碼時輸入樹莓派密碼，按 Enter；輸入時不會顯示文字或星號。不要在第二行前面再加 sudo。工具會核對主機名稱與 user 帳號，在其他組別拒絕清除。想先預覽時，第二行去掉 `--apply`，便不會更動檔案。

移除背景設備回報服務、專用服務帳號、課程回報程式、配對設定、安裝紀錄、桌面／自動啟動捷徑，以及 .bashrc 裡本專案加入的區塊。保留 .bashrc 其他設定。

`~/pi-camera`（包括 hello.py 和可能已有的照片）會移至 `~/pi-helper-reset-backups/時間/pi-camera`；同處備份原本的 .bashrc。程式不會刪除練習成果。依輸出找到實際備份位置。

看到「清除完成」後，關閉所有舊終端機，再按 >_ 開新視窗。舊視窗記憶體中仍可能留著先前的指令功能。`~/pi-course` 此時應顯示找不到檔案。

重新安裝前，在工作台「課堂工具 → 指派安裝／更新」只勾第 10 組，開啟「舊配對遺失時才使用」，勾「重新綁定」，再指派 1.6.0。這會撤銷舊配對並清除該組設備檢查，之後需重新執行練習。使用新產生的安裝流程，不要重跑之前已完成的任務指令。

本機還原不會刪除伺服器舊看板回報，也不會清除 Windows 瀏覽器記住的進度；需要從頭測試時，另外在後台清除第 10 組看板紀錄，並在學生首頁「上次進度」清除本機課程進度。這些操作分別影響網頁，不會替其他組移除工具。
