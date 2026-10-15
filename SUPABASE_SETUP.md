# Supabase 設定與升級

## 既有課堂

config.js 已帶有原套件的 Supabase URL、publishable key 與公開學生課堂碼。本次保留設定，但沒有讀取或修改正式資料庫，無法斷言原課堂目前是否開放、到期或已套用哪些 SQL。

若原助教看板可正常登入，只需執行 supabase/update-report-fairness.sql 取得每組最近 20 筆的讀取行為。若缺少課堂設定／密碼函式，先檢查現有函式，必要時套用 supabase/update-password-length.sql，再套用 update-report-fairness.sql。不要重新建立既有課堂。較舊的 update-expiry.sql、update-single-class.sql 僅供歷史參考，不應在新版之後執行，以免覆寫新版函式。

## 全新 Supabase 專案

1. 在 SQL Editor 檢查並執行 supabase/setup.sql，建立專用 schema、資料表及 RPC。
2. 檢查 supabase/create-classroom.sql，執行一次。預設截止時間為建立後 30 天。
3. 將輸出的學生課堂碼填入 config.js 的 defaultRoomCode，專案 URL 與 publishable key 分別填入 supabaseUrl / supabaseKey。助教管理碼只私下保管，作為首次登入密碼。
4. 重新部署所有網站檔案，再以學生及助教兩端測試。

不可把 secret key、service_role、資料庫密碼或助教密碼寫入 GitHub 或前端。公開 publishable key 本身不是使用者驗證；資料隔離依賴資料庫權限及每個 RPC 的檢查。

## 操作與資料

學生選組後開始排查，會送出組別、階段、步驟、選項／求助原因與狀態，畫面開啟時每 15 秒另送當前狀態。原始輸出與 AI 提示詞不自動送往 Supabase；同步選項中的 IPv4 另以占位文字遮蔽。AI 提示詞可能含使用者自行貼上的內容，複製前仍須自行檢查。

sessionStorage 保存每個課堂／組別的裝置 session、secret 與 revision。同一分頁重新整理會沿用；重設會結束舊 session 並在下次操作建立新紀錄。切組會盡力送出舊組結束狀態；網路失敗仍可能留下舊紀錄，因此看板另標記暫無更新。關閉瀏覽器不保證能送出結束訊息。

助教密碼只保存在頁面記憶體，登入後看板每 5 秒更新。每組最近 20 筆，60 秒內求助優先，其他裝置可展開查看。處理中／求助超過一分鐘未更新會列為「暫無更新」，不能據此認定 Pi 離線。

截止日期儲存為臺灣時間當天 23:59:59；調整日期與開關分開。關閉課堂停止學生回報，助教仍可查看與設定。已開著的學生頁面在重新開放後會於後續回報恢復。關閉看板只登出本頁，不會關閉課堂。

密碼變更沿用原套件 SHA-256 後 bcrypt 的相容格式。請使用足夠強度的獨立密碼；目前沒有忘記密碼寄信、個別助教登入或登入限流。本次沒有變更正式密碼。

## 驗收

先執行 node tests/run-tests.cjs。上線後以兩個瀏覽器或手機／電腦測試：學生操作、助教收到正確組別、求助與完成狀態、組別切換、重設、斷網重試、錯誤密碼、日期與課堂開關。正式課堂測試會留下回報，請先與課堂管理者協調測試時段與組別。

若需真正雙向文字互動，見 AUDIT.md 的後續架構建議。
