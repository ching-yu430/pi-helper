# v4 驗證紀錄

本版恢復每組幫助與返回首頁，增加醒目的本組刷機設定，提供受助教密碼保護的 1～99 組設定與跨裝置同步。

392 項程式／DOM 模擬檢查通過。正式 Supabase 已套用 pi_helper_configurable_group_count 升級；臨時課堂以 anon 角色測試組數讀取、99 組回報、減少組數後保留歷史、拒絕超出範圍及錯誤助教密碼，全部通過並回滾。正式設定維持 9 組，原有 2 筆課堂、7 筆回報與密碼／期限均未改動。

安全掃描仍回報既有架構的注意事項：私有表啟用 RLS 且沒有直接讀寫政策；公開 RPC 為 SECURITY DEFINER，函式內檢查助教密碼或 session secret。新設定 RPC 只允許 anon 角色呼叫，不授權直接存取私有表。共享密碼仍無個人稽核與登入限流。

[公開函式權限檢查說明](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)

本次沒有真實瀏覽器排版、實體手機或 Pi 驗證，未推送 GitHub。
