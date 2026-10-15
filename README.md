# 樹莓派 5 連線小幫手 — 學生自助版

更新日期：2026-10-15（刷機圖解與 AI 提示詞版）。

## 更新至 GitHub Pages

先解壓縮，將裡面的 index.html、assistant.html、README.md、.nojekyll 上傳至原儲存庫最外層，覆蓋同名檔案並提交。等待 Pages 部署完成，再重新整理網站。
原本已設定 main 分支與 /(root) 時，不必重新設定。
助教完整版是 assistant.html，請一併上傳；入口已放在右上角。

## 本次更新

1. 學生版加入 11 個刷機步驟，每步搭配繁體中文設定示意圖。
2. 組別名稱會同步更新圖片與可複製欄位，刷機填 pi5-XX，不加 .local。
3. 刷機依課堂講義設定 Pi 5、Raspberry Pi OS 64-bit 有桌面版本、TW／Asia/Taipei、課堂帳密、手機熱點及 SSH 密碼驗證。
4. 刷機完成後可以轉入 .local SSH 連線排查。
5. 連線排查與刷機圖解皆可複製 AI 提示詞；不會自動送到 AI。
6. 已移除學生版「複製給助教」功能，求助頁改為 AI 提示詞。
7. 助教完整版入口移到右上角。

## 圖片說明

圖片是內建 SVG 教學示意，並非 Raspberry Pi Imager 實際截圖。不同版本依設定欄位名稱操作；所有圖片均包含在 index.html，不需另傳圖片或連外載入圖片。
自訂主機名稱、國家、時區等欄位依課堂講義整理。新版 Imager 可能採用獨立的 Hostname、Localisation、User、Wi-Fi、Remote Access 分頁；舊版可能使用 OS 自訂設定與 Services 分頁。

## 功能與資料

學生版一次顯示一個連線步驟，可返回、重設、貼上回覆，再複製 AI 提示詞。這些動作不會替電腦執行指令。刷機步驟按「已完成」只表示使用者自行回報完成，網頁不會驗證 Imager 或 SD 卡狀態。
紀錄留在目前頁面記憶體，重新整理會清除。不會自動傳給助教或 AI，不應輸入私人密碼或私鑰。

## 驗證

已檢查 JavaScript 語法、26 個連線流程節點、11 個刷機步驟、組別圖片更新、轉入 SSH、AI 提示詞與重設。圖片通過 SVG 結構檢查；尚未用實體手機或真實 Pi 測試整體操作。

## 全新儲存庫

1. 建立 GitHub 儲存庫；免費方案使用 Public。
2. 將解壓縮後的四個檔案上傳至根目錄，不要只上傳 ZIP。
3. Settings → Pages → Deploy from a branch → main → /(root) → Save。
4. 等待部署完成，使用 Pages 顯示的網址。

## 參考

課堂提供：樹莓派5_免查IP版、樹莓派5_電腦查IP版。
Raspberry Pi Imager 官方下載：https://www.raspberrypi.com/software/
Raspberry Pi 官方設定說明：https://www.raspberrypi.com/documentation/computers/getting-started.html
GitHub Pages：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
