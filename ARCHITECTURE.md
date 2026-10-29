# 架構與驗證

React 19、strict TypeScript、Vite 7、原生 CSS、SVG、Vitest 4.1.12；npm lockfile 固定相依套件。無網路執行時相依，無後端。

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

## V0.1.1 增量模組

- `engine/domestic.ts`：共用內政欄位、成本與上限檢查，供 dispatch 及按鈕狀態共用。
- `components/actionSelection.ts`：純函式有效武將選取與成功前後數值回饋；指令效果仍完全由引擎計算。
- `tests/governance.test.ts`：巡察、修築、AI 優先序與成本、長期模擬、武將選取、舊檔完整性。
- `tests/fixtures/v0.1.0-save.json`：開發改動前由 V0.1.0 原始引擎生成的固定存檔，含戰報、AI 與月結；不以新引擎動態生成假裝舊檔。
- `scripts/browser-v011.cjs`：在相同 Playwright／Chromium 環境執行 `node scripts/browser-v011.cjs`，預設使用 production preview 的 4173 子路徑，可用 GAME_URL 覆寫。實測舊檔逐欄保持、治理效果、自動與手選武將、耗盡／離城、手機指令至少 44px、真實縮放捲動及復位。

保留原本 `engine.test.ts`、`campaign.test.ts` 及 `browser-smoke.cjs`，不弱化既有斷言。上述僅為 V0.1.1 的相容策略；V0.2.0 改為下列 V2 遷移。

## V0.2.0 戰術引擎與生命週期

- `expedition.ts`：兩種模式與敵國出征共同的 validate／reserve／settle；委任公式不變，防止不同路徑重複扣資源。
- `tactical/types.ts`、`createBattle.ts`：pendingBattle、地形、兵種與守恆分隊。
- `movement.ts`：地形成本的 Dijkstra；`damage.ts`：射程、預估傷害與火計條件。
- `actions.ts`：純函式單步 reducer、階段、城門、駐守、回合上限與撤退。
- `ai.ts`：有固定上限的評分行動，所有修改透過 reducer。
- `resolve.ts`：GameState 級單步、敵軍階段與帶 battle ID 的一次性戰果套用。
- `validate.ts`：V2 pending 的結構及跨欄位驗證，重建模板核對地形、初始分隊與預留資訊。
- `components/tactical/`：TacticalBattle 管理 UI 選取／模式及敵軍計時；TacticalMap 只畫格子；UnitPanel 只展示指令與禁用原因。規則不依賴 React／時鐘，僅 UI 有效果與雙擊防護。

主流程：軍議（零副作用）→ 共用驗證 → reserve → 自動結果或建立 pending → 儲存每個戰術步驟 → finished pending → settle → clear pending → 自動存檔／戰報。敵軍階段本身可存檔，重開後只恢復那一階段，不再次 reserve。

### 測試變更說明

保留原有48項測試。錯版拒絕案例從 version:2 改測未知 version:999；舊檔相容斷言改為完整世界相等、只加 version:2/pendingBattle:null。將原戰役的同一策略抽到 `tests/helpers/playCampaign.ts`，原委任統一測試不變，再注入親征結算跑交替模式整場戰役；沒有放寬勝利條件或修改戰略公式。

新增 `tactical.test.ts`（分隊、尋路、兵種、傷害／火計成功失敗、AI、門與駐守、撤退、一次結算、V1/V2 及損壞驗證）與 `tacticalCampaign.test.ts`（親征／委任混合，每階段序列化後仍統一）。

### 真實瀏覽器驗收

啟動 `npm run preview -- --port 4173`，沿用上方 Playwright／Chromium 設定後執行：

```sh
GAME_URL=http://127.0.0.1:4173/hanmo-strategy/ PLAYWRIGHT_MODULE=/tmp/hanmo-browser-tools/node_modules/playwright node scripts/browser-v020.cjs
```

腳本以 UI 合法調兵集結，不灌入戰果；取消軍議、親征、點部隊移動、真實攻擊與敵軍階段、勝利易主、戰後重載確認一次結算。使用 Chromium persistent profile 實際關閉／重啟後驗證完整戰中狀態。同場作戰逐階段輪替手機直向、橫向及桌面，實際下達移動／攻擊及敵軍階段；測試 412×915、915×412、360×800 的無水平溢出、至少44px格與指令、縮放；再驗證 V1 原檔備份及損毀 V2 明確復原。讀取純函式只用於選合法 UI 目標，所有實際戰果透過按鈕和格子操作。

既有兩套瀏覽器回歸保留，調整新 save key／遷移預期及「委任作戰」按鈕名稱。

## V0.2.1 回饋與手機版面

- tacticalBalance.matchup 是唯一克制表；damage.ts 同時供預覽、正式攻擊、AI位置／威脅與選擇目標，沒有UI傷害副本。
- tactical/feedback.ts 在攻擊、火計、破城後記錄結構化 CombatFeedback；validate.ts 對可選新欄位驗證序號、對象、座標、傷亡前後一致性。舊V2缺少欄位可直接讀取，無遷移與key變動。
- useCombatFeedback 僅控制900ms的顯示生命週期；已見序號用ref保存，新載入不播放舊事件。永不呼叫遊戲指令。
- TacticalMap 以事件目標座標畫浮字及受擊效果，pointer-events:none，邊角改向內對齊。CombatReadout 固定高度放在棋盤上緣，敵軍一次運算後列出各次實際損失；不用動畫節奏推動AI或兵力。
- selectionAfterUpdate 只在所選部隊由未行動變成完成／潰滅後接續，手動換隊不被覆蓋，不自動結束階段。
- 戰術模式縮短全站標題，隱藏無法操作的月結；棋盤格至少44px，狹窄螢幕於框內平移，主要指令與戰況可同時閱讀。reduced-motion與略過效果仍顯示數字。

### V0.2.1 自動驗證

保留77項原測試，新增 matchup.test.ts 後共97項。舊fixture/v0.2.0-battle-save.json 在修改前由原引擎產生，驗證原樣載入；新事件另驗證往返及損壞資料拒絕。

`npm run test:browser` 自行啟停正式預覽（預設4174，可用SMOKE_PORT），執行 browser-v021.cjs。使用 playwright-core（僅開發依賴，不下載瀏覽器）；本機設定CHROMIUM_PATH，GitHub hosted Ubuntu用已安裝的Google Chrome。

smoke以明確戰場前置狀態測試三組克制／中立／劣勢的預覽與正式傷亡、邊角浮字不裁切、不攔觸控、不捲頁、火計成功失敗、略過與減少動態、敵軍各筆摘要、部隊接續、全軍完成、持久化關閉重開及V1/V2相容。前置配置不是戰果：所有傷害都由實際UI點擊透過引擎產生，對照存檔前後及事件。原 browser-v020.cjs 仍保留從正常開局合法集兵到戰勝回寫的整場驗收。

CI在原型別／測試／建置後執行此smoke，再允許上傳Pages產物；失敗會保存截圖。沒有新增正式執行依賴或改動既有戰鬥結算／經濟流程。

## V0.2.2 接戰與戰略介面

- damage.ts 的連續函式及estimateExchange是主擊／被動反擊唯一來源。estimateRetaliation忽略守方主動旗標，只允許存活雙方相鄰接戰，效率集中tacticalBalance；不使用遞迴dispatch。
- tacticalDispatch一次抽seed、計算雙方交換、各扣一次、記兩筆回饋後checkBattle。AI位置／目標選擇以共用交換值扣反擊風險，無額外特權。damagePreview純讀取，提供主擊範圍與反擊安全範圍。
- CombatFeedback的kind增加retaliation，可選phase辨認「敵軍主動階段中的我方反擊」，parentSequence關聯主擊。舊事件無phase仍依side呈現，舊存檔不回填或重算。驗證仍核對整數傷亡／順序／對象／parent；序號上限提高至16×12，容納每方3隊主擊及其反擊。最近24筆限制不變。
- App維持單一GameState；tab、選城及每頁scroll只屬UI。手機四個pane保持掛載，CSS切換可見性，不卸載城務表單。行動成功不建立全域訊息條；本地固定高度回饋保留觸控位置。desktop CSS仍顯示地圖及城務雙欄。
- CityOverview.tsx、cityOverview.ts提供城池總覽與可操作原因；鄰城出征資格透過既有validateExpedition驗證，UI不另創成本規則。EnemyApproaches不呈現內政指令。
- mobile root採100dvh、內容pane內捲動、導覽列位於正常flex流尾端及safe-area；overlay固定於viewport並提高z-index，避免被頂底欄或內容捲軸遮住。TacticalBattle不套用策略分頁CSS。

### V0.2.2 驗證與舊斷言調整

保留97個原測試案例，新增22個為119個。原40%／60%上限斷言依本次明確要求改為連續比例、整數界線與優勢可重創；既有潰滅案例改以1兵測試收尾，另新增6000對200／1000真實損失，並非保留舊百人收尾特權。新增反擊後，原讀取「最後事件」的主擊斷言改依kind查找主擊；未刪除任何測試或放寬統一勝利條件。

retaliation.test.ts涵蓋四比例、保護效果、步騎／弓反擊、生還計算、一次限制、遠射／火計排除、seed／預覽雙方精確兵損、極端整數、AI、四代固定存檔、續戰及一次結算、城池原因與鄰城出征。v0.2.1-battle-save.json由修改前的V0.2.1引擎產生，含原版傷亡／事件，防止用新引擎冒充相容樣本。

CI的npm run test:browser依序跑browser-v021（保留全部舊範圍，增加兩格真實反擊／預覽檢查）及browser-v022（四分頁、選城與表單／捲動保留、真正開墾成本、敵情／鄰城、軍議與總覽、狀態差異、縮放、三個手機尺寸與桌面雙欄）。失敗上傳兩套截圖。另跑保留的browser-v020正常開局整場UI勝利與關閉重開。沒有新增套件依賴。

## V0.3.0 可暫停守城流程的擴充邊界（僅設計）

目前endMonth同步依固定勢力順序runAI，再月結／換月，不能在中途直接await彈窗。未來需拆成純函式startMonthResolution／advanceMonthResolution，並在GameState以明確可驗證的TurnResolution保存年月、固定處理順序、勢力及城池cursor、該國已出征標記、當月待執行項目、已完成標記與seed。每個advance只能提交一個有界步驟，UI是暫停結果的展示者，不能用計時器決定執行到哪裡。

runAI應能產生合法意圖（內政、調動、出征），由共同dispatch／expedition驗證後逐步提交；遇到攻打玩家城池時，保存pendingDefense並停在原cursor，發出攻城警報，阻擋新的月結及無關世界指令。玩家選親守／委任／合法相鄰友城援軍後，才以唯一battle ID及reservation記錄正式扣一次兵糧與行動，保存攻守方、援軍來源／兵數／成本／預留與回收規則，再建立同一戰術生命週期。警報取消或重新整理不得跳過該AI意圖，也不得重新抽種子。

expedition的validate／reserve／settle可擴為帶source/defender/reinforcement reservations的計畫，保持共享兵力守恆；守城戰敗只在已完成結果套用時易主。settle需一次套用完成battle ID，清pending後才推進該cursor；同一存檔同一步重播必為拒絕或冪等，不能因React effect或Chrome重開再次reserve。AI每國每月最多一次主動出征及原有內政／經濟順序仍記在checkpoint。

只有所有AI意圖完成後才執行全城經濟、年月前進與行動重置，並保存經濟已提交標記；戰鬥暫停時這些步驟都不能提前執行。需另定新schema遷移與損毀checkpoint復原，測試警報前後、預留前後、援軍中途、結算前後、月結提交前後的關閉續玩及重複提交。本版僅記錄此擴充方式，沒有加入手動防守或可暫停月結。

## V0.2.3 獨立玩家委任模組

- delegation/types.ts：方針、每城結果、真實前後差、月收與可選GameState.delegation。
- balance.ts：目標、優先權重、資源緩衝及選將係數，均沿用原內政成本。
- policy.ts：純函式設定、取消、後方批次與邊境判斷；不屬於消耗型Action。遊戲結束／戰中／敵城拒絕。
- planner.ts：讀當前單城、待命武將與經濟預測，返回一個Domestic action或可解釋停手原因；零副作用、零RNG。
- execute.ts：每城固定上限三次，每次重新plan，再走原dispatch。以processedTurn防相同月結果再提交；與敵軍runAI完全分離，不包含attack或transfer。
- summary.ts：dispatch前後狀態轉為結構化結果，不預估或自行重算傷亡／成長。
- validate.ts：驗證可選儲存資料，拒絕未知城／敵城政策、非法形狀／方針／時間、錯誤成本／前後差／重複武將。舊檔缺欄位直接按手動解讀，不改寫其世界。

turn.ts的順序為validate → executeDelegatedCities → 原敵國runAI → settleCity並記錄己城月收 → 城將重置／日期更新 → checkResult。checkResult同時清除不再擁有城市的政策，捕獲結算全路徑共用；歷史報告可以保留失城當月的真實成果。原戰鬥、戰術、經濟與AI公式不改。

App新增設定callback並沿用turnLock／autosave；沒有useEffect觸發委任。DelegationPanel僅呈現選單、說明與需明確確認的後方批次；城務／世界快速卡／總覽共用getPolicy。DelegationReportView由報告直接呈現，月度對話框使用固定標題／確認按鈕及中間可捲動區，避免底部聚焦把成果捲出畫面；軍情可重看最近一次。操作設定不建立會推動版面的全域訊息。

### V0.2.3 驗證

保留119項，新增delegation.test.ts的38項後共157項。包含五代原版fixture逐欄相容、設定無成本、四方針實際dispatch重播相等、手動兩令／只補一令、指令／武將不足、農商滿值轉向、資源保留／安全徵兵、選將、同月去重／讀檔、月收與支出真值、戰中互斥、失城／再奪回、24月治理與敵國合理戰機、帶委任戰術逐階段存取及相同戰果、正常劉備統一。原119項沒有刪除或弱化。

fixtures/v0.2.2-save.json在任何V0.2.3變更前由V0.2.2引擎實際月結產生，不帶委任欄位。新遊戲也以缺欄位表示全部手動；新增資料後只使用原V2 key，原V1備份／損毀V2復原規則不變。

CI test:browser依序保留browser-v021、browser-v022，再跑browser-v023：四個指定視窗、成都經濟與漢中手動、設定免費與不跳動、真實雙擊只結一次月、整個世界對照純引擎、月報逐筆數值與獨立收支、手動接管／取消、批次接受與拒絕、真正關閉／重開Chromium及原V0.2.2存檔。沿用僅開發用playwright-core與系統Chrome，不加依賴。保留browser-v020正常集兵整場攻城，另在開始前透過UI設定成都經濟，驗證戰中續玩與戰後方針仍在。

### 後續可暫停防守銜接

V0.3的TurnResolution需增加delegation階段與完成checkpoint，先提交委任／processedTurn／報告，再進敵軍cursor。敵方攻城警報暫停時不能重新進委任，也不能先做經濟或重置；恢復只從已儲存cursor向後繼續。過渡存檔可帶本月report但尚未附economy，結清月份後才寫月收。未來若允許階段中斷，必須明確持久化階段完成標記並測試各中斷點，不依賴React動畫／計時器。玩家城池軍事委任／援軍權限仍要另行建模，本版只授權六種內政。
