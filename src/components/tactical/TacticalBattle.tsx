import { useEffect, useRef, useState } from "react";
import type { GameState } from "../../engine/types";
import type {
  TacticalAction,
  TacticalState,
} from "../../engine/tactical/types";
import { TacticalMap } from "./TacticalMap";
import { UnitPanel } from "./UnitPanel";
export function TacticalBattle({
  state,
  battle,
  onAction,
  onEnemy,
  onFinish,
}: {
  state: GameState;
  battle: TacticalState;
  onAction: (a: TacticalAction) => void;
  onEnemy: () => void;
  onFinish: () => void;
}) {
  const [selected, setSelected] = useState(
      battle.units.find((u) => u.side === "attacker" && u.troops > 0)?.id ?? "",
    ),
    [mode, setMode] = useState<"move" | "attack" | "fire">("move"),
    [retreat, setRetreat] = useState(false),
    [skip, setSkip] = useState(false);
  const lastEnd = useRef(0);
  function endPhase() {
    const now = Date.now();
    if (now - lastEnd.current < 400) return;
    lastEnd.current = now;
    onAction({ type: "endPhase" });
  }
  const unit = battle.units.find((u) => u.id === selected && u.troops > 0),
    active = battle.status === "active",
    locked = !active || battle.phase !== "attacker";
  useEffect(() => {
    if (!active || battle.phase !== "defender") return;
    const timer = setTimeout(onEnemy, skip ? 0 : 350);
    return () => clearTimeout(timer);
  }, [active, battle.phase, battle.turn, onEnemy, skip]);
  const source = state.cities.find((c) => c.id === battle.sourceId)!,
    target = state.cities.find((c) => c.id === battle.targetId)!;
  const count = (side: "attacker" | "defender") =>
    battle.units
      .filter((u) => u.side === side)
      .reduce((n, u) => n + u.troops, 0)
      .toLocaleString("zh-TW");
  function cell(x: number, y: number) {
    if (locked) return;
    const clicked = battle.units.find(
      (u) => u.x === x && u.y === y && u.troops > 0,
    );
    if (clicked?.side === "attacker") {
      setSelected(clicked.id);
      setMode("move");
      return;
    }
    if (!unit) return;
    if (mode === "move") onAction({ type: "move", unitId: unit.id, x, y });
    else if (clicked)
      onAction({ type: mode, unitId: unit.id, targetId: clicked.id });
  }
  return (
    <main className="tactical-screen">
      <section className="battle-heading">
        <div>
          <small>親 自 指 揮 · 攻 城 戰</small>
          <h1>
            {source.name} → {target.name}
          </h1>
          <p>
            第 {battle.turn}／16 回合 ·{" "}
            {battle.phase === "attacker" ? "我軍階段" : "敵軍階段"} · 我軍{" "}
            {count("attacker")} ／ 守軍 {count("defender")}
          </p>
        </div>
        <label className="animation-toggle">
          <input
            type="checkbox"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
          />
          略過效果
        </label>
      </section>
      <div className="tactical-layout">
        <TacticalMap
          battle={battle}
          selected={unit}
          mode={mode}
          onCell={cell}
        />
        <div>
          <UnitPanel
            battle={battle}
            unit={unit}
            mode={mode}
            setMode={setMode}
            onWait={() => unit && onAction({ type: "wait", unitId: unit.id })}
            onGate={() => unit && onAction({ type: "gate", unitId: unit.id })}
            locked={locked}
          />
          <div className="battle-phase-buttons">
            <button className="primary" disabled={locked} onClick={endPhase}>
              {battle.phase === "defender" ? "守軍行動中…" : "結束階段"}
            </button>
            <button
              disabled={locked}
              className="danger-button"
              onClick={() => setRetreat(true)}
            >
              撤退
            </button>
          </div>
          {!active && (
            <section className="tactical-outcome" role="status">
              <h2>
                {battle.status === "attackerWon" ? "攻城成功" : "攻城失敗"}
              </h2>
              <p>
                {battle.reason === "retreat"
                  ? "已下令撤退，生還部隊返回原城。"
                  : battle.reason === "limit"
                    ? "守軍堅守至回合上限。"
                    : battle.reason === "occupation"
                      ? "內城已控制，守軍撤退。"
                      : "敵我兵力已分勝負。"}
              </p>
              <button className="primary full" onClick={onFinish}>
                結算戰果 · 返回戰略地圖
              </button>
            </section>
          )}
        </div>
      </div>
      <section
        className={`tactical-feedback ${battle.effect?.kind === "fire" ? "effect-fire" : ""} ${skip ? "" : "with-effects"}`}
        key={`${battle.turn}-${battle.events.length}-${battle.seed}`}
        role="status"
      >
        {battle.effect?.text ??
          "選取部隊下令；每隊每階段可移動一次、攻擊或火計一次。"}
      </section>
      <details className="tactical-events" open>
        <summary>戰地紀事 · 已自動儲存</summary>
        <div>
          {battle.events.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      </details>
      {retreat && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="retreat-title"
          >
            <h2 id="retreat-title">確認撤退？</h2>
            <p>
              此次攻城將判定失敗，生還士兵回到{source.name}
              。已耗軍糧與指令不會退回。
            </p>
            <div className="button-row">
              <button autoFocus onClick={() => setRetreat(false)}>
                繼續作戰
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  setRetreat(false);
                  onAction({ type: "retreat" });
                }}
              >
                確認撤退
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
