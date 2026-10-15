# 樹莓派 5 課堂連線小幫手

學生自助排查、刷機圖解與助教看板；HTML / CSS / JavaScript 可直接放在 GitHub Pages，跨裝置同步由 Supabase RPC 提供。

## 這次調整

- 新增 responsive.css，統一手機觸控、窄螢幕表單、刷機按鈕、安全區與工具列留白；修正助教刷機入口與頁首可能互相遮擋。
- 排查工具不再依賴助教登入；全班紀錄與管理操作仍由資料庫驗證密碼。
- 看板增加「暫無更新」，超過一分鐘未更新的處理中／求助回報不再計入活躍狀態。
- 切換組別時結束上一組的裝置紀錄；同步佇列依 session 保留待送資料，避免換組或重設時結束訊息被覆蓋。
- 同步內容額外遮蔽 IPv4；原始輸出仍只用於本機 AI 提示詞。
- 重新整理看板不覆蓋尚未儲存的截止日期；助教權限失效時清除看板。
- 公開金鑰檢查、逾時／限流提示、首次導覽記憶與減少動態效果支援。
- 新增每組保留最近 20 筆的看板讀取函式，避免單組擠掉其他組。

## 部署到既有 GitHub Pages

1. 將本資料夾的網站檔案與 assets/ 原樣覆蓋到儲存庫根目錄；保留 .nojekyll。新增的 responsive.css 也必須上傳。
2. 保留 config.js 的現有公開連線設定；若換 Supabase 專案，依 SUPABASE_SETUP.md 設定。
3. 在 GitHub Settings → Pages 確認部署來源為放置檔案的分支與根目錄，等待部署成功。所有本機資源使用相對路徑，適用儲存庫子路徑。
4. 既有課堂若已有原本函式，可在 Supabase SQL Editor 執行 supabase/update-report-fairness.sql，更新看板讀取邏輯。此檔不刪資料、不改密碼、不建立課堂；此處未代為執行。
5. 開啟學生 index.html 與助教 assistant.html，以兩個瀏覽器驗收同步、登入、手機排版與課堂設定。

此交付為本機修改套件；未連接 GitHub 帳戶，也未推送或部署網站。不要在正式課堂反覆執行 create-classroom.sql。

## 目前功能邊界

目前同步為學生回報、助教讀取與課堂開關控制，尚未提供助教文字回覆、學生收訊或已讀確認。若「雙向」指即時對話，需要另加訊息資料表、以學生 session secret 驗證的讀取 RPC、助教寫入 RPC 與學生收訊介面，詳見 AUDIT.md。

學生課堂碼為公開值，無法證明回報者確實屬於該組；適合受控課堂輔助，不適合作為點名、成績或正式身分紀錄。統一助教密碼也不提供個別助教身分與稽核。

## 本次驗證

在專案根目錄執行：

~~~sh
node tests/run-tests.cjs
~~~

121 項檢查通過，包含 JavaScript 語法、相對資源、學生流程連結、14 步刷機圖片、輸入驗證、同步切組佇列、IP 遮蔽、助教看板與登出等 DOM 模擬。測試不需要安裝套件，且不向正式資料庫發送測試資料。

本次環境沒有可用的預覽瀏覽器，未完成瀏覽器畫面／手機截圖驗證、實體手機與 Pi 測試、正式 Supabase 或 SQL 實機驗證。原套件先前宣稱的雲端測試不作為本次已驗證證據。

## 官方參考

- [GitHub Pages](https://docs.github.com/en/pages)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Raspberry Pi 官方下載](https://www.raspberrypi.com/software/)

Imager 圖片與教學內容沿用原套件，來源見 assets/imager/SOURCES.md；本次未重新核對所有 Imager 版本欄位或課堂講義。課堂固定帳密請依實際教學要求確認。
