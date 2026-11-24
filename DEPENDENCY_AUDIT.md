# V0.1.1 依賴稽核（2026-10-28）

實際執行 `npm audit --json` 與 `npm audit --omit=dev --json`，不是依安裝提示推定。

| 受影響套件     | V0.1.0 安裝版 | 稽核嚴重性 | 類別與處理                                    |
| -------------- | ------------- | ---------- | --------------------------------------------- |
| @vitest/mocker | 3.2.7         | moderate   | Vitest 間接開發依賴；升至 4.1.12              |
| tinypool       | 1.1.1         | critical   | Vitest 間接開發依賴；新工具鏈不再依賴，已移除 |
| vitest         | 3.2.7         | critical   | 直接開發依賴，含傳遞風險；升至 4.1.12         |

原報告總數 3（1 moderate、2 critical），指受影響套件數，不是三個獨立漏洞。正式執行依賴 React／React DOM 的 omit-dev 報告在更新前即為 0。

- mocker：路徑穿越／任意檔案讀取（[GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)），及未認證 mock 註冊導致程式碼注入（[GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8)）。
- tinypool：worker/run options 的 prototype pollution gadget 可導致程式碼執行（[GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)、[GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)）。

這些問題位於測試／開發工具鏈，沒有打包至 Pages 遊戲的正式執行依賴；不代表開發環境可忽略風險。此次人工查核 npm registry 的 engines、peerDependencies 與公告修補範圍，選擇較小的 4.1.12 升級，支援現有 Node 24、Vite 7，沒有使用 `npm audit fix --force`，也沒有升級 React 或 Vite。

更新後完整 audit 與 omit-dev audit 的 info／low／moderate／high／critical **全部為 0**；`package-lock.json` 已更新，已以 npm ci 重裝、型別檢查、48 項既有及新增測試、正式建置重新驗證。這是當日 npm 公告資料下的結果，不代表未來不會出現新公告。

重查指令：

```sh
npm ci
npm audit
npm audit --omit=dev
npm run typecheck
npm run test
npm run build
```

## V0.2.0 重驗

未新增執行或測試相依套件，lockfile 僅更新應用版本。再次執行 npm ci、npm audit 及 omit-dev audit，完整與正式依賴均 0 漏洞；77 項測試、型別及正式建置均通過。

## V0.2.1 重驗

新增僅開發用 playwright-core 1.64.1（Node ≥20，現用Node24），用於CI Chromium smoke；不下載瀏覽器、不加入正式遊戲依賴。npm ci 重裝後，npm audit 與 omit-dev audit 皆為0漏洞。97項測試、型別及正式建置通過；CI以hosted Ubuntu預裝Chrome執行真實UI smoke後才發布。

## V0.2.2 重驗（2026-10-28）

未新增或升級任何專案套件；package-lock僅改應用版本。執行npm ci後再次查npm audit --json及npm audit --omit=dev --json：info／low／moderate／high／critical均0，正式依賴與開發工具分別確認。119項測試、strict TypeScript、production build通過，保留playwright-core Chromium CI。不使用audit fix --force。

## V0.2.3 重驗（2026-10-29）

沒有新增專案依賴，lockfile只更新版本。實際npm ci、npm audit及npm audit --omit=dev均通過，完整與正式依賴0漏洞；157項測試、型別與建置通過，沿用playwright-core與CI系統Chrome。

## V0.3.0 候選版重驗（2026-10-29）

沒有新增／升級套件，package-lock只改應用版本至0.3.0。乾淨`npm ci --cache /tmp/hanmo-npm-cache`成功；實際`npm audit --json`與`npm audit --omit=dev --json`的info／low／moderate／high／critical全部0。React／React DOM為正式依賴，Vite／TypeScript／Vitest／playwright-core為開發工具；沒有使用audit fix --force。稽核結果只代表當日公告資料。
