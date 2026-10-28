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
