# 樹莓派 5 連線小幫手 — 學生自助版

更新日期：2026-10-15。

## 更新現有 GitHub Pages

1. 先解壓縮 ZIP。
2. 將 `index.html`、`assistant.html`、`.nojekyll`、`README.md` 上傳至原 GitHub 儲存庫的最外層。
3. 覆蓋原有 `index.html` 並提交變更。保留 `assistant.html`，學生版求助頁會連到它。
4. 等待 Pages 部署完成，再重新整理網站。若原本已設定 main 的 /(root)，不必重新設定。
5. 學生使用原本的首頁網址；助教版網址為首頁網址後面加上 `assistant.html`。

## 本次改版

- 首頁選組別即可開始；帳號與已確認 IP 放在其他設定。
- 優先使用 .local，名稱解析失敗才引導查 IP。
- 一次顯示一個步驟及相關結果選項；可回上一步、重新開始。
- 複製指令不代表已執行，需自行回報實際結果。
- 金鑰異常、忘記帳密、服務故障等情況交助教，不引導學生自行重刷或刪金鑰。
- 可貼上回覆、複製排查紀錄給助教；AI 提示詞放在求助頁的展開區。
- 學生版紀錄只保留在目前頁面記憶體，重新整理會清除，不會自動送給助教或 AI。
- 修改組別後重新開始會清除本次流程紀錄。
- 原本完整工具保留為 assistant.html。

## 驗證範圍

已檢查程式語法、26 個學生流程節點、SSH 與遠端桌面成功路徑、IP 驗證、求助紀錄與重設。
尚未用實體手機或真實樹莓派測試這份學生介面。
兩個網頁均無需建置、資料庫或 API 金鑰。

## 使用 GitHub 網站上傳與部署

1. 先解壓縮 ZIP，不要只把 ZIP 本身上傳到 GitHub。
2. 登入 GitHub，建立儲存庫，名稱可用 `pi-ssh-helper`。使用免費方案時，選擇 **Public**。
3. 在儲存庫頁面選 **Add file → Upload files**；新建空儲存庫也可使用 **uploading an existing file**。
4. 上傳解壓縮後的 `index.html`、`.nojekyll`、`README.md`，並提交變更（**Commit changes**）。
5. 確認 `index.html` 直接位於儲存庫最外層，不要再包在 `github-pages-export` 或其他資料夾內。
6. 若上傳介面沒有顯示 `.nojekyll`，可用 **Add file → Create new file** 建立同名檔案；內容可留空或填一行註解後提交。
7. 開啟 **Settings → Pages**。
8. 在 **Build and deployment → Source** 選 **Deploy from a branch**。
9. **Branch** 選 `main`，資料夾選 **/(root)**，按 **Save**。若你的預設分支名稱不同，選擇實際存放這些檔案的分支。
10. 等待部署完成。可在 **Actions** 查看 `pages build and deployment` 的執行狀態；完成後回到 **Settings → Pages** 開啟顯示的網站網址。
11. 一般專案網址格式為 `https://你的GitHub帳號.github.io/pi-ssh-helper/`；以 Pages 顯示的實際網址為準。
12. 將網站網址分享給其他助教，手機與電腦都能開啟，不需登入判斷器。

## 日後更新

修改 `index.html`，上傳覆蓋儲存庫中的同名檔案並提交。Pages 完成部署後重新整理網頁。通常不需要重新設定 Pages；若仍看到舊內容，可在電腦按 Ctrl+F5。

## 本機檢視

可直接開啟 index.html。正式分享建議使用 GitHub Pages 的 HTTPS 網址。
手機網頁不會替電腦執行指令，指令須在標示的 Windows PowerShell 或樹莓派 SSH 執行。

## 官方文件

https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
