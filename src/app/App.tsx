import { useCallback, useEffect, useRef, useState } from "react";
import { factions, newGame } from "../data/scenario";
import type { Action, Battle, FactionId, GameState } from "../engine/types";
import { dispatch } from "../engine/actions";
import { endMonth } from "../engine/turn";
import {
  loadGame,
  saveGame,
  SAVE_KEY,
  restoreLegacy,
  exportSave,
} from "../engine/save";
import { WorldMap } from "../components/WorldMap";
import { CityOverview } from "../components/CityOverview";
import { cityReadiness } from "../components/cityOverview";
import { CityPanel } from "../components/CityPanel";
import { OfficerPanel } from "../components/OfficerPanel";
import { actionFeedback } from "../components/actionSelection";
import { BattleReport } from "../components/BattleReport";
import { beginTactical } from "../engine/tactical/createBattle";
import {
  applyTactical,
  enemyPhase,
  completeTactical,
} from "../engine/tactical/resolve";
import type { TacticalAction } from "../engine/tactical/types";
import { TacticalBattle } from "../components/tactical/TacticalBattle";
export default function App() {
  const [loaded] = useState(loadGame);
  const [game, setGame] = useState<GameState | null>(null);
  const [resume, setResume] = useState(loaded.state);
  const [corrupt, setCorrupt] = useState(!!loaded.error);
  const [notice, setNotice] = useState(loaded.error),
    [saveError, setSaveError] = useState("");
  const [actionNotice, setActionNotice] = useState<{
    cityId: string;
    text: string;
  } | null>(null);
  const [tab, setTab] = useState<"world" | "city" | "officers" | "intel">(
    "world",
  );
  const paneScroll = useRef<Partial<Record<typeof tab, number>>>({});
  const campaignRef = useRef<HTMLElement>(null);
  function changeTab(next: typeof tab) {
    const pane = campaignRef.current?.querySelector<HTMLElement>(
      `[data-pane="${tab}"]`,
    );
    if (pane) paneScroll.current[tab] = pane.scrollTop;
    setTab(next);
    requestAnimationFrame(() => {
      const nextPane = campaignRef.current?.querySelector<HTMLElement>(
        `[data-pane="${next}"]`,
      );
      if (nextPane) nextPane.scrollTop = paneScroll.current[next] ?? 0;
    });
  }
  function selectCity(id: string, open = false) {
    setSelected(id);
    setTarget(undefined);
    if (open) changeTab("city");
  }
  const [selected, setSelected] = useState(""),
    [target, setTarget] = useState<string>(),
    [report, setReport] = useState<Battle | null>(null);
  const [busy, setBusy] = useState(false),
    [allOfficers, setAllOfficers] = useState(false),
    [restart, setRestart] = useState(false),
    [summary, setSummary] = useState<string[] | null>(null);
  const turnLock = useRef(false);
  const monthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (monthTimer.current) clearTimeout(monthTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (game) {
      setSaveError(saveGame(game));
      setResume(game);
    }
  }, [game]);
  function enter(s: GameState) {
    setGame(s);
    setTab("world");
    paneScroll.current = {};
    setActionNotice(null);
    setSelected(
      s.cities.find((c) => c.ownerId === s.playerId)?.id ?? s.cities[0].id,
    );
    setTarget(undefined);
    setNotice("");
  }
  function act(a: Action) {
    if (!game || turnLock.current) return;
    const result = dispatch(game, a);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setGame(result.state);
    const feedback = actionFeedback(game, result.state, a);
    setNotice("");
    setActionNotice({ cityId: a.cityId, text: feedback });
    if (a.type === "attack") setReport(result.state.battles[0]);
    setTarget(undefined);
  }
  const advanceEnemy = useCallback(
    () => setGame((s) => (s ? enemyPhase(s) : s)),
    [],
  );
  function manual(a: Extract<Action, { targetId: string }>) {
    if (!game || turnLock.current) return;
    const r = beginTactical(game, a);
    if (!r.ok) {
      setNotice(r.error);
      return;
    }
    setNotice("");
    setActionNotice(null);
    setGame(r.state);
  }
  function command(a: TacticalAction) {
    if (!game) return;
    const r = applyTactical(game, a);
    if (r.ok) {
      setGame(r.state);
      setNotice("");
    } else setNotice(r.error);
  }
  function finishBattle() {
    if (!game?.pendingBattle) return;
    const r = completeTactical(game, game.pendingBattle.id);
    if (!r.ok) {
      setNotice(r.error);
      return;
    }
    setGame(r.state);
    setReport(r.state.battles[0]);
    setNotice("戰果已結算並自動儲存。");
  }
  function downloadBackup() {
    try {
      const url = URL.createObjectURL(
        new Blob([exportSave()], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "hanmo-save-backup.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice("無法匯出備份，請檢查瀏覽器權限。");
    }
  }
  function recoverLegacy() {
    if (
      !window.confirm(
        "確認回到舊 V1 備份的進度？現有 V2 會另外保留為復原備份，不會靜默覆寫。",
      )
    )
      return;
    const r = restoreLegacy();
    if (r.state) {
      setCorrupt(false);
      enter(r.state);
    } else setNotice(r.error);
  }
  function nextMonth() {
    if (
      !game ||
      turnLock.current ||
      game.pendingBattle ||
      game.status !== "playing"
    )
      return;
    turnLock.current = true;
    setBusy(true);
    monthTimer.current = setTimeout(() => {
      try {
        const next = endMonth(game);
        setGame(next);
        setActionNotice(null);
        setSummary(next.events.filter((e) => !game.events.includes(e)));
        setTarget(undefined);
        setNotice("");
      } finally {
        turnLock.current = false;
        setBusy(false);
      }
    }, 250);
  }
  function deleteSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
      setResume(null);
      setCorrupt(false);
      setGame(null);
      setRestart(false);
      setNotice("舊進度已刪除，請選擇新勢力。");
      setSaveError("");
    } catch {
      setRestart(false);
      setNotice("瀏覽器禁止刪除存檔，請檢查儲存權限。");
    }
  }
  const city = game?.cities.find((c) => c.id === selected);
  return (
    <>
      <header className="game-header">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-seal">漢</span>
          <span>
            漢末群雄志<small>群雄對峙・建安十九年</small>
          </span>
        </a>
        <span className="version">V0.2.2</span>
        {game && (
          <>
            <div className="date">
              {game.year} 年 <strong>{game.month} 月</strong>
              <small>
                建安群雄 · {factions.find((f) => f.id === game.playerId)!.name}
                軍 ·{" "}
                {game.cities.filter((c) => c.ownerId === game.playerId).length}
                ／12 城
              </small>
            </div>
            <button
              className="primary end-month"
              disabled={
                busy ||
                !!game.pendingBattle ||
                game.status !== "playing" ||
                !!summary ||
                !!report
              }
              onClick={nextMonth}
            >
              {busy ? "諸侯行動中…" : "結束本月 →"}
            </button>
          </>
        )}
      </header>
      {(notice || saveError) && (
        <div role="status" className={`notice ${saveError ? "warning" : ""}`}>
          {saveError || notice}
        </div>
      )}
      {!game ? (
        <main className="opening">
          <div className="intro">
            <span className="eyebrow">原創回合制策略遊戲 · 群雄對峙</span>
            <p className="vertical-poem">
              山河未定
              <br />
              天下待君
            </p>
            <h1>
              逐鹿漢末
              <br />
              <em>誰主沉浮</em>
            </h1>
            <p>
              建安十九年，漢室衰微。
              <br />
              經略城邑，招兵練將，以十二座城池書寫你的天下。
            </p>
          </div>
          <section className="faction-select">
            <h2>擇一方諸侯 · 啟一世霸業</h2>
            <p className="hint">架空歷史劇本 ／ 214 年 1 月 ／ 十二城</p>
            {corrupt && (
              <div className="recovery-options">
                <button onClick={downloadBackup}>匯出現有存檔備份</button>
                <button onClick={recoverLegacy}>確認復原 V1 備份</button>
              </div>
            )}
            {resume && (
              <button
                className="primary full continue"
                onClick={() => enter(resume)}
              >
                繼續遊戲 · {resume.year} 年 {resume.month} 月 ·{" "}
                {factions.find((f) => f.id === resume.playerId)?.name}
              </button>
            )}
            {factions.map((f) => (
              <button
                className="faction-card"
                key={f.id}
                style={{ borderLeftColor: f.color }}
                onClick={() => {
                  if (resume || corrupt) {
                    setRestart(true);
                  } else enter(newGame(f.id));
                }}
              >
                <span className="lord-seal" style={{ color: f.color }}>
                  {f.name[0]}
                </span>
                <span>
                  <strong>{f.name}</strong>
                  <small>{f.motto}</small>
                  <small>
                    {f.id === "cao"
                      ? "五城 · 中原沃土，四面通衢"
                      : f.id === "liu"
                        ? "四城 · 蜀地雄關，名將雲集"
                        : "三城 · 江東富庶，精兵善戰"}
                  </small>
                </span>
                <span>起兵 →</span>
              </button>
            ))}
            <p className="hint">
              每城每月三令，每將每月一動。發展內政、調動兵糧，出征相鄰敵城；統一十二城即獲勝。進度僅存於此裝置的瀏覽器。
            </p>
            {(resume || corrupt) && (
              <button onClick={() => setRestart(true)}>
                刪除舊存檔／開始新遊戲
              </button>
            )}
          </section>
        </main>
      ) : game.pendingBattle ? (
        <TacticalBattle
          state={game}
          battle={game.pendingBattle}
          onAction={command}
          onEnemy={advanceEnemy}
          onFinish={finishBattle}
        />
      ) : (
        <main className="campaign" data-tab={tab} ref={campaignRef}>
          <nav className="toolbar">
            <span>
              第 {game.turn + 1} 回合 ·{" "}
              {game.cities.filter((c) => c.ownerId === game.playerId).length}
              ／12 城
            </span>
            <div>
              <button onClick={() => setAllOfficers(true)}>
                武將總覽 · 30
              </button>
              <button disabled={busy} onClick={() => setRestart(true)}>
                新遊戲
              </button>
            </div>
          </nav>
          <div className="strategy-layout">
            <section
              className="strategy-pane world-pane"
              data-pane="world"
              data-active={tab === "world"}
              aria-label="天下"
            >
              {city && (
                <div className="city-quick-info">
                  <div>
                    <strong>
                      {city.name} ·{" "}
                      {game.factions.find((f) => f.id === city.ownerId)?.name}軍
                    </strong>
                    <span>
                      兵 {city.troops.toLocaleString("zh-TW")} ·{" "}
                      {city.ownerId === game.playerId
                        ? cityReadiness(game, city).reason
                        : "敵軍城池"}
                    </span>
                  </div>
                  <button className="primary" onClick={() => changeTab("city")}>
                    {city.ownerId === game.playerId ? "開啟城務" : "查看敵情"}
                  </button>
                </div>
              )}
              <WorldMap
                state={game}
                selected={selected || game.cities[0].id}
                target={target}
                onSelect={(id) => {
                  selectCity(id);
                }}
              />
              <CityOverview
                state={game}
                selected={selected}
                onSelect={(id) => selectCity(id, true)}
              />
            </section>
            <section
              className="strategy-pane city-pane"
              data-pane="city"
              data-active={tab === "city"}
              aria-label="城務"
            >
              {city && (
                <label className="city-switch">
                  目前城池
                  <select
                    aria-label="切換己方城池"
                    value={selected}
                    onChange={(e) => selectCity(e.target.value)}
                  >
                    {city.ownerId !== game.playerId && (
                      <option value={city.id}>{city.name}（敵城）</option>
                    )}
                    {game.cities
                      .filter((c) => c.ownerId === game.playerId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.actions} 令 ·{" "}
                          {cityReadiness(game, c).ready} 將待命
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {city && (
                <CityPanel
                  state={game}
                  city={city}
                  onManual={manual}
                  onAction={act}
                  feedback={
                    actionNotice?.cityId === city.id ? actionNotice.text : ""
                  }
                  locked={busy}
                  onTarget={setTarget}
                  onSelect={(id) => selectCity(id, true)}
                />
              )}
            </section>
          </div>
          <section
            className="strategy-pane officers-pane"
            data-pane="officers"
            data-active={tab === "officers"}
            aria-label="武將"
          >
            <h2>己方武將 · 待命與駐地</h2>
            {game.cities
              .filter((c) => c.ownerId === game.playerId)
              .map((c) => (
                <section className="officer-city" key={c.id}>
                  <button onClick={() => selectCity(c.id, true)}>
                    {c.name} → 城務 · {cityReadiness(game, c).ready} 將待命
                  </button>
                  <OfficerPanel
                    officers={game.officers.filter(
                      (o) => o.cityId === c.id && o.factionId === game.playerId,
                    )}
                    compact
                  />
                </section>
              ))}
          </section>
          <section
            className="event-panel strategy-pane"
            data-pane="intel"
            data-active={tab === "intel"}
          >
            <div className="intel-tools">
              <button onClick={() => setAllOfficers(true)}>天下武將</button>
              <button disabled={busy} onClick={() => setRestart(true)}>
                新遊戲
              </button>
            </div>
            <h3>
              軍國紀事 <small>最新消息在前 · 最多保留 160 則</small>
            </h3>
            <div className="event-list">
              {game.events.map((text, i) => (
                <p key={`${i}-${text}`}>
                  <span>◆</span>
                  {text}
                </p>
              ))}
            </div>
            <details>
              <summary>歷次戰報 · {game.battles.length}</summary>
              {game.battles.map((b, i) => (
                <button
                  className="history-report"
                  key={i}
                  onClick={() => setReport(b)}
                >
                  {b.from} → {b.to} · {b.won ? "攻方勝" : "守方勝"} · 查看戰報
                </button>
              ))}
            </details>
          </section>
          <nav className="mobile-tabs" aria-label="戰略分頁" role="tablist">
            {(
              [
                ["world", "天下"],
                ["city", "城務"],
                ["officers", "武將"],
                ["intel", "軍情"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => changeTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </main>
      )}
      <footer>
        漢末群雄志 · 原創山河與人物徽章 ／ V0.2.2{" "}
        <span>
          {game && !saveError ? "進度已自動儲存" : "本機存檔 · 無跨裝置同步"}
        </span>
      </footer>
      {report && (
        <BattleReport
          key={`${report.id}-${report.from}`}
          battle={report}
          onClose={() => setReport(null)}
        />
      )}
      {summary && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="summary-title"
          >
            <h2 id="summary-title">
              月度軍情 · {game?.year} 年 {game?.month} 月
            </h2>
            <div className="summary-list">
              {summary.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
            <button
              autoFocus
              className="primary full"
              onClick={() => setSummary(null)}
            >
              開啟新月
            </button>
          </section>
        </div>
      )}
      {allOfficers && game && (
        <div className="overlay">
          <section
            className="modal wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="roster-title"
          >
            <div className="modal-title">
              <h2 id="roster-title">天下武將 · 全三十名</h2>
              <button autoFocus onClick={() => setAllOfficers(false)}>
                關閉
              </button>
            </div>
            {[...factions, { id: null, name: "無所屬" }].map((f) => (
              <section key={f.id ?? "free"}>
                <h3>
                  {f.name}
                  {f.id ? "軍" : ""}
                </h3>
                {game.cities
                  .filter((c) => c.ownerId === f.id)
                  .map((c) => (
                    <div key={c.id}>
                      <h4>{c.name}</h4>
                      <OfficerPanel
                        officers={game.officers.filter(
                          (o) => o.cityId === c.id,
                        )}
                      />
                    </div>
                  ))}
                {!f.id && (
                  <OfficerPanel
                    officers={game.officers.filter((o) => !o.factionId)}
                  />
                )}
              </section>
            ))}
          </section>
        </div>
      )}
      {game && game.status !== "playing" && !report && !summary && !restart && (
        <div className="overlay">
          <section
            className="modal result"
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
          >
            <small>霸 業 終 章</small>
            <h2 id="result-title">
              {game.status === "won" ? "天下歸一" : "山河易主"}
            </h2>
            <p>
              {game.status === "won"
                ? "十二城旌旗盡歸麾下，亂世終得一統。"
                : "最後的城池已失守。此番霸業落幕，來日再戰。"}
            </p>
            <p>
              歷時 {game.turn} 個月 · {game.year} 年 {game.month} 月
            </p>
            <button
              autoFocus
              className="primary"
              onClick={() => setRestart(true)}
            >
              再啟新局
            </button>
          </section>
        </div>
      )}
      {restart && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restart-title"
          >
            <h2 id="restart-title">確認刪除舊存檔？</h2>
            <p>此操作會刪除此瀏覽器的遊戲進度，返回勢力選擇。無法復原。</p>
            <div className="button-row">
              <button autoFocus onClick={() => setRestart(false)}>
                保留進度
              </button>
              <button className="danger-button" onClick={deleteSave}>
                刪除並重新選擇
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
