# 實際操作圖片來源

本站使用上游專案的真實軟體畫面，不是重新繪製的介面。圖片放在本站，採無損 WebP 格式，避免依賴外站載入。沒有修改圖中的欄位、帳號或目標；本組資料以網站上的動態文字為準。

- `raspi-config.webp`：Raspberry Pi 官方文件，commit `ddea98e98dafe9419feb4fd82710c2fbdef7dc44`，`documentation/asciidoc/computers/configuration/images/raspi-config.png`。原始 1568×954。授權全文見 `LICENSE-RASPBERRY-PI.md`（CC BY-SA 4.0）。來源：https://github.com/raspberrypi/documentation/blob/ddea98e98dafe9419feb4fd82710c2fbdef7dc44/documentation/asciidoc/computers/configuration/images/raspi-config.png
- `windows-rdp.webp`：neutrinolabs/xrdp 官方連線示範，gh-pages commit `572cbc4823a745f2f620cbcadf838ab67f00410f`，`xrdp_demo.gif` 的 0 秒影格。原始 800×615；只擷取影格及無損轉換格式。畫面來自舊版 Windows；Computer 欄位的用途相同，本站明列本組 `.local` 目標，不能照抄示範 IP。來源：https://github.com/neutrinolabs/xrdp/blob/572cbc4823a745f2f620cbcadf838ab67f00410f/xrdp_demo.gif
- `xrdp-login.webp`：neutrinolabs/xrdp 官方文件，commit `5943357a546a24f3dc3781ccfd853e5dd24d6fcc`，`docs/images/lvgl-login.png`。原始 1055×768。這是官方選用的 LVGL 登入介面，並非本課堂 Pi 的實機截圖；部分版本使用灰底登入視窗。圖片用來辨認 Xorg、Username、Password 欄位，網站明列本課程帳密，不能照抄圖中的示範帳號。來源：https://github.com/neutrinolabs/xrdp/blob/5943357a546a24f3dc3781ccfd853e5dd24d6fcc/docs/lvgl.md

xrdp 專案授權全文見 `LICENSE-XRDP.txt`（Apache-2.0）；Windows 與 Raspberry Pi 商標及介面分別屬於原權利人。取得日期：2026-10-17（臺灣時間）。

## 三段 X11 選單對照（2026-10-17）

`raspi-main.webp`、`raspi-advanced.webp`、`raspi-x11.webp` 是依 RPi-Distro/raspi-config 官方程式 commit `293f4bb0bfe0efba41b0a8260b52b161239f2a33` 的三段選單指令取得的操作畫面範例。來源：https://github.com/RPi-Distro/raspi-config/blob/293f4bb0bfe0efba41b0a8260b52b161239f2a33/raspi-config

在隔離的 Linux 環境只執行上游的 whiptail 選單顯示指令（主選單、`do_advanced_menu` 的 Pi 5 分支、`do_wayland`），不執行設定寫入或硬體操作。使用 whiptail/newt 0.52.25 顯示，110×30 字元終端機，以 xterm.js 渲染實際終端輸出後用 Chromium 擷取 1191×630 圖片，再無損轉為 WebP。依序反白 Advanced Options、Wayland、X11，沒有重畫或改寫選單內容。這是選單操作教學擷取，不是本課堂樹莓派的實機截圖；網站將其標示為「操作畫面範例」，不同版本依選項名稱找。

raspi-config 授權為 MIT，全文見 `LICENSE-RASPI-CONFIG.txt`。舊的單張 `raspi-config.webp` 保留供舊快取相容，本版 X11 教學改用上述三張。
