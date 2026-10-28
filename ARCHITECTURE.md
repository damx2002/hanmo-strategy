# 架構與驗證

React 19、strict TypeScript、Vite 7、原生 CSS、SVG、Vitest；npm lockfile 固定相依套件。無網路執行時相依，無後端。

## 模組

- `src/data/scenario.ts`：三國、12 城、30 將、雙向路網、純函式開局。
- `src/engine/types.ts`：以 ID 關聯的 GameState、指令聯集及結果型別。
- `balance.ts`：成本、成長、月結與戰鬥係數。
- `actions.ts`：唯一指令入口，驗證後複製再修改；失敗返回相同原狀態。
- `combat.ts`、`rng.ts`：戰力預估、seeded LCG、傷亡計算。預覽不耗種子。
- `economy.ts`：單城月入、消耗、缺糧逃兵。
- `ai.ts`：以相同指令入口執行規則式 AI。
- `turn.ts`：AI 順序及月結；`game.ts`：事件與勢力／勝敗清理。
- `save.ts`：序列化、版本及結構驗證、LocalStorage 安全讀寫。
- `src/app/App.tsx`：畫面階段與狀態提交、自動存檔、月結互斥。無核心戰鬥公式。
- `src/components/`：地圖、城市、武將、指令與確認窗、戰報。Header、事件及終局為 App 中的輕量視圖。
- `src/styles/game.css`：低飽和墨綠古銅介面、SVG 城池和山河；手機地圖內部捲動／縮放、可收合武將、限制彈窗尺寸、減少動態偏好。

規則函式都接受資料並返回資料；只有 `saveGame`、`loadGame` 接觸瀏覽器。事件使用遊戲年月；不依系統時間。指令不信任 UI 的輸入限制，會再次檢查。

## 測試

```sh
npm ci
npm run typecheck
npm run test
npm run build
```

`src/tests/engine.test.ts` 涵蓋資料／圖連通、所有內政、失敗不可變性、行動限制、調動守恆、出征限制、固定種子勝敗與占領、傷亡界線、能力影響、AI 限制及調兵、經濟、跨年、終局清理、三國長期模擬與存檔拒絕損壞資料。`campaign.test.ts` 另以初始劉備劇本、固定種子及一般玩家指令實際進行發展、調兵、攻城及 AI 月結，驗證能完成統一十二城。測試不灌入資源或修改城池歸屬。參數化測試各自計數。

瀏覽器人工／自動驗收應走：劉備開局 → 成都開墾 → 重新載入繼續 → 30 將總覽 → 月結 → 漢中調動趙雲至襄陽 → 下一月選趙雲率兵攻宛 → 確認戰報 → 檢查兵數和易主 → 再載入。也要測試 412×915（Galaxy S25 Ultra 常見 CSS viewport）、915×412、360×800，確認畫面不水平溢出、地圖內可捲動、彈窗可捲動。

## 發布

base 固定 `/hanmo-strategy/`；無路由庫與動態路由 fallback 需求。`index.html` 以相對該 base 的 hashed JS/CSS 載入。`dist/` 是唯一發布產物。GitHub Pages workflow 每次部署先 `npm ci`、型別、測試、建置，任一步失敗不部署。遠端啟用 Pages 與操作步驟見 README。

### 可選瀏覽器回歸

`scripts/browser-smoke.cjs` 保留實際操作流程，使用獨立瀏覽器 context，不讀使用者存檔。需要另行提供 Playwright 模組及 Chromium（不屬於遊戲執行需求）。在另一終端啟動 `npm run dev` 後：

```sh
npm install --prefix /tmp/hanmo-browser-tools playwright
PLAYWRIGHT_MODULE=/tmp/hanmo-browser-tools/node_modules/playwright CHROMIUM_PATH=/usr/bin/chromium node scripts/browser-smoke.cjs
```

若 Chromium 路徑不同，請設定 `CHROMIUM_PATH`。`GAME_URL` 可改為本機 production preview 的完整子路徑。腳本包含地圖選城、開墾、讀檔、30 將、調兵守恆、趙雲出征與實際兵損、戰後復原、損毀存檔刪除後開局、結束月份雙擊互斥、412×915／915×412／360×800 無水平溢出及彈窗邊界。截圖寫入 `/tmp/hanmo-*.png`。
