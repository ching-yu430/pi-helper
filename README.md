# 樹莓派 5 課堂小幫手

給第一次接觸 Raspberry Pi 的學生使用的繁體中文教學網站。先選組別，再跟著刷機、SSH 與遠端桌面的步驟操作；每次下課前另做正確關機。老師可指定教學階段，助教可接收、接手並追蹤求助。

[開啟課程首頁](https://ching-yu430.github.io/pi-helper/) · [更新紀錄](CHANGELOG.md) · [課前實機驗收](docs/CLASSROOM_CHECKLIST.md)

![課程首頁與組別選擇](assets/screenshots/course-home.png)

教學使用 Windows 筆電、Raspberry Pi 5 與各組手機熱點。Mac／Linux 使用者先請助教確認工具。Python、USB 相機及辨識課程目前僅提供待公布入口。

## 本機啟動

網站是原生 HTML、CSS、JavaScript，不需建置或安裝前端套件。使用 Python 3 與 Node.js 22 以上：

```sh
python3 -m http.server 8001 --bind 127.0.0.1
```

瀏覽器開啟 `http://127.0.0.1:8001/`。課堂組別、共用求助和老師指定步驟需要 Supabase；網路失敗時首頁會顯示重試與找助教提示，連線排查及靜態關機說明仍可閱讀。

## 部署 GitHub Pages

1. 將網站完整推送至 GitHub，保留 `assets/` 與 `.nojekyll`。
2. 儲存庫 **Settings → Pages** 選擇 **Deploy from a branch → main → / (root)**，儲存並等待 Pages 部署成功。
3. 新 Supabase 專案先執行下節安裝，再將 Project URL、publishable key（或 anon key）、公開課堂碼填入 [config.js](config.js)。既有部署沿用原設定。
4. 開啟課程首頁測試選組，用私下保管的密碼登入工作台，確認課堂開放及截止時間，再驗證求助、接手、學生確認與老師帶課。

`config.js` 只放公開連線資料。管理員密碼、service_role、secret key 與資料庫密碼不可提交 Git。工作台入口是首頁的 ⚙️；帳號管理在登入後的課堂設定。

## SQL 安裝與執行順序

在 Supabase SQL Editor 執行 [supabase/install.sql](supabase/install.sql)。新安裝與既有專案升級使用同一份檔案；它會依序執行尚未完成的 migration，整批成功才提交，並保留課堂、帳號及回報。請先備份正式資料庫。

只在**建立新課堂**時，接著執行 [supabase/create-classroom.sql](supabase/create-classroom.sql) 一次，保存輸出的管理員密碼，將學生課堂碼填入設定。升級既有課堂時不要執行建課檔。

來源集中在 [supabase/migrations/](supabase/migrations/)，編號為唯一順序：001 基礎 → 002 期限 → 003 課堂開關 → 004 回報 → 005 密碼 → 006 清除 → 007 組數 → 008 課堂功能 → 009 個人帳號 → 010 看板清除 → 011 暫停提示 → 012 健康檢查。

安裝檔會記錄版本及 SHA-256 校驗碼，重跑會跳過已完成的版本，拒絕內容不符或較舊的安裝檔。日後以**新增編號 migration**升級，不修改已發布的來源。產生與檢查安裝檔：

```sh
node scripts/build-sql.cjs
node scripts/build-sql.cjs --check
```

[完整資料庫說明](docs/SUPABASE_SETUP.md) · [健康檢查排程](docs/SUPABASE_HEALTH_CHECK.md)。本次檔案整理沒有替正式資料庫執行 SQL。

## 測試

快速檢查不需額外套件：

```sh
node tests/run-tests.cjs
node scripts/build-sql.cjs --check
```

資料庫測試使用隔離的 PGlite，不寫入正式課堂：

```sh
npm install --prefix /tmp/pi-test @electric-sql/pglite@0.5.10
export PGLITE_ROOT=/tmp/pi-test/node_modules/@electric-sql/pglite
node tests/run-install-sql.cjs
node tests/run-learning-sql.cjs
node tests/run-workbench-sql.cjs
node tests/run-presenter-sql.cjs
```

瀏覽器測試另需 Playwright 與 Chromium，並保持本機伺服器運行：

```sh
npm install --prefix /tmp/pi-test playwright@1.62.1
export NODE_PATH=/tmp/pi-test/node_modules
export PI_HELPER_TEST_URL=http://127.0.0.1:8001/
node tests/run-home-fallback-browser.cjs
node tests/run-clear-board.cjs
node tests/run-teacher-follow-browser.cjs
node tests/run-projection-browser.cjs
node tests/run-presenter-tools-browser.cjs
```

瀏覽器腳本預設 `/usr/bin/chromium`；新入口測試也接受 `CHROMIUM_PATH`。可由系統套件管理員安裝 Chromium。測試涵蓋斷線／逾時／重試、組別延遲回應、老師指定步驟、求助流程、圖片標記和全螢幕版面。每次 push 與 PR 都會由 [Website checks](.github/workflows/tests.yml) 執行快速檢查、SQL bundle 檢查及隔離安裝測試。

自動測試不能代替實體裝置驗收。正式上課前請依 [實機清單](docs/CLASSROOM_CHECKLIST.md)，使用真實手機、Windows 筆電及 Pi 5 走完整流程。

## 文件與授權

- [教材圖片來源](docs/SOURCES.md)、[Imager 圖片](assets/imager/SOURCES.md)、[操作圖片與素材授權](assets/operations/SOURCES.md)。
- [歷史驗證紀錄](docs/AUDIT.md) 與 [更新紀錄](CHANGELOG.md)。
- [GitHub About 建議設定](docs/GITHUB_ABOUT.md)。

目前尚未選定程式碼開源授權，暫不新增 LICENSE；公開儲存庫不代表已授予自由再利用權利。第三方圖片沿用各自來源與授權說明。
