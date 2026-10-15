# 課堂同步設定

目前網站專案已完成 update-classroom-tools.sql 升級，本次精簡介面不用再次執行 SQL。

config.js 保留原有公開 Supabase URL、publishable key 與課堂碼。不可填入 secret key、service_role、資料庫或助教密碼。

## 新專案才需要初始化

先檢查並執行 supabase/setup.sql，再執行 create-classroom.sql 一次，將學生課堂碼填入 config.js，助教碼私下保管。既有課堂不要重建。

## 資料行為

學生送出組別、步驟、選項、狀態與時間，不自動送出原始輸出與 AI 提示詞。前景操作後立即回報，另約每 15 秒同步；助教看板約每 5 秒更新，每組最多取最近 20 筆。超過一分鐘未更新會標示暫無更新。

助教清除採 cleared_at 隱藏；之後學生持續回報會重新顯示。下課要清空可先關閉課堂再清除。清除不會修改 Pi 檔案、帳密或課堂設定。

助教密碼只存於頁面記憶體，登出會清空。現有架構使用共享密碼與 RPC 驗證，未提供個人帳號或登入限流。

## 升級歷史

新部署已包含 update-classroom-tools.sql。歷史 update-expiry.sql、update-single-class.sql 不應在新版之後套用，以免覆蓋目前函式。
