import type { TacticalState, Unit } from "../../engine/tactical/types";
import {
  canAttack,
  damagePreview,
  relationNames,
} from "../../engine/tactical/damage";
import { troopNames } from "../../engine/tactical/tacticalBalance";
export function CombatReadout({
  battle,
  selected,
  mode,
}: {
  battle: TacticalState;
  selected?: Unit;
  mode: "move" | "attack" | "fire";
}) {
  const list = battle.combatFeedback ?? [],
    last = list.at(-1);
  const previews =
    battle.phase === "attacker" && mode === "attack" && selected
      ? battle.units.filter((v) => canAttack(battle, selected, v))
      : [];
  const enemyPhase = (last?.phase ?? last?.side) === "defender";
  const exchanges = last
    ? list.filter((f) =>
        enemyPhase
          ? (f.phase ?? f.side) === "defender" && f.turn === last.turn
          : f.sequence === last.sequence ||
            (last.kind === "retaliation" && f.sequence === last.parentSequence),
      )
    : [];
  const total = (side: "attacker" | "defender") =>
    exchanges
      .filter((f) => f.kind !== "gate" && f.side !== side)
      .reduce((n, f) => n + f.casualties, 0)
      .toLocaleString("zh-TW");
  return (
    <div
      className="combat-live"
      role="status"
      aria-live="polite"
      aria-label="即時戰況"
    >
      {previews.length ? (
        <>
          <strong className="preview-heading">
            攻擊預覽 · 正式攻擊才消耗亂數
          </strong>
          <ul>
            {previews.map((v) => {
              const p = damagePreview(battle, selected!, v);
              return (
                <li key={v.id} data-preview-target={v.id}>
                  敵{troopNames[v.type]}：{p.min.toLocaleString("zh-TW")}–
                  {p.max.toLocaleString("zh-TW")} 傷亡 ·{" "}
                  {relationNames[p.relation]} ×{p.multiplier.toFixed(2)}
                  <span className="counter-preview">
                    {" "}
                    · 遭反擊 {p.counterMin.toLocaleString("zh-TW")}–
                    {p.counterMax.toLocaleString("zh-TW")}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : exchanges.length ? (
        <>
          <strong className="enemy-round-title">
            {enemyPhase ? "敵軍回擊" : "本次接戰"} · 第 {last!.turn} 回合 · 我損{" "}
            {total("attacker")}／敵損 {total("defender")}
          </strong>
          <ul className="enemy-results">
            {exchanges.map((f) => {
              const source = battle.units.find((u) => u.id === f.attackerId)!,
                target = battle.units.find((u) => u.id === f.targetId);
              return (
                <li key={f.sequence} data-feedback-seq={f.sequence}>
                  {source.side === "attacker" ? "我軍" : "敵軍"}
                  {troopNames[source.type]}
                  {f.kind === "retaliation" ? "反擊" : "攻擊"} →{" "}
                  {target
                    ? `${target.side === "attacker" ? "我軍" : "敵軍"}${troopNames[target.type]}`
                    : "城門"}{" "}
                  −{f.casualties.toLocaleString("zh-TW")} ·{" "}
                  {f.kind === "fire"
                    ? `火計${f.success ? "成功" : "失敗"}`
                    : relationNames[f.relation]}
                  {f.destroyed ? " · 潰滅" : ""}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p data-feedback-seq={last?.sequence}>
          {last?.text ??
            battle.effect?.text ??
            "步剋騎、騎剋弓、弓剋步。點選部隊，再選移動或攻擊；紅框直接顯示預估傷亡。"}
        </p>
      )}
    </div>
  );
}
