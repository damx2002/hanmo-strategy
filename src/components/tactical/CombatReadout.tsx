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
  const enemies =
    last?.side === "defender"
      ? list.filter((f) => f.side === "defender" && f.turn === last.turn)
      : [];
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
                </li>
              );
            })}
          </ul>
        </>
      ) : enemies.length ? (
        <>
          <strong className="enemy-round-title">
            敵軍回擊 · 第 {last!.turn} 回合
          </strong>
          <ul className="enemy-results">
            {enemies.map((f) => {
              const source = battle.units.find((u) => u.id === f.attackerId)!,
                target = battle.units.find((u) => u.id === f.targetId);
              return (
                <li key={f.sequence} data-feedback-seq={f.sequence}>
                  {troopNames[source.type]} →{" "}
                  {target ? `我軍${troopNames[target.type]}` : "城門"} −
                  {f.casualties.toLocaleString("zh-TW")} ·{" "}
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
