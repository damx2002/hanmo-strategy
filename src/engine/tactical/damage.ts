import type { TacticalState, Unit, TroopType } from "./types";
import { T } from "./tacticalBalance";
import { distance } from "./movement";
export const matchupMultiplier = (attacker: TroopType, target: TroopType) =>
  T.matchup[attacker][target];
export const matchupRelation = (multiplier: number) =>
  multiplier > 1
    ? ("advantage" as const)
    : multiplier < 1
      ? ("disadvantage" as const)
      : ("neutral" as const);
export const relationNames = {
  advantage: "兵種優勢",
  disadvantage: "兵種劣勢",
  neutral: "兵種中立",
};
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
  const matchup = matchupMultiplier(u.type, v.type);
  return Math.min(
    v.troops,
    Math.max(
      T.finishCap,
      Math.ceil(
        Math.min(
          v.troops * T.absoluteMaxLoss,
          Math.min(u.troops, v.troops) * T.maxLoss * matchup,
        ),
      ),
    ),
    Math.max(1, Math.floor((at * charge * shot * variation * matchup) / de)),
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

export function damagePreview(b: TacticalState, u: Unit, v: Unit) {
  const multiplier = matchupMultiplier(u.type, v.type);
  return {
    min: estimateDamage(b, u, v, T.randomMin),
    max: estimateDamage(b, u, v, T.randomMin + T.randomRange),
    multiplier,
    relation: matchupRelation(multiplier),
  };
}
