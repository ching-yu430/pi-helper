# Supabase 輕量資料庫健康檢查

GitHub Actions：`.github/workflows/supabase-health.yml`。
每 8 小時執行（UTC 00:17／08:17／16:17；台北 08:17／16:17／00:17）。
支援 Actions 頁面的 **Run workflow**；main 上修改本 workflow 時也會自動測試。

## 最小權限

透過 HTTPS POST 呼叫 `public.pi_helper_health_check()`，實際進入 Postgres，只回傳布林值 `true`。
函式為 `SECURITY INVOKER`、空 search_path、無參數、VOLATILE，無資料表查詢或資料寫入。
明確撤銷 PUBLIC、authenticated、service_role 的執行授權，只授予 anon。
不使用課堂碼、學生工作階段、助教密碼、學生資料或資料筆數。

使用 config.js 原已公開的 publishable key；它不是管理金鑰，因此此方案不需要 Actions secrets。
不得改用 service_role、sb_secret、Supabase access token 或資料庫密碼。
現有 GitHub 連接器不支援 secrets 管理；未查詢或變更現有 secrets。
若將來輪替 publishable key，須同步更新此 workflow 與 config.js。

工作使用空 GITHUB_TOKEN 權限，不 checkout 程式碼、不使用第三方 action 或額外套件。
每次連線逾時 20 秒，最多三次嘗試，整個工作上限三分鐘。
只記錄成功／失敗；不記錄 API 回應內容、headers 或錯誤細節；拒絕 HTTP redirect。

## 資料庫部署與移除

此專案已透過 Supabase migration `add_isolated_health_check` 部署。
`supabase/health-check.sql` 是該單次 migration 的來源，不需要重跑 setup.sql。
移到其他專案時必須重新檢查 URL、key 與函式權限。

停用：在 Actions 中停用 workflow，或刪除 workflow 檔。
若需完整移除，由管理員執行 `drop function public.pi_helper_health_check();` 並通知 PostgREST reload schema。
不需修改或刪除任何課堂資料。

## 限制與維護

這是降低閒置暫停風險的 best-effort 機制，不保證 Supabase 不會暫停。
專案暫停、API key 輪替、網路／服務故障或 GitHub 排程中斷都可能造成失敗。
GitHub 排程可能延遲；公開儲存庫連續 60 天無活動時，排程 workflow 會自動停用。
請留意 Actions 失敗通知與 Supabase 暫停通知，並定期確認 workflow 仍啟用。
此 workflow 不會自行提交變更來製造儲存庫活動，也不會自動恢復已暫停的專案。

官方說明：
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
