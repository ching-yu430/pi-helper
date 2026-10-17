# GitHub About 設定

本次環境呼叫 GitHub REST／GraphQL API 均回傳 Forbidden，無法更新儲存庫 About；Git push 可正常使用。

具儲存庫管理權限的人可在 GitHub 儲存庫首頁的 About 齒輪填入 [.github/repository.json](../.github/repository.json) 中的 description、homepage 與 topics。這份 JSON 僅保存待套用設定，不會自動修改 GitHub。

Website checks 已放入 `.github/workflows/tests.yml`，每次 push、PR 或手動啟動均執行；是否成功請至儲存庫 Actions 頁面確認。
