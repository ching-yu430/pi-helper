# 樹莓派 5 學生自助版與助教版

更新：2026-10-15。支援 GitHub Pages；同步需設定自己的 Supabase。

## 本次更新

- AI 提示詞完整預覽直接展開，放在複製按鈕前。
- 連線步驟下方只保留「都不符合／看不懂，用 AI 協助」，移除重複的直接複製按鈕。刷機也由同類入口先預覽，再複製。
- 刷機改為 14 步，核對 Imager 2.0.12 的介面原始碼，搭配官方文件的真實截圖。
- 加入 Supabase 學生進度同步及助教的九組看板，助教每 5 秒自動更新。

## 上傳 GitHub

解壓縮後，將裡面的檔案及資料夾上傳到儲存庫根目錄，保持資料夾結構。覆蓋舊檔並提交即可；既有 Pages 設定不必更改。

- index.html：學生版
- assistant.html：助教版，包含組別看板
- config.js：填 Supabase Project URL 與 publishable／anon key
- sync-client.js、student-sync.js、teacher-dashboard.js：同步功能
- assets/imager/：官方介面圖片，須連同資料夾上傳
- SUPABASE_SETUP.md：同步設定與課前驗收
- supabase/setup.sql：資料表及 API
- supabase/create-classroom.sql：產生課堂加入碼與助教管理碼
- .nojekyll：靜態網頁設定

未設定 Supabase 時，頁面可本機排查，但不會同步。助教管理碼不應寫入任何網站原始檔。

## Imager 查核紀錄

2026-10-15 實際查詢官方軟體頁：Windows 下載連結 imager_latest.exe 轉向 imager_2.0.12.exe，Last-Modified 為 2026-10-08。
同時讀取 v2.0.12 原始碼的 Hostname／Locale／User／Wi-Fi／Remote Access／Pi Connect／Writing 相關 QML，核對欄位與操作順序。
本環境沒有直接啟動 Windows 安裝程式。圖片取自官方現行文件，為官方介面範例，不是本次自行操作 Windows 所截。

已補上：Capital city 影響無線地區、Time zone／Keyboard layout、Wi-Fi Secure network／Confirm password／Hidden SSID、SSH 開關與密碼驗證、Connect、Writing Summary、清除警告與完成驗證。
介面語言及 OS 提供的條件式選項可能不同；網站使用繁體中文說明與英文欄位對照。官方圖中的 Jay／London／Pi Towers／磁碟名稱是例子，不代表課堂值；各步已明確提示。SSH 官方圖是關閉狀態，課堂步驟要求開啟。

## 驗證範圍

JavaScript 語法、26 個學生排查節點、14 個刷機步驟、AI 預覽與返回、組別切換、同步資料白名單、裝置識別、退出及助教看板模擬已通過。
SQL 權限條件已檢查；尚未對使用者的 Supabase 執行 SQL，未作真實跨裝置、手機或 Pi 實測。

## 官方來源

- https://www.raspberrypi.com/software/
- https://github.com/raspberrypi/rpi-imager/releases/tag/v2.0.12
- https://www.raspberrypi.com/documentation/computers/getting-started.html
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/getting-started/api-keys

課堂設定依先前提供的樹莓派 5 講義；仍採有桌面 64-bit、.local 優先與各組手機熱點。
