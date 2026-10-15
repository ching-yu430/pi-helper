# 樹莓派 5 學生自助版與助教版

更新：2026-10-15。支援 GitHub Pages；同步需設定自己的 Supabase。

## 本次更新

- 學生與助教固定使用本堂課，移除課堂加入、退出與更換功能。
- 助教改為密碼登入；首次沿用先前提供的管理碼，登入後可自行修改密碼。
- 三個看板操作按鈕固定同一排。
- 截止日期只選日期，另以開關控制課堂是否開放。
- 助教版改為「組別看板／排查工具」頁籤，加入各組狀態統計與桌面／手機卡片版面。
- 保留學生一步一問、刷機圖解與完整 AI 提示詞預覽。

## 更新方式

1. 解壓縮，將全部檔案與資料夾覆蓋上傳 GitHub 儲存庫根目錄。
2. 提交並等待 Pages 完成部署，重新整理網頁。
3. 學生選組別直接開始；助教輸入密碼登入。

本次資料庫更新已套用，不必重跑 SQL。正式課堂維持開放，截止日期仍為 2027-01-31（臺灣時間當天結束）。

檔案：index.html 為學生版，assistant.html 為助教版。config.js、sync-client.js、student-sync.js、teacher-dashboard.js 及 assets/ 圖片都必須一併上傳。詳細使用方式見 SUPABASE_SETUP.md。

密碼由資料庫驗證，不放在公開程式碼中；原助教管理碼不包含在套件中。學生公開課堂碼已固定設定，介面不會要求填入。

## Imager 查核紀錄

2026-10-15 實際查詢官方軟體頁：Windows 下載連結 imager_latest.exe 轉向 imager_2.0.12.exe，Last-Modified 為 2026-10-08。
同時讀取 v2.0.12 原始碼的 Hostname／Locale／User／Wi-Fi／Remote Access／Pi Connect／Writing 相關 QML，核對欄位與操作順序。
本環境沒有直接啟動 Windows 安裝程式。圖片取自官方現行文件，為官方介面範例，不是本次自行操作 Windows 所截。

已補上：Capital city 影響無線地區、Time zone／Keyboard layout、Wi-Fi Secure network／Confirm password／Hidden SSID、SSH 開關與密碼驗證、Connect、Writing Summary、清除警告與完成驗證。
介面語言及 OS 提供的條件式選項可能不同；網站使用繁體中文說明與英文欄位對照。官方圖中的 Jay／London／Pi Towers／磁碟名稱是例子，不代表課堂值；各步已明確提示。SSH 官方圖是關閉狀態，課堂步驟要求開啟。

## 驗證範圍

JavaScript 語法、26 個學生排查節點、14 個刷機步驟、AI 預覽與返回、組別切換、同步資料白名單、裝置識別、自動回報及助教看板模擬已通過。
已對使用者指定 Supabase 完成學生加入、回報寫入、助教讀取、錯誤管理碼拒絕、錯誤裝置憑證拒絕及過期回報不覆寫等真實 API 測試。測試在獨立課堂執行，已在正式 GitHub Pages 手動加入並測試第 9 組回報；本次修正需上傳新版檔案後進行前端驗收。未使用實體手機或 Pi 測試。

## 官方來源

- https://www.raspberrypi.com/software/
- https://github.com/raspberrypi/rpi-imager/releases/tag/v2.0.12
- https://www.raspberrypi.com/documentation/computers/getting-started.html
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/getting-started/api-keys

課堂設定依先前提供的樹莓派 5 講義；仍採有桌面 64-bit、.local 優先與各組手機熱點。
