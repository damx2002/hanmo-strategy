import { playerSide, live } from "../../engine/tactical/control";
import { useEffect, useRef, useState } from "react";
import type { GameState } from "../../engine/types";
import type {
  TacticalAction,
  TacticalState,
} from "../../engine/tactical/types";
import { TacticalMap } from "./TacticalMap";
import { useCombatFeedback } from "./useCombatFeedback";
import { selectionAfterUpdate } from "./selection";
import { nextTacticalUnit } from "../../engine/tactical/feedback";
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
  const [selected, setSelected] = useState(nextTacticalUnit(battle, "")),
    [mode, setMode] = useState<"move" | "attack" | "fire">("move"),
    [retreat, setRetreat] = useState(false),
    [skip, setSkip] = useState(false);
  const side = playerSide(battle);
  const visibleFeedback = useCombatFeedback(battle.combatFeedback, skip);
  const previous = useRef<{ id: string; attacked: boolean } | undefined>(
    undefined,
  );
  useEffect(() => {
    const next = selectionAfterUpdate(battle, selected, previous.current);
    const current = battle.units.find((u) => u.id === selected);
    previous.current = { id: selected, attacked: current?.attacked ?? true };
    if (next !== selected) {
      setSelected(next);
      setMode("move");
    }
  }, [battle, selected]);
  // A new phase shows the actual enemy results before the player asks for a new preview.
  useEffect(() => {
    setMode("move");
  }, [battle.phase]);
  const lastEnd = useRef(0);
  function endPhase() {
    const now = Date.now();
    if (now - lastEnd.current < 400) return;
    lastEnd.current = now;
    onAction({ type: "endPhase" });
  }
  const unit = battle.units.find((u) => u.id === selected && live(u)),
    active = battle.status === "active",
    locked = !active || battle.phase !== side;
  useEffect(() => {
    if (!active || battle.phase === side) return;
    const timer = setTimeout(onEnemy, skip ? 0 : 350);
    return () => clearTimeout(timer);
  }, [active, battle.phase, battle.turn, onEnemy, skip, side]);
  const source = state.cities.find((c) => c.id === battle.sourceId)!,
    target = state.cities.find((c) => c.id === battle.targetId)!;
  const count = (side: "attacker" | "defender") =>
    battle.units
      .filter((u) => u.side === side)
      .reduce((n, u) => n + u.troops, 0)
      .toLocaleString("zh-TW");
  function cell(x: number, y: number) {
    if (locked) return;
    const clicked = battle.units.find((u) => u.x === x && u.y === y && live(u));
    if (clicked?.side === side) {
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
          <small>
            {side === "attacker"
              ? "親 自 指 揮 · 攻 城 戰"
              : "親 自 守 城 · 防 禦 戰"}
          </small>
          <h1>
            {source.name} → {target.name}
          </h1>
          <p>
            第 {battle.turn}／16 回合 ·{" "}
            {battle.phase === side ? "我軍階段" : "敵軍階段"} · 我軍{" "}
            {count(side)} ／ 敵軍{" "}
            {count(side === "attacker" ? "defender" : "attacker")}
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
          feedback={visibleFeedback}
          skip={skip}
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
          <p className="phase-ready" role="status">
            {battle.units
              .filter((u) => u.side === side && live(u))
              .every((u) => u.attacked)
              ? "全軍已行動，可結束階段"
              : "選取部隊下令；不會自動結束階段。"}
          </p>
          <div className="battle-phase-buttons">
            <button className="primary" disabled={locked} onClick={endPhase}>
              {battle.phase !== side ? "敵軍行動中…" : "結束階段"}
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
                {(battle.status === "attackerWon") === (side === "attacker")
                  ? side === "attacker"
                    ? "攻城成功"
                    : "守城成功"
                  : side === "attacker"
                    ? "攻城失敗"
                    : "守城失敗"}
              </h2>
              <p>
                {battle.reason === "retreat"
                  ? "已下令撤退，生還部隊依戰果返回友城。"
                  : battle.reason === "limit"
                    ? "守軍堅守至回合上限。"
                    : battle.reason === "occupation"
                      ? "內城已控制，守軍撤退。"
                      : battle.reason === "morale"
                        ? "一方部隊士氣潰退，生還兵依戰果回收。"
                        : "敵我兵力已分勝負。"}
              </p>
              <button className="primary full" onClick={onFinish}>
                結算戰果 · 返回戰略地圖
              </button>
            </section>
          )}
        </div>
      </div>
      <details className="tactical-events">
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
              此次{side === "attacker" ? "攻城" : "守城"}
              將判定失敗，生還士兵回到合法友城；出發地為
              {side === "attacker" ? source.name : target.name}
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
