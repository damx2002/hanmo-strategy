import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  scenarioList,
  scenarioTemplate,
  newScenarioGame,
} from "../data/scenarios";
import type { ScenarioId } from "../data/scenarios";
import {
  startMonthResolution,
  advanceMonthResolution,
} from "../engine/resolution/month";
import { resolvePendingDefense } from "../engine/resolution/defense";
import type { Reinforcement } from "../engine/resolution/types";
import { personnelDispatch } from "../engine/personnel";
import type { PersonnelAction } from "../engine/personnel";
import { diplomacyDispatch } from "../engine/diplomacy";
import type { DiplomaticAction } from "../engine/diplomacy";
import { DefenseCouncil } from "../components/DefenseCouncil";
import { PersonnelPanel } from "../components/PersonnelPanel";
import { DiplomacyPanel } from "../components/DiplomacyPanel";
import type { Action, Battle, FactionId, GameState } from "../engine/types";
import { dispatch } from "../engine/actions";
import { endMonth } from "../engine/turn";
import {
  loadGame,
  saveGame,
  SAVE_KEY,
  restoreLegacy,
  restoreV2Backup,
  exportSave,
  importSaveBackup,
  hasPreviewSave,
  restorePreviewSave,
} from "../engine/save";
import { WorldMap } from "../components/WorldMap";
import { CityOverview } from "../components/CityOverview";
import { cityReadiness } from "../components/cityOverview";
import { DelegationReportView } from "../components/DelegationReport";
import {
  getPolicy,
  policyShort,
  setDelegationPolicy,
  setRearDelegation,
} from "../engine/delegation/policy";
import type { Policy } from "../engine/delegation/types";
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
import { PwaUpdateNotice } from "../components/PwaUpdateNotice";
export default function App() {
  const [scenario, setScenario] = useState<ScenarioId>("warlords194");
  const openingWorld = useMemo(() => scenarioTemplate(scenario), [scenario]);
  const [systemNotice, setSystemNotice] = useState("");
  const [rosterSearch, setRosterSearch] = useState("");
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
  const factions = game?.factions ?? openingWorld.factions;
  const turnLock = useRef(false);
  const monthBefore = useRef<{ turn: number; events: string[] } | null>(null);
  useEffect(() => {
    if (!game) return;
    if (game.monthResolution) {
      turnLock.current = true;
      monthBefore.current ??= {
        turn: game.monthResolution.turn,
        events: game.monthResolution.eventsBefore ?? game.events,
      };
      if (game.pendingBattle || game.pendingDefense || report) return;
      const timer = setTimeout(
        () => setGame((s) => (s ? advanceMonthResolution(s, 8) : s)),
        0,
      );
      return () => clearTimeout(timer);
    }
    if (monthBefore.current) {
      const before = monthBefore.current;
      monthBefore.current = null;
      turnLock.current = false;
      setBusy(false);
      if (game.turn > before.turn) {
        const delegated =
          game.delegation?.report?.turn === before.turn
            ? game.delegation.report.eventLines
            : [];
        setSummary(
          game.events.filter(
            (e) => !before.events.includes(e) && !delegated.includes(e),
          ),
        );
      }
    }
  }, [game, report]);
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
    turnLock.current = !!s.monthResolution;
    monthBefore.current = s.monthResolution
      ? { turn: s.turn, events: s.monthResolution.eventsBefore ?? s.events }
      : null;
    setBusy(!!s.monthResolution);
    setTab("world");
    paneScroll.current = {};
    setActionNotice(null);
    setSelected(
      s.cities.find((c) => c.ownerId === s.playerId)?.id ?? s.cities[0].id,
    );
    setTarget(undefined);
    setNotice("");
  }
  function people(a: PersonnelAction) {
    if (!game || turnLock.current) return;
    const r = personnelDispatch(game, a);
    if (r.ok) {
      setGame(r.state);
      setSystemNotice(r.state.events[0]);
      setNotice("");
    } else setSystemNotice(r.error);
  }
  function diplomacy(a: DiplomaticAction) {
    if (!game || turnLock.current) return;
    const r = diplomacyDispatch(game, a);
    if (r.ok) {
      setGame(r.state);
      setSystemNotice(r.state.events[0]);
      setNotice("");
    } else setSystemNotice(r.error);
  }
  function defend(
    mode: "manual" | "auto",
    army: Omit<Reinforcement, "food">[],
  ) {
    if (!game?.pendingDefense) return;
    const r = resolvePendingDefense(game, game.pendingDefense.id, mode, army);
    if (r.ok) {
      setGame(r.state);
      setNotice("");
      if (mode === "auto") setReport(r.state.battles[0]);
    } else setNotice(r.error);
  }
  function recoverV2() {
    if (
      !window.confirm(
        "確認從V2完整備份恢復？現有V3會另存復原備份，不會覆寫原V2。",
      )
    )
      return;
    const r = restoreV2Backup();
    if (r.state) {
      setCorrupt(false);
      enter(r.state);
    } else setNotice(r.error);
  }
  function configure(id: string, policy: Policy) {
    if (!game || turnLock.current) return;
    const r = setDelegationPolicy(game, id, policy);
    if (r.ok) {
      setGame(r.state);
      setNotice("");
    } else setNotice(r.error);
  }
  function batchConfigure(policy: "balanced" | "manual") {
    if (
      !game ||
      turnLock.current ||
      !window.confirm(
        policy === "manual"
          ? "確認取消目前己方後方城池的委任？前線保持原設定，已花費資源不退回。"
          : "確認將目前己方後方城池設為均衡發展？前線保持原設定。設定不消耗資源。",
      )
    )
      return;
    const r = setRearDelegation(game, policy);
    if (r.ok) {
      setGame(r.state);
      setNotice("");
    } else setNotice(r.error);
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
  async function importBackup(file: File | undefined) {
    if (!file) return;
    if (!window.confirm("確認匯入備份？目前進度會先保留在本機復原備份。")) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw Error("file too large");
      const result = importSaveBackup(await file.text());
      if (result.state) { setCorrupt(false); enter(result.state); }
      else setNotice(result.error);
    } catch { setNotice("無法讀取備份，請確認檔案格式及大小。"); }
  }
  function recoverPreview() {
    if (!window.confirm("確認從舊預覽版匯入進度？目前正式 V3 存檔將保留復原備份；原正式 V2 與預覽版資料不會刪除。")) return;
    const result = restorePreviewSave();
    if (result.state) { setCorrupt(false); enter(result.state); }
    else setNotice(result.error);
  }
  function recoverLegacy() {
    if (
      !window.confirm(
        "確認回到舊 V1 備份的進度？現有 V3 會另外保留為復原備份，不會靜默覆寫。",
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
      game.monthResolution ||
      game.pendingDefense ||
      game.status !== "playing"
    )
      return;
    if (game.version === 3) {
      turnLock.current = true;
      monthBefore.current = { turn: game.turn, events: game.events };
      setBusy(true);
      setActionNotice(null);
      setGame(startMonthResolution(game));
      return;
    }
    turnLock.current = true;
    setBusy(true);
    monthTimer.current = setTimeout(() => {
      try {
        const next = endMonth(game);
        setGame(next);
        setActionNotice(null);
        const delegatedEvents =
          next.delegation?.report?.turn === game.turn
            ? next.delegation.report.eventLines
            : [];
        setSummary(
          next.events.filter(
            (e) => !game.events.includes(e) && !delegatedEvents.includes(e),
          ),
        );
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
            漢末群雄志<small>歷史劇本・天下爭衡</small>
          </span>
        </a>
        <span className="version">V0.3.0</span>
        {game && (
          <>
            <div className="date">
              {game.year} 年 <strong>{game.month} 月</strong>
              <small>
                建安群雄 · {factions.find((f) => f.id === game.playerId)!.name}
                軍 ·{" "}
                {game.cities.filter((c) => c.ownerId === game.playerId).length}
                ／{game.cities.length} 城
              </small>
            </div>
            <button
              className="primary end-month"
              disabled={
                busy ||
                !!game.pendingBattle ||
                !!game.monthResolution ||
                !!game.pendingDefense ||
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
              漢室衰微，群雄競逐。
              <br />
              經略城邑，招兵練將，以內政、人事、外交與戰爭書寫你的天下。
            </p>
          </div>
          <section className="faction-select">
            <h2>擇一方諸侯 · 啟一世霸業</h2>
            <label className="scenario-select">
              歷史劇本
              <select
                aria-label="歷史劇本"
                value={scenario}
                onChange={(e) => setScenario(e.target.value as ScenarioId)}
              >
                {scenarioList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.year}年
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              {scenarioList.find((t) => t.id === scenario)?.description}{" "}
              {openingWorld.cities.length}城 · {openingWorld.officers.length}將
              · {openingWorld.factions.length}勢力
            </p>
            {corrupt && (
              <div className="recovery-options">
                <button onClick={downloadBackup}>匯出現有存檔備份</button>
              {hasPreviewSave() && <button onClick={recoverPreview}>從舊預覽版恢復進度</button>}
                <label>匯入 JSON 備份 <input type="file" accept=".json,application/json" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ""; }} /></label>
                <button onClick={recoverV2}>確認復原 V2 備份</button>
                <button onClick={recoverLegacy}>確認復原 V1 備份</button>
              </div>
            )}
            {resume && (
              <button
                className="primary full continue"
                onClick={() => enter(resume)}
              >
                繼續遊戲 · {resume.year} 年 {resume.month} 月 ·{" "}
                {resume.factions.find((f) => f.id === resume.playerId)?.name}
              </button>
            )}
            <div className="faction-cards">
              {openingWorld.factions.map((f) => (
                <button
                  className="faction-card"
                  key={f.id}
                  style={{ borderLeftColor: f.color }}
                  onClick={() => {
                    if (resume || corrupt) {
                      setRestart(true);
                    } else enter(newScenarioGame(scenario, f.id));
                  }}
                >
                  <span className="lord-seal" style={{ color: f.color }}>
                    {f.name[0]}
                  </span>
                  <span>
                    <strong>{f.name}</strong>
                    <small>{f.motto}</small>
                    <small>
                      {
                        openingWorld.cities.filter((c) => c.ownerId === f.id)
                          .length
                      }
                      城 ·{" "}
                      {
                        openingWorld.officers.filter(
                          (o) => o.factionId === f.id,
                        ).length
                      }
                      將
                    </small>
                  </span>
                  <span>起兵 →</span>
                </button>
              ))}
            </div>
            <p className="hint">
              每城每月三令，每將每月一動。發展內政、調動兵糧，出征相鄰敵城；統一劇本全部城池即獲勝。進度僅存於此裝置的瀏覽器。
            </p>
            <div className="save-tools">
              <button onClick={downloadBackup}>匯出存檔備份</button>
              {hasPreviewSave() && <button onClick={recoverPreview}>從舊預覽版恢復進度</button>}
              <label>匯入備份 <input type="file" accept=".json,application/json" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ""; }} /></label>
            </div>
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
            <div className="desktop-strategy-nav" aria-label="桌面戰略導覽">
              <button
                aria-pressed={tab === "world" || tab === "city"}
                onClick={() => changeTab("world")}
              >
                天下城務
              </button>
              <button
                aria-pressed={tab === "officers"}
                onClick={() => changeTab("officers")}
              >
                人事武將
              </button>
              <button
                aria-pressed={tab === "intel"}
                onClick={() => changeTab("intel")}
              >
                軍情外交
              </button>
            </div>
            <span>
              第 {game.turn + 1} 回合 ·{" "}
              {game.cities.filter((c) => c.ownerId === game.playerId).length}／
              {game.cities.length} 城
            </span>
            <div>
              <button onClick={() => setAllOfficers(true)}>
                武將總覽 · {game.officers.length}
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
                      {city.ownerId === game.playerId && (
                        <small className="policy-tag">
                          {" "}
                          · {policyShort[getPolicy(game, city.id)]}
                        </small>
                      )}
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
                  locked={busy || !!game.monthResolution}
                  onTarget={setTarget}
                  onSelect={(id) => selectCity(id, true)}
                  onPolicy={configure}
                  onBatch={batchConfigure}
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
            <PersonnelPanel
              state={game}
              onAction={people}
              feedback={systemNotice}
            />
            <label className="roster-search">
              搜尋武將
              <input
                aria-label="搜尋武將"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="姓名、特質或駐地"
              />
            </label>
            {game.cities
              .filter(
                (c) =>
                  c.ownerId === game.playerId &&
                  (!rosterSearch ||
                    game.officers.some(
                      (o) =>
                        o.cityId === c.id &&
                        o.factionId === game.playerId &&
                        !o.retired &&
                        `${o.name}${o.traits?.join("")}${c.name}`.includes(
                          rosterSearch,
                        ),
                    )),
              )
              .map((c) => (
                <section className="officer-city" key={c.id}>
                  <button onClick={() => selectCity(c.id, true)}>
                    {c.name} → 城務 · {cityReadiness(game, c).ready} 將待命
                  </button>
                  <OfficerPanel
                    officers={game.officers.filter(
                      (o) =>
                        o.cityId === c.id &&
                        o.factionId === game.playerId &&
                        !o.retired &&
                        (!rosterSearch ||
                          `${o.name}${o.traits?.join("")}${c.name}`.includes(
                            rosterSearch,
                          )),
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
            <DiplomacyPanel
              state={game}
              onAction={diplomacy}
              feedback={systemNotice}
            />
            <div className="intel-tools">
              <button onClick={() => setAllOfficers(true)}>天下武將</button>
              <button disabled={busy} onClick={() => setRestart(true)}>
                新遊戲
              </button>
            </div>
            <h3>
              軍國紀事 <small>最新消息在前 · 最多保留 160 則</small>
            </h3>
            {game.delegation?.report && (
              <details className="delegation-history">
                <summary>
                  最近委任成果 · {game.delegation.report.year}年
                  {game.delegation.report.month}月
                </summary>
                <DelegationReportView report={game.delegation.report} />
              </details>
            )}
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
        漢末群雄志 · 原創山河與人物徽章 ／ V0.3.0{import.meta.env.VITE_HANMO_CHANNEL === "preview" ? " · 預覽版（獨立存檔）" : ""}{" "}
        <span>
          {game && !saveError ? "進度已自動儲存" : "本機存檔 · 無跨裝置同步"}
        </span>
      </footer>
      <PwaUpdateNotice
        canUpdate={!game?.pendingBattle && !game?.pendingDefense && !game?.monthResolution && !busy && !summary && !report}
        saveBeforeUpdate={() => !game || saveGame(game) === ""}
      />
      {game?.pendingDefense && (
        <DefenseCouncil
          key={game.pendingDefense.id}
          state={game}
          onResolve={defend}
        />
      )}
      {report && (
        <BattleReport
          key={`${report.id}-${report.from}`}
          battle={report}
          state={game ?? undefined}
          onClose={() => setReport(null)}
        />
      )}
      {summary && (
        <div className="overlay">
          <section
            className="modal monthly-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="summary-title"
          >
            <h2 id="summary-title">
              月度軍情 · {game?.year} 年 {game?.month} 月
            </h2>
            <div className="monthly-body">
              {game?.delegation?.report?.turn === (game?.turn ?? 0) - 1 && (
                <DelegationReportView report={game.delegation.report} />
              )}
              <h3>重大軍情與敵國行動</h3>
              <div className="summary-list">
                {summary.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
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
              <h2 id="roster-title">天下武將 · 全{game.officers.length}名</h2>
              <button autoFocus onClick={() => setAllOfficers(false)}>
                關閉
              </button>
            </div>
            <input
              aria-label="天下武將搜尋"
              placeholder="搜尋姓名"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
            />
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
                          (o) =>
                            o.cityId === c.id &&
                            !o.retired &&
                            (!rosterSearch || o.name.includes(rosterSearch)),
                        )}
                      />
                    </div>
                  ))}
                {!f.id && (
                  <OfficerPanel
                    officers={game.officers.filter(
                      (o) => !o.factionId && o.discovered && !o.retired,
                    )}
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
                ? "全境旌旗盡歸麾下，亂世終得一統。"
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
            <p>
              此操作會刪除目前V3進度並返回劇本選擇。原V2／V1安全備份仍會保留；建議先匯出備份。
            </p>
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
