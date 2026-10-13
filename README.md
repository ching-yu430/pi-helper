# SSH 錯誤即時判斷器

Raspberry Pi 5 課堂使用的繁體中文排查工具。GitHub Pages 匯出版本：2026-10-13。

## 檔案

- `index.html`：完整網頁、樣式、排查資料及互動程式。所有功能均包含在這一個檔案。
- `.nojekyll`：讓 GitHub Pages 直接發布靜態檔案。
- `README.md`：本部署說明。

不需安裝 Node.js、套件或資料庫，不需 API 金鑰。AI 提示詞功能是複製文字，再由助教自行貼到 AI 對話。

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

## 已包含功能

- 組別與登入目標設定、.local 優先與 IP 備援方式。
- SSH／安裝與遠端桌面階段、依實際結果接續判斷。
- 可點選整張結果卡片、分開呈現回覆範例與解釋。
- 指令執行位置與修改影響標示。
- 預設收合的選填執行結果欄、包含實際回覆的 AI 提示詞。
- 「以上皆不符合」直接定位到複製 AI 提示詞按鈕。
- 右側固定重設按鈕、底部導覽目前位置提示。
- 側邊刷機流程與完成後續指引。
- 已移除本次指定的兩段文字，並避免留下空白提示框。

## 資料與使用範圍

網頁不直接連線樹莓派或執行指令；指令仍由學生在指定位置執行。組別、帳號與 IP 設定可能保存在目前瀏覽器；執行結果與排查紀錄保留在目前頁面的記憶體，重新整理可能清除。複製提示詞不會自動送給 AI。

新 GitHub 網址與原網站的瀏覽器儲存空間不同，原有設定不會自動搬過去。這份檔案未包含任何使用者填寫的排查紀錄。

可用電腦直接開啟 `index.html` 檢視；正式使用建議開啟 Pages 的 HTTPS 網址，讓剪貼簿功能正常運作。若瀏覽器拒絕剪貼簿權限，依畫面提示手動複製。

這是可公開讀取的靜態程式；知道網址的人可使用，原始碼也可被檢視。不要把私人密碼或金鑰寫進程式。網址不是保證永久服務；刪除儲存庫、停用 Pages、變更帳號或儲存庫名稱、部署失敗或帳號限制，都可能影響存取。

## 部署問題

- 出現 404：確認檔名是小寫 `index.html`，位於選定分支的根目錄，Pages 資料夾為 `/(root)`，並確認 Actions 部署成功。
- 只看到 ZIP 或 README：檢查是否忘記解壓縮，或 `index.html` 放在多一層的資料夾。
- 改檔後未更新：確認提交至 Pages 選定的分支，再查看 Actions 狀態。

## 官方文件

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
