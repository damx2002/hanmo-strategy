import type { TacticalState, Unit } from "../../engine/tactical/types";
import { fireReason } from "../../engine/tactical/damage";
import { distance } from "../../engine/tactical/movement";
import {
  T,
  troopNames,
  terrainNames,
} from "../../engine/tactical/tacticalBalance";
export function UnitPanel({
  battle,
  unit,
  mode,
  setMode,
  onWait,
  onGate,
  locked,
}: {
  battle: TacticalState;
  unit?: Unit;
  mode: "move" | "attack" | "fire";
  setMode: (mode: "move" | "attack" | "fire") => void;
  onWait: () => void;
  onGate: () => void;
  locked: boolean;
}) {
  const unavailable =
    locked ||
    !unit ||
    unit.side !== "attacker" ||
    unit.troops <= 0 ||
    unit.attacked;
  const fire = unit ? fireReason(battle, unit) : "請先選取我軍部隊";
  return (
    <section className="tactical-unit-panel">
      <h3>
        {unit
          ? `${troopNames[unit.type]} · ${unit.side === "attacker" ? "攻軍" : "守軍"}`
          : "請點選一支我軍部隊"}
      </h3>
      {unit && (
        <p className="unit-numbers">
          兵力 {unit.troops.toLocaleString("zh-TW")}／
          {unit.maxTroops.toLocaleString("zh-TW")}
          <br />
          {terrainNames[battle.map[unit.y][unit.x]]} · 移動{" "}
          {T.movement[unit.type]} ·{" "}
          {unit.attacked
            ? "本階段已行動"
            : unit.moved
              ? "已移動，可攻擊或待機"
              : "待命"}
        </p>
      )}
      <div className="tactical-commands">
        <button
          className={mode === "move" ? "chosen" : ""}
          disabled={unavailable || unit?.moved}
          onClick={() => setMode("move")}
        >
          移動
        </button>
        <button
          className={mode === "attack" ? "chosen" : ""}
          disabled={unavailable}
          onClick={() => setMode("attack")}
        >
          攻擊
        </button>
        <button
          className={mode === "fire" ? "chosen" : ""}
          disabled={unavailable || !!fire}
          title={fire || "選擇三格內敵軍；森林成功率更高"}
          onClick={() => setMode("fire")}
        >
          火計
        </button>
        <button disabled={unavailable} onClick={onWait}>
          待機
        </button>
        <button
          disabled={
            unavailable ||
            unit?.type === "archer" ||
            battle.gate.hp === 0 ||
            !unit ||
            distance(unit, battle.gate) !== 1
          }
          onClick={onGate}
        >
          破城
        </button>
      </div>
      <p className="hint">
        {fire ||
          `火計剩餘 ${T.fireLimit - battle.fireUsed.attacker}／${T.fireLimit} 次；請點選紅框敵軍。`}
      </p>
      <p className="hint">
        城門耐久 {battle.gate.hp.toLocaleString("zh-TW")}／
        {battle.gate.maxHp.toLocaleString("zh-TW")} · 內城駐守{" "}
        {battle.occupation}／2 階段。城門未破前攻軍不能進入城區。
      </p>
    </section>
  );
}
