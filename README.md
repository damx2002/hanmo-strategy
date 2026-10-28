# 《漢末群雄志》V0.1.0

繁體中文、原創 SVG 山河的單機回合制策略遊戲。214 年「群雄對峙」架空劇本，選擇曹操、劉備、孫權，經營十二城、指揮三十名武將，直到統一天下或領土盡失。

## 執行

需要 Node.js 24（建議）與 npm 11。無後端、帳號、API 或額外服務。

```sh
npm ci
npm run dev
```

Vite 設定子路徑 `/hanmo-strategy/`，請開啟終端顯示的完整路徑。

```sh
npm run typecheck
npm run test
npm run build
npm run preview
```

`npm run test` 使用 Vitest 執行既有測試；`build` 先檢查 strict TypeScript，再輸出至 `dist/`。本機驗證結果及設計見 [GAME_DESIGN.md](GAME_DESIGN.md) 與 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 玩法

1. 選擇諸侯；已有存檔時可繼續，或確認刪除後開新局。
2. 點擊地圖城池查看資源、經濟、五項城池能力和武將。地圖上下左右可捲動，右上角可縮放；鍵盤 Tab、Enter 也能選城。
3. 己城可執行開墾、商業、徵兵、訓練。先選武將再執行。每城每月最多三令，每將每月一動。
4. 「調動」可讓一名武將攜兵與糧移往相鄰友城。保留五百守軍；武將抵達後本月仍算已行動。
5. 「出征」選相鄰敵城、武將、兵數，確認軍議後交戰。預估戰力比大於一較有利，但有 ±6% 波動。戰報可略過動畫。
6. 結束本月會讓另外兩國行動，再結算全圖金糧、軍隊消耗、缺糧逃兵、年月與行動重置。軍情摘要列出實際事件。
7. 占領後指揮官和生還部隊進駐，新城當月不能再下令。守將撤退至其餘友城，亡國後成為無所屬。
8. 統一全部十二城獲勝；失去全部領土落敗。請在武將總覽查看全部三十名武將，包含無所屬者。

建議：用高政治武將開墾商業，高魅力武將徵兵，高統率武將訓練出征。把內地將領兵糧逐城調往前線，訓練成熟後集中優勢兵力出征。留意軍糧月支出，切勿只徵兵而不開墾。

## 存檔

每次成功指令及月結自動儲存完整狀態至 `hanmo-strategy-save-v1`，包含亂數種子。重開後按「繼續遊戲」。只在相同裝置、瀏覽器、網站來源有效；無跨裝置同步。損毀或不相容存檔顯示提示並保留原內容，由使用者確認刪除。無痕或禁止 LocalStorage 時可能不能儲存，畫面會提示。

## 發布 GitHub Pages

已提供 `.github/workflows/deploy.yml`，在 `main` push 或手動執行時，以官方 Actions 安裝、型別檢查、測試、建置、上傳 Pages artifact 及部署。

1. 將這些變更提交並推送到 `damx2002/hanmo-strategy` 的 `main`。
2. GitHub 儲存庫 → **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. 開啟 **Actions**，確認「部署 GitHub Pages」成功。若設定前執行失敗，可按 **Re-run all jobs**。
4. 發布網址為 `https://damx2002.github.io/hanmo-strategy/`。

此工作區完成程式與流程設定，未自動推送或宣稱遠端網站已部署。若 repository 有環境保護規則，需依 GitHub 介面批准部署。其他靜態平台也可發布 `dist/`，但必須配合 base 路徑。

## 範圍與授權素材

原創城池資料、能力數值、抽象文字徽章、CSS 及 SVG。無引用 KOEI 圖像、音樂、人物肖像、標誌或程式碼。不含戰術棋盤、外交、計略、多人或音樂。歷史地名與相對座標僅供戰略示意，不是史實交通或國界考據。
