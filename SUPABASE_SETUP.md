# 課堂同步與組數設定

目前專案已完成清除紀錄與組數設定升級；本版上傳網站後即可使用，不需重跑 SQL。

課堂的 group_count 預設 9，支援 1～99。公開 pi_helper_group_settings 只回傳可開放課堂的組數；關閉／到期課堂需有效助教密碼才能讀取。pi_helper_teacher_set_group_count 在核對助教密碼後才修改組數。學生回報以資料庫目前組數驗證，不能只改前端就回報超出範圍的組別。

減少組數不刪歷史回報，也不重設課堂帳密、期限或開關。清除全部範圍仍會隱藏該課堂所有舊組別回報；學生繼續回報會重新顯示。

新專案執行最新版 setup.sql，再建立一次課堂。既有其他專案先完成清除功能，再以 update-group-count.sql 作最後一步。不要在最新組數升級之後套用歷史 SQL，以免覆寫新函式。

config.js 只能放公開 URL、publishable key 與課堂碼，不可填 secret key、service_role 或任何密碼。
