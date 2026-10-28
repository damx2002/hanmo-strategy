import type { TacticalState, Unit } from "./types";
import { T } from "./tacticalBalance";
import { distance } from "./movement";
export function inRange(b: TacticalState, u: Unit, v: Unit) {
  const d = distance(u, v);
  return u.type === "archer"
    ? d >= 2 && d <= (b.map[u.y][u.x] === "hill" ? 3 : 2)
    : d === 1;
}
export function canAttack(b: TacticalState, u: Unit, v: Unit) {
  return (
    u.troops > 0 &&
    v.troops > 0 &&
    u.side !== v.side &&
    !u.attacked &&
    inRange(b, u, v)
  );
}
export function estimateDamage(
  b: TacticalState,
  u: Unit,
  v: Unit,
  variation = 1,
) {
  const general = b.commanders.find((o) => o.id === u.commanderId),
    guard = b.commanders.find((o) => o.id === v.commanderId);
  const at =
    u.troops *
    T.damageScale *
    T.attack[u.type] *
    (1 +
      (general?.leadership ?? T.basicAbility) * T.leadership +
      (general?.strength ?? T.basicAbility) * T.strength) *
    (1 + b.training[u.side] * T.training);
  let de =
    T.defense[v.type] *
    T.terrain[b.map[v.y][v.x]] *
    (1 + (guard?.leadership ?? T.basicAbility) * T.leadership);
  if (v.side === "defender" && ["city", "gate"].includes(b.map[v.y][v.x]))
    de *= 1 + b.defense * T.cityDefense;
  if (v.effects.includes("guarded")) de *= T.guard;
  const charge =
    u.type === "cavalry" && u.moved && b.map[u.y][u.x] === "plain"
      ? T.charge
      : 1;
  const shot =
    u.type === "archer" && b.map[u.y][u.x] === "hill" ? T.hillShot : 1;
  return Math.min(
    v.troops,
    Math.max(T.finishCap, Math.ceil(v.troops * T.maxLoss)),
    Math.max(1, Math.floor((at * charge * shot * variation) / de)),
  );
}
export function fireReason(b: TacticalState, u: Unit, v?: Unit): string {
  if (u.troops <= 0 || u.attacked) return "部隊已行動或已潰滅";
  if (
    (b.commanders.find((o) => o.id === u.commanderId)?.intelligence ??
      T.basicAbility) < T.fireIntelligence
  )
    return `主將智力須達 ${T.fireIntelligence}`;
  if (b.fireUsed[u.side] >= T.fireLimit) return "本軍本戰火計次數已用盡";
  if (v && (v.troops <= 0 || v.side === u.side || distance(u, v) > T.fireRange))
    return "目標不在火計三格範圍內";
  if (
    !v &&
    !b.units.some(
      (v) => v.troops > 0 && v.side !== u.side && distance(u, v) <= T.fireRange,
    )
  )
    return "三格內沒有敵軍";
  return "";
}
export function fireChance(b: TacticalState, u: Unit, v: Unit) {
  const intelligence =
    b.commanders.find((o) => o.id === u.commanderId)?.intelligence ??
    T.basicAbility;
  return Math.min(
    T.fireMaxChance,
    T.fireBase +
      intelligence * T.fireIntelligenceScale +
      (b.map[v.y][v.x] === "forest" ? T.fireForest : 0),
  );
}
